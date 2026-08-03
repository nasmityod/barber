import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, readJson,
} from "../../../security";

type CashPayload = {
  action?: unknown;
  openingAmountCents?: unknown;
  countedCashCents?: unknown;
  appointmentId?: unknown;
  amountCents?: unknown;
  tipCents?: unknown;
  method?: unknown;
  reference?: unknown;
  paymentId?: unknown;
  reason?: unknown;
  notes?: unknown;
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

export async function GET() {
  try {
    const context = await getAdminContext("finance.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const openSession = await db.prepare(`SELECT session.id,
        session.opened_at AS openedAt, session.opening_amount_cents AS openingAmountCents,
        session.notes, member.display_name AS openedByName,
        COALESCE((SELECT SUM(payment.amount_cents + payment.tip_cents) FROM payments payment
          WHERE payment.cash_session_id = session.id AND payment.business_id = session.business_id
            AND payment.status = 'completed'), 0)
          + COALESCE((SELECT SUM(sale.total_cents + sale.tip_cents) FROM product_sales sale
            WHERE sale.cash_session_id = session.id AND sale.business_id = session.business_id AND sale.status='completed'), 0) AS totalPaymentsCents,
        COALESCE((SELECT SUM(payment.amount_cents + payment.tip_cents) FROM payments payment
          WHERE payment.cash_session_id = session.id AND payment.business_id = session.business_id
            AND payment.status = 'completed' AND payment.method = 'efectivo'), 0)
          + COALESCE((SELECT SUM(sale.total_cents + sale.tip_cents) FROM product_sales sale
            WHERE sale.cash_session_id = session.id AND sale.business_id = session.business_id
              AND sale.status='completed' AND sale.method='efectivo'), 0)
          - COALESCE((SELECT SUM(expense.amount_cents) FROM expenses expense
            WHERE expense.cash_session_id = session.id AND expense.business_id = session.business_id
              AND expense.status='completed' AND expense.method='efectivo'), 0)
          - COALESCE((SELECT SUM(refund.amount_cents) FROM refunds refund
            WHERE refund.cash_session_id = session.id AND refund.business_id = session.business_id
              AND refund.status='completed' AND refund.method='efectivo'), 0) AS cashPaymentsCents,
        (SELECT COUNT(*) FROM payments payment
          WHERE payment.cash_session_id = session.id AND payment.business_id = session.business_id
            AND payment.status = 'completed') AS paymentCount
      FROM cash_sessions session
      LEFT JOIN business_members member ON member.user_id = session.opened_by
        AND member.business_id = session.business_id
      WHERE session.business_id = ? AND session.status = 'open'
      LIMIT 1`).bind(context.businessId).first();
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
        counted_cash_cents AS countedCashCents, status, notes
      FROM cash_sessions WHERE business_id = ?
      ORDER BY opened_at DESC LIMIT 12`).bind(context.businessId).all();
    return Response.json({
      openSession: openSession ?? null,
      payments: payments.results ?? [],
      sessions: sessions.results ?? [],
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
        !["efectivo", "tarjeta", "transferencia", "pago_movil"].includes(method)) {
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
      return Response.json({
        payment: { id, appointmentId, cashSessionId: session.id, amountCents, tipCents, method, status: "completed", reference, createdAt, voidReason: "" },
        paidCents: totals?.paidCents ?? amountCents,
      }, { status: 201, headers: { "cache-control": "no-store" } });
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
      const session = await db.prepare(`SELECT session.id, session.opening_amount_cents AS openingAmountCents,
          COALESCE(SUM(CASE WHEN payment.status = 'completed' AND payment.method = 'efectivo'
            THEN payment.amount_cents + payment.tip_cents ELSE 0 END), 0) AS cashPaymentsCents,
          COALESCE((SELECT SUM(sale.total_cents + sale.tip_cents) FROM product_sales sale
            WHERE sale.cash_session_id = session.id AND sale.business_id = session.business_id
              AND sale.method = 'efectivo' AND sale.status='completed'), 0) AS cashSalesCents,
          COALESCE((SELECT SUM(expense.amount_cents) FROM expenses expense
            WHERE expense.cash_session_id = session.id AND expense.business_id = session.business_id
              AND expense.method = 'efectivo' AND expense.status='completed'), 0) AS cashExpensesCents,
          COALESCE((SELECT SUM(refund.amount_cents) FROM refunds refund
            WHERE refund.cash_session_id = session.id AND refund.business_id = session.business_id
              AND refund.method = 'efectivo' AND refund.status='completed'), 0) AS cashRefundsCents
        FROM cash_sessions session
        LEFT JOIN payments payment ON payment.cash_session_id = session.id
          AND payment.business_id = session.business_id
        WHERE session.business_id = ? AND session.status = 'open'
        GROUP BY session.id, session.opening_amount_cents`)
        .bind(context.businessId).first<{ id:string;openingAmountCents:number;cashPaymentsCents:number;cashSalesCents:number;cashExpensesCents:number;cashRefundsCents:number }>();
      if (!session) throw new HttpError(409, "No hay una caja abierta.");
      const expectedCashCents = session.openingAmountCents + session.cashPaymentsCents + session.cashSalesCents - session.cashExpensesCents - session.cashRefundsCents;
      const closedAt = new Date().toISOString();
      const notes = cleanText(body.notes, 500);
      const [closed] = await db.batch<{ id:string }>([
        db.prepare(`UPDATE cash_sessions SET status = 'closed', closed_by = ?,
            closed_at = ?, expected_cash_cents = ?, counted_cash_cents = ?,
            notes = CASE WHEN ? = '' THEN notes WHEN notes = '' THEN ? ELSE notes || char(10) || ? END
          WHERE id = ? AND business_id = ? AND status = 'open' RETURNING id`)
          .bind(context.user.userId, closedAt, expectedCashCents, countedCashCents,
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
        differenceCents: countedCashCents - expectedCashCents }, { headers: { "cache-control": "no-store" } });
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
