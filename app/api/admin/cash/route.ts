import { ensureDatabase } from "../../../../db/init";
import { auditGeneratedCommission, generateCommissionForAppointment } from "../../../commissions";
import { awardLoyaltyPoints } from "../../../loyalty";
import { redeemPromotion, revertPromotionUse } from "../../../promotions";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, readJson,
} from "../../../security";

type CashPayload = {
  action?: unknown;
  openingAmountCents?: unknown;
  countedCashCents?: unknown;
  countedBreakdown?: unknown;
  appointmentId?: unknown;
  amountCents?: unknown;
  tipCents?: unknown;
  method?: unknown;
  reference?: unknown;
  paymentId?: unknown;
  reason?: unknown;
  notes?: unknown;
  promoCode?: unknown;
};

const PAYMENT_METHODS = ["efectivo", "tarjeta", "transferencia", "pago_movil"] as const;

type MethodSummary = {
  method: string;
  incomeCents: number;
  tipsCents: number;
  outflowCents: number;
  netCents: number;
  transactionCount: number;
};

type SessionSummary = {
  serviceIncomeCents: number;
  productIncomeCents: number;
  tipsCents: number;
  expensesCents: number;
  refundsCents: number;
  grossIncomeCents: number;
  netIncomeCents: number;
  paymentCount: number;
  saleCount: number;
  expenseCount: number;
  refundCount: number;
  cashInflowCents: number;
  cashOutflowCents: number;
  expectedCashCents: number;
  methods: MethodSummary[];
};

function cents(value: unknown, maximum = 100_000_000) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function cashError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("idx_cash_sessions_one_open") || message.includes("UNIQUE constraint failed: cash_sessions.business_id")) {
    throw new HttpError(409, "Ya existe una caja abierta para este negocio.");
  }
  if (message.includes("payment_session_closed")) throw new HttpError(409, "La caja ya no está abierta.");
  if (message.includes("payment_appointment_invalid")) throw new HttpError(409, "La cita no admite cobros.");
  if (message.includes("payment_amount_invalid")) throw new HttpError(409, "El monto supera el saldo pendiente de la cita.");
  throw error;
}

async function buildSessionSummary(db: D1Database, businessId: string, sessionId: string, openingAmountCents: number): Promise<SessionSummary> {
  const rows = await db.prepare(`SELECT kind, method,
      COALESCE(SUM(amount_cents),0) AS amountCents, COALESCE(SUM(tip_cents),0) AS tipCents, COUNT(*) AS transactionCount
    FROM (
      SELECT 'service' AS kind, method, amount_cents, tip_cents FROM payments
        WHERE business_id = ?1 AND cash_session_id = ?2 AND status = 'completed'
      UNION ALL
      SELECT 'product' AS kind, method, total_cents AS amount_cents, tip_cents FROM product_sales
        WHERE business_id = ?1 AND cash_session_id = ?2 AND status = 'completed'
      UNION ALL
      SELECT 'expense' AS kind, method, amount_cents, 0 AS tip_cents FROM expenses
        WHERE business_id = ?1 AND cash_session_id = ?2 AND status = 'completed'
      UNION ALL
      SELECT 'refund' AS kind, method, amount_cents, 0 AS tip_cents FROM refunds
        WHERE business_id = ?1 AND cash_session_id = ?2 AND status = 'completed'
    ) GROUP BY kind, method`).bind(businessId, sessionId)
    .all<{ kind:string; method:string; amountCents:number; tipCents:number; transactionCount:number }>();

  const methodMap = new Map<string, MethodSummary>();
  const method = (name: string) => {
    const existing = methodMap.get(name);
    if (existing) return existing;
    const created: MethodSummary = { method: name, incomeCents: 0, tipsCents: 0, outflowCents: 0, netCents: 0, transactionCount: 0 };
    methodMap.set(name, created);
    return created;
  };
  const summary: SessionSummary = {
    serviceIncomeCents: 0, productIncomeCents: 0, tipsCents: 0, expensesCents: 0, refundsCents: 0,
    grossIncomeCents: 0, netIncomeCents: 0, paymentCount: 0, saleCount: 0, expenseCount: 0, refundCount: 0,
    cashInflowCents: 0, cashOutflowCents: 0, expectedCashCents: openingAmountCents, methods: [],
  };
  for (const row of rows.results ?? []) {
    const entry = method(row.method);
    entry.transactionCount += row.transactionCount;
    if (row.kind === "service" || row.kind === "product") {
      entry.incomeCents += row.amountCents;
      entry.tipsCents += row.tipCents;
      summary.tipsCents += row.tipCents;
      if (row.kind === "service") { summary.serviceIncomeCents += row.amountCents; summary.paymentCount += row.transactionCount; }
      else { summary.productIncomeCents += row.amountCents; summary.saleCount += row.transactionCount; }
      if (row.method === "efectivo") summary.cashInflowCents += row.amountCents + row.tipCents;
    } else {
      entry.outflowCents += row.amountCents;
      if (row.kind === "expense") { summary.expensesCents += row.amountCents; summary.expenseCount += row.transactionCount; }
      else { summary.refundsCents += row.amountCents; summary.refundCount += row.transactionCount; }
      if (row.method === "efectivo") summary.cashOutflowCents += row.amountCents;
    }
  }
  for (const entry of methodMap.values()) {
    entry.netCents = entry.incomeCents + entry.tipsCents - entry.outflowCents;
  }
  const order = new Map(PAYMENT_METHODS.map((name, index) => [name, index] as const));
  summary.methods = [...methodMap.values()].sort((a, b) => (order.get(a.method as typeof PAYMENT_METHODS[number]) ?? 9) - (order.get(b.method as typeof PAYMENT_METHODS[number]) ?? 9));
  summary.grossIncomeCents = summary.serviceIncomeCents + summary.productIncomeCents;
  summary.netIncomeCents = summary.grossIncomeCents + summary.tipsCents - summary.expensesCents - summary.refundsCents;
  summary.expectedCashCents = openingAmountCents + summary.cashInflowCents - summary.cashOutflowCents;
  return summary;
}

async function sessionMovements(db: D1Database, businessId: string, sessionId: string) {
  const [payments, sales, expenses, refunds] = await Promise.all([
    db.prepare(`SELECT payment.id, payment.amount_cents AS amountCents, payment.tip_cents AS tipCents,
        payment.method, payment.status, payment.reference, payment.created_at AS createdAt, payment.void_reason AS voidReason,
        client.name AS clientName, service.name AS serviceName
      FROM payments payment
      JOIN appointments appointment ON appointment.id = payment.appointment_id AND appointment.business_id = payment.business_id
      JOIN clients client ON client.id = appointment.client_id AND client.business_id = payment.business_id
      JOIN services service ON service.id = appointment.service_id AND service.business_id = payment.business_id
      WHERE payment.business_id = ? AND payment.cash_session_id = ?
      ORDER BY payment.created_at LIMIT 200`).bind(businessId, sessionId).all(),
    db.prepare(`SELECT id, receipt_number AS receiptNumber, total_cents AS totalCents, tip_cents AS tipCents, method, status, created_at AS createdAt
      FROM product_sales WHERE business_id = ? AND cash_session_id = ? ORDER BY created_at LIMIT 200`).bind(businessId, sessionId).all(),
    db.prepare(`SELECT id, category, description, amount_cents AS amountCents, method, status, created_at AS createdAt
      FROM expenses WHERE business_id = ? AND cash_session_id = ? ORDER BY created_at LIMIT 200`).bind(businessId, sessionId).all(),
    db.prepare(`SELECT id, reason, amount_cents AS amountCents, method, status, created_at AS createdAt
      FROM refunds WHERE business_id = ? AND cash_session_id = ? ORDER BY created_at LIMIT 200`).bind(businessId, sessionId).all(),
  ]);
  return {
    payments: payments.results ?? [],
    sales: sales.results ?? [],
    expenses: expenses.results ?? [],
    refunds: refunds.results ?? [],
  };
}

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("finance.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const url = new URL(request.url);
    const sessionId = cleanText(url.searchParams.get("sessionId"), 80);

    const formatCsv = url.searchParams.get("format") === "csv";
    if (sessionId || formatCsv) {
      const targetId = sessionId || (await db.prepare("SELECT id FROM cash_sessions WHERE business_id = ? AND status = 'open' LIMIT 1")
        .bind(context.businessId).first<{ id:string }>())?.id
        || (await db.prepare("SELECT id FROM cash_sessions WHERE business_id = ? ORDER BY opened_at DESC LIMIT 1")
          .bind(context.businessId).first<{ id:string }>())?.id;
      if (!targetId) throw new HttpError(404, "No hay una sesión de caja para exportar.");
      const session = await db.prepare(`SELECT session.id, session.status, session.opened_at AS openedAt, session.closed_at AS closedAt,
          session.opening_amount_cents AS openingAmountCents, session.expected_cash_cents AS expectedCashCents,
          session.counted_cash_cents AS countedCashCents, session.counted_breakdown AS countedBreakdown,
          session.closing_summary AS closingSummary, session.notes,
          opener.display_name AS openedByName, closer.display_name AS closedByName
        FROM cash_sessions session
        LEFT JOIN business_members opener ON opener.user_id = session.opened_by AND opener.business_id = session.business_id
        LEFT JOIN business_members closer ON closer.user_id = session.closed_by AND closer.business_id = session.business_id
        WHERE session.id = ? AND session.business_id = ?`).bind(targetId, context.businessId)
        .first<Record<string, unknown>>();
      if (!session) throw new HttpError(404, "Sesión de caja no encontrada.");
      let summary: SessionSummary | null = null;
      if (typeof session.closingSummary === "string" && session.closingSummary) {
        try { summary = JSON.parse(session.closingSummary) as SessionSummary; } catch { summary = null; }
      }
      if (!summary) {
        summary = await buildSessionSummary(db, context.businessId, targetId, Number(session.openingAmountCents) || 0);
      }
      const movements = await sessionMovements(db, context.businessId, targetId);
      const business = await db.prepare("SELECT currency FROM businesses WHERE id=?").bind(context.businessId).first<{ currency:string }>();
      if (formatCsv) return cashCsvResponse(session, summary, movements, business?.currency ?? "USD");
      return Response.json({ session, summary, movements, currency: business?.currency ?? "USD" },
        { headers: { "cache-control": "no-store" } });
    }

    const openSession = await db.prepare(`SELECT session.id,
        session.opened_at AS openedAt, session.opening_amount_cents AS openingAmountCents,
        session.notes, member.display_name AS openedByName
      FROM cash_sessions session
      LEFT JOIN business_members member ON member.user_id = session.opened_by
        AND member.business_id = session.business_id
      WHERE session.business_id = ? AND session.status = 'open'
      LIMIT 1`).bind(context.businessId).first<{ id:string; openedAt:string; openingAmountCents:number; notes:string; openedByName:string|null }>();
    const openSummary = openSession
      ? await buildSessionSummary(db, context.businessId, openSession.id, openSession.openingAmountCents)
      : null;
    const payments = await db.prepare(`SELECT payment.id, payment.appointment_id AS appointmentId,
        payment.cash_session_id AS cashSessionId, payment.amount_cents AS amountCents,
        payment.tip_cents AS tipCents,
        payment.method, payment.status, payment.reference, payment.created_at AS createdAt,
        payment.void_reason AS voidReason, client.name AS clientName, service.name AS serviceName
      FROM payments payment
      JOIN appointments appointment ON appointment.id = payment.appointment_id
        AND appointment.business_id = payment.business_id
      JOIN clients client ON client.id = appointment.client_id AND client.business_id = payment.business_id
      JOIN services service ON service.id = appointment.service_id AND service.business_id = payment.business_id
      WHERE payment.business_id = ?
      ORDER BY payment.created_at DESC LIMIT 60`).bind(context.businessId).all();
    const sessions = await db.prepare(`SELECT id, opened_at AS openedAt, closed_at AS closedAt,
        opening_amount_cents AS openingAmountCents, expected_cash_cents AS expectedCashCents,
        counted_cash_cents AS countedCashCents, closing_summary AS closingSummary, status, notes
      FROM cash_sessions WHERE business_id = ?
      ORDER BY opened_at DESC LIMIT 20`).bind(context.businessId).all();
    const business = await db.prepare("SELECT currency FROM businesses WHERE id=?").bind(context.businessId).first<{ currency:string }>();
    return Response.json({
      openSession: openSession ? {
        ...openSession,
        totalPaymentsCents: (openSummary?.grossIncomeCents ?? 0) + (openSummary?.tipsCents ?? 0),
        cashPaymentsCents: (openSummary?.cashInflowCents ?? 0) - (openSummary?.cashOutflowCents ?? 0),
        paymentCount: openSummary?.paymentCount ?? 0,
      } : null,
      openSummary,
      payments: payments.results ?? [],
      sessions: sessions.results ?? [],
      currency: business?.currency ?? "USD",
      canManage: context.role === "owner" || context.role === "admin",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("finance.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<CashPayload>(request);
    const action = cleanText(body.action, 24);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `finance-write:${context.user.userId}`, 40, 60 * 1000);

    if (action === "open") {
      const openingAmountCents = cents(body.openingAmountCents);
      if (openingAmountCents === null) throw new HttpError(400, "El fondo inicial no es válido.");
      const id = crypto.randomUUID();
      const openedAt = new Date().toISOString();
      const notes = cleanText(body.notes, 500);
      try {
        await db.batch([
          db.prepare(`INSERT INTO cash_sessions
            (id,business_id,opened_by,opened_at,opening_amount_cents,status,notes)
            VALUES (?,?,?,?,?,'open',?)`)
            .bind(id, context.businessId, context.user.userId, openedAt, openingAmountCents, notes),
          db.prepare(`INSERT INTO audit_logs
            (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
            VALUES (?,?,?,?, 'cash.opened','cash_session',?,?,?)`)
            .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email,
              id, JSON.stringify({ openingAmountCents }), openedAt),
        ]);
      } catch (error) {
        cashError(error);
      }
      return Response.json({ session: { id, openedAt, openingAmountCents, notes } },
        { status: 201, headers: { "cache-control": "no-store" } });
    }

    if (action === "payment") {
      const appointmentId = cleanText(body.appointmentId, 80);
      const amountCents = cents(body.amountCents);
      const tipCents = cents(body.tipCents ?? 0);
      const method = cleanText(body.method, 24);
      const reference = cleanText(body.reference, 120);
      if (!appointmentId || amountCents === null || amountCents === 0 || tipCents === null ||
        !PAYMENT_METHODS.includes(method as typeof PAYMENT_METHODS[number])) {
        throw new HttpError(400, "Revisa el monto y el método de pago.");
      }
      const session = await db.prepare("SELECT id FROM cash_sessions WHERE business_id = ? AND status = 'open'")
        .bind(context.businessId).first<{ id:string }>();
      if (!session) throw new HttpError(409, "Abre la caja antes de registrar cobros.");
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      try {
        await db.batch([
          db.prepare(`INSERT INTO payments
            (id,business_id,appointment_id,cash_session_id,amount_cents,tip_cents,method,status,reference,created_by,created_at)
            VALUES (?,?,?,?,?,?,?,'completed',?,?,?)`)
            .bind(id, context.businessId, appointmentId, session.id, amountCents, tipCents, method,
              reference, context.user.userId, createdAt),
          db.prepare(`INSERT INTO audit_logs
            (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
            VALUES (?,?,?,?, 'payment.recorded','payment',?,?,?)`)
            .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email,
              id, JSON.stringify({ appointmentId, amountCents, tipCents, method }), createdAt),
        ]);
      } catch (error) {
        cashError(error);
      }
      const totals = await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS paidCents
        FROM payments WHERE business_id = ? AND appointment_id = ? AND status = 'completed'`)
        .bind(context.businessId, appointmentId).first<{ paidCents:number }>();
      const commission = await generateCommissionForAppointment(db, context.businessId, appointmentId);
      if (commission?.created) await auditGeneratedCommission(db, context.businessId, context.user, commission);
      const appointmentClient = await db.prepare("SELECT client_id AS clientId FROM appointments WHERE id=? AND business_id=?")
        .bind(appointmentId, context.businessId).first<{ clientId:string }>();
      if (appointmentClient?.clientId) {
        await awardLoyaltyPoints(db, context.businessId, appointmentClient.clientId, amountCents, "Puntos por pago de cita", context.user.userId);
      }
      return Response.json({
        payment: { id, appointmentId, cashSessionId: session.id, amountCents, tipCents, method, status: "completed", reference, createdAt, voidReason: "" },
        paidCents: totals?.paidCents ?? amountCents,
      }, { status: 201, headers: { "cache-control": "no-store" } });
    }

    if (action === "apply_promo") {
      const appointmentId = cleanText(body.appointmentId, 80);
      const promoCode = cleanText(body.promoCode, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (!appointmentId || promoCode.length < 2) throw new HttpError(400, "Indica la cita y el código promocional.");
      const appointment = await db.prepare(`SELECT appointment.id, appointment.total_cents AS totalCents, appointment.status,
          COALESCE((SELECT SUM(payment.amount_cents) FROM payments payment
            WHERE payment.business_id = appointment.business_id AND payment.appointment_id = appointment.id
              AND payment.status='completed'), 0) AS paidCents
        FROM appointments appointment WHERE appointment.id = ? AND appointment.business_id = ?`)
        .bind(appointmentId, context.businessId)
        .first<{ id:string; totalCents:number; status:string; paidCents:number }>();
      if (!appointment) throw new HttpError(404, "Cita no encontrada.");
      if (["cancelada", "no_asistio"].includes(appointment.status)) throw new HttpError(409, "La cita no admite descuentos.");
      const remaining = appointment.totalCents - appointment.paidCents;
      if (remaining <= 0) throw new HttpError(409, "La cita ya está pagada por completo.");
      const promo = await redeemPromotion(db, context.businessId, promoCode, appointment.totalCents, remaining);
      const discountCents = promo.discountCents;
      const newTotalCents = appointment.totalCents - discountCents;
      const now = new Date().toISOString();
      const updated = await db.prepare(`UPDATE appointments SET total_cents = ?
        WHERE id = ? AND business_id = ? AND total_cents = ? RETURNING id`)
        .bind(newTotalCents, appointmentId, context.businessId, appointment.totalCents).first<{ id:string }>();
      if (!updated) {
        await revertPromotionUse(db, context.businessId, promo.id);
        throw new HttpError(409, "La cita cambió mientras aplicábamos el código. Intenta de nuevo.");
      }
      await db.prepare(`INSERT INTO audit_logs
        (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
        VALUES (?,?,?,?, 'promotion.redeemed','appointment',?,?,?)`)
        .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email,
          appointmentId, JSON.stringify({ promoId: promo.id, code: promo.code, discountCents, newTotalCents }), now).run();
      return Response.json({
        appointmentId, promoName: promo.name, code: promo.code,
        discountCents, totalCents: newTotalCents, paidCents: appointment.paidCents,
      }, { headers: { "cache-control": "no-store" } });
    }

    throw new HttpError(400, "Acción de caja no válida.");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("finance.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<CashPayload>(request);
    const action = cleanText(body.action, 24);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `finance-write:${context.user.userId}`, 40, 60 * 1000);

    if (action === "close") {
      const countedCashCents = cents(body.countedCashCents);
      if (countedCashCents === null) throw new HttpError(400, "El efectivo contado no es válido.");
      let countedBreakdown = "";
      if (body.countedBreakdown !== undefined && body.countedBreakdown !== null) {
        if (typeof body.countedBreakdown !== "object" || Array.isArray(body.countedBreakdown)) {
          throw new HttpError(400, "El conteo por denominación no es válido.");
        }
        const entries = Object.entries(body.countedBreakdown as Record<string, unknown>).filter(([, count]) => Number(count) > 0);
        if (entries.length > 24) throw new HttpError(400, "El conteo por denominación no es válido.");
        const normalized: Record<string, number> = {};
        for (const [denomination, count] of entries) {
          const denominationCents = Number(denomination);
          const parsedCount = Number(count);
          if (!Number.isSafeInteger(denominationCents) || denominationCents <= 0 || denominationCents > 100_000_00 ||
            !Number.isSafeInteger(parsedCount) || parsedCount < 0 || parsedCount > 100_000) {
            throw new HttpError(400, "El conteo por denominación no es válido.");
          }
          normalized[String(denominationCents)] = parsedCount;
        }
        const breakdownTotal = Object.entries(normalized).reduce((total, [denomination, count]) => total + Number(denomination) * count, 0);
        if (breakdownTotal !== countedCashCents) throw new HttpError(400, "El conteo por denominación no coincide con el total contado.");
        countedBreakdown = JSON.stringify(normalized);
      }
      const session = await db.prepare(`SELECT id, opening_amount_cents AS openingAmountCents
        FROM cash_sessions WHERE business_id = ? AND status = 'open'`)
        .bind(context.businessId).first<{ id:string; openingAmountCents:number }>();
      if (!session) throw new HttpError(409, "No hay una caja abierta.");
      const summary = await buildSessionSummary(db, context.businessId, session.id, session.openingAmountCents);
      const expectedCashCents = summary.expectedCashCents;
      const closedAt = new Date().toISOString();
      const notes = cleanText(body.notes, 500);
      const closingSummary = JSON.stringify(summary);
      const [closed] = await db.batch<{ id:string }>([
        db.prepare(`UPDATE cash_sessions SET status = 'closed', closed_by = ?,
            closed_at = ?, expected_cash_cents = ?, counted_cash_cents = ?,
            counted_breakdown = ?, closing_summary = ?,
            notes = CASE WHEN ? = '' THEN notes WHEN notes = '' THEN ? ELSE notes || char(10) || ? END
          WHERE id = ? AND business_id = ? AND status = 'open' RETURNING id`)
          .bind(context.user.userId, closedAt, expectedCashCents, countedCashCents,
            countedBreakdown, closingSummary,
            notes, notes, notes, session.id, context.businessId),
        db.prepare(`INSERT INTO audit_logs
          (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
          SELECT ?,?,?,?, 'cash.closed','cash_session',?,?,?
          WHERE EXISTS (SELECT 1 FROM cash_sessions
            WHERE id = ? AND business_id = ? AND closed_at = ?)`)
          .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email,
            session.id, JSON.stringify({ expectedCashCents, countedCashCents,
              differenceCents: countedCashCents - expectedCashCents }), closedAt,
            session.id, context.businessId, closedAt),
      ]);
      if (!(closed.results ?? []).length) throw new HttpError(409, "La caja ya había sido cerrada.");
      return Response.json({ id: session.id, expectedCashCents, countedCashCents,
        differenceCents: countedCashCents - expectedCashCents, summary }, { headers: { "cache-control": "no-store" } });
    }

    if (action === "void") {
      const paymentId = cleanText(body.paymentId, 80);
      const reason = cleanText(body.reason, 180);
      if (!paymentId || !reason) throw new HttpError(400, "Indica el motivo de la anulación.");
      const payment = await db.prepare(`SELECT payment.id, payment.appointment_id AS appointmentId,
          payment.amount_cents AS amountCents, session.status AS sessionStatus
        FROM payments payment JOIN cash_sessions session
          ON session.id = payment.cash_session_id AND session.business_id = payment.business_id
        WHERE payment.id = ? AND payment.business_id = ? AND payment.status = 'completed'`)
        .bind(paymentId, context.businessId)
        .first<{ id:string;appointmentId:string;amountCents:number;sessionStatus:string }>();
      if (!payment) throw new HttpError(404, "Cobro no encontrado.");
      if (payment.sessionStatus !== "open") throw new HttpError(409, "No puedes anular movimientos de una caja cerrada.");
      const voidedAt = new Date().toISOString();
      const [voided] = await db.batch<{ id:string }>([
        db.prepare(`UPDATE payments SET status = 'voided', voided_by = ?,
            voided_at = ?, void_reason = ? WHERE id = ? AND business_id = ? AND status = 'completed'
            AND EXISTS (SELECT 1 FROM cash_sessions session
              WHERE session.id = payments.cash_session_id AND session.business_id = payments.business_id
                AND session.status = 'open')
            RETURNING id`)
          .bind(context.user.userId, voidedAt, reason, paymentId, context.businessId),
        db.prepare(`INSERT INTO audit_logs
          (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
          SELECT ?,?,?,?, 'payment.voided','payment',?,?,?
          WHERE EXISTS (SELECT 1 FROM payments
            WHERE id = ? AND business_id = ? AND voided_at = ?)`)
          .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email,
            paymentId, JSON.stringify({ appointmentId: payment.appointmentId,
              amountCents: payment.amountCents, reason }), voidedAt,
            paymentId, context.businessId, voidedAt),
      ]);
      if (!(voided.results ?? []).length) throw new HttpError(409, "El cobro ya no se puede anular.");
      const totals = await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS paidCents
        FROM payments WHERE business_id = ? AND appointment_id = ? AND status = 'completed'`)
        .bind(context.businessId, payment.appointmentId).first<{ paidCents:number }>();
      return Response.json({ id: paymentId, appointmentId: payment.appointmentId,
        paidCents: totals?.paidCents ?? 0 }, { headers: { "cache-control": "no-store" } });
    }

    throw new HttpError(400, "Acción de caja no válida.");
  } catch (error) {
    return errorResponse(error);
  }
}

function cashCsvResponse(
  session: Record<string, unknown>,
  summary: SessionSummary,
  movements: { payments: unknown[]; sales: unknown[]; expenses: unknown[]; refunds: unknown[] },
  currency: string,
) {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows: string[][] = [
    ["seccion", "concepto", "detalle", "monto_centavos", "metodo", "estado", "fecha"],
    ["sesion", "estado", String(session.status ?? ""), "", "", String(session.status ?? ""), String(session.openedAt ?? "")],
    ["sesion", "fondo_inicial", "", String(session.openingAmountCents ?? 0), "efectivo", "", String(session.openedAt ?? "")],
    ["sesion", "efectivo_esperado", "", String(session.expectedCashCents ?? summary.expectedCashCents), "efectivo", "", String(session.closedAt ?? "")],
    ["sesion", "efectivo_contado", "", String(session.countedCashCents ?? ""), "efectivo", "", String(session.closedAt ?? "")],
    ["resumen", "servicios", "", String(summary.serviceIncomeCents), "", "", ""],
    ["resumen", "productos", "", String(summary.productIncomeCents), "", "", ""],
    ["resumen", "propinas", "", String(summary.tipsCents), "", "", ""],
    ["resumen", "gastos", "", String(summary.expensesCents), "", "", ""],
    ["resumen", "reembolsos", "", String(summary.refundsCents), "", "", ""],
    ["resumen", "neto", "", String(summary.netIncomeCents), "", "", ""],
    ...summary.methods.map((item) => ["metodo", item.method, `${item.transactionCount} movimientos`, String(item.netCents), item.method, "", ""]),
    ...movements.payments.map((item) => {
      const row = item as Record<string, unknown>;
      return ["cobro", String(row.clientName ?? ""), String(row.serviceName ?? ""), String(row.amountCents ?? 0), String(row.method ?? ""), String(row.status ?? ""), String(row.createdAt ?? "")];
    }),
    ...movements.sales.map((item) => {
      const row = item as Record<string, unknown>;
      return ["venta", String(row.receiptNumber ?? ""), "", String(row.totalCents ?? 0), String(row.method ?? ""), String(row.status ?? ""), String(row.createdAt ?? "")];
    }),
    ...movements.expenses.map((item) => {
      const row = item as Record<string, unknown>;
      return ["gasto", String(row.category ?? ""), String(row.description ?? ""), String(row.amountCents ?? 0), String(row.method ?? ""), String(row.status ?? ""), String(row.createdAt ?? "")];
    }),
    ...movements.refunds.map((item) => {
      const row = item as Record<string, unknown>;
      return ["reembolso", String(row.reason ?? ""), "", String(row.amountCents ?? 0), String(row.method ?? ""), String(row.status ?? ""), String(row.createdAt ?? "")];
    }),
  ];
  const csv = `\uFEFF${rows.map((values) => values.map(cell).join(",")).join("\r\n")}\r\n`;
  const stamp = String(session.openedAt ?? "caja").slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="caja-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-corteza-currency": currency,
    },
  });
}
