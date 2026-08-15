import { ensureDatabase } from "../../../../db/init";
import { errorResponse, getAdminContext, HttpError, isDate, localDate } from "../../../security";

type SummaryTotals = {
  grossRevenueCents: number; serviceRevenueCents: number; productRevenueCents: number;
  expensesCents: number; refundsCents: number; commissionsCents: number; netRevenueCents: number;
  tipsCents: number; paidAppointments: number;
};

type PeriodFilters = { professionalId: string; serviceId: string; method: string };

function paymentFilterClause(filters: PeriodFilters) {
  const clauses = ["p.business_id = ?", "substr(p.created_at,1,10) BETWEEN ? AND ?", "p.status = 'completed'"];
  const extra: unknown[] = [];
  if (filters.professionalId) { clauses.push("a.professional_id = ?"); extra.push(filters.professionalId); }
  if (filters.serviceId) { clauses.push("a.service_id = ?"); extra.push(filters.serviceId); }
  if (filters.method) { clauses.push("p.method = ?"); extra.push(filters.method); }
  return { where: clauses.join(" AND "), extra };
}

async function periodTotals(db: D1Database, businessId: string, from: string, to: string, filters: PeriodFilters): Promise<SummaryTotals> {
  const payment = paymentFilterClause(filters);
  const productFilters = ["s.business_id = ?", "substr(s.created_at,1,10) BETWEEN ? AND ?", "s.status = 'completed'"];
  const productParams: unknown[] = [businessId, from, to];
  if (filters.method) { productFilters.push("s.method = ?"); productParams.push(filters.method); }
  if (filters.professionalId || filters.serviceId) productFilters.push("1 = 0");
  const expenseFilters = ["e.business_id = ?", "substr(e.created_at,1,10) BETWEEN ? AND ?", "e.status = 'completed'"];
  const expenseParams: unknown[] = [businessId, from, to];
  if (filters.method) { expenseFilters.push("e.method = ?"); expenseParams.push(filters.method); }
  const refundFilters = ["r.business_id = ?", "substr(r.created_at,1,10) BETWEEN ? AND ?", "r.status = 'completed'"];
  const refundParams: unknown[] = [businessId, from, to];
  if (filters.method) { refundFilters.push("r.method = ?"); refundParams.push(filters.method); }
  const commissionFilters = ["c.business_id = ?", "substr(c.created_at,1,10) BETWEEN ? AND ?", "c.status <> 'cancelled'"];
  const commissionParams: unknown[] = [businessId, from, to];
  if (filters.professionalId) { commissionFilters.push("c.professional_id = ?"); commissionParams.push(filters.professionalId); }
  if (filters.serviceId) { commissionFilters.push("c.service_id = ?"); commissionParams.push(filters.serviceId); }
  if (filters.method) { commissionFilters.push("EXISTS (SELECT 1 FROM payments source_payment WHERE source_payment.id=c.source_payment_id AND source_payment.business_id=c.business_id AND source_payment.method = ?)"); commissionParams.push(filters.method); }
  const [services, products, expenses, refunds, commissions] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(p.amount_cents),0) AS amountCents,COALESCE(SUM(p.tip_cents),0) AS tipCents,COUNT(DISTINCT p.appointment_id) AS paidAppointments
      FROM payments p JOIN appointments a ON a.id=p.appointment_id AND a.business_id=p.business_id WHERE ${payment.where}`)
      .bind(businessId, from, to, ...payment.extra).first(),
    db.prepare(`SELECT COALESCE(SUM(s.total_cents),0) AS amountCents,COALESCE(SUM(s.tip_cents),0) AS tipCents FROM product_sales s WHERE ${productFilters.join(" AND ")}`)
      .bind(...productParams).first(),
    db.prepare(`SELECT COALESCE(SUM(e.amount_cents),0) AS amountCents FROM expenses e WHERE ${expenseFilters.join(" AND ")}`)
      .bind(...expenseParams).first(),
    db.prepare(`SELECT COALESCE(SUM(r.amount_cents),0) AS amountCents FROM refunds r WHERE ${refundFilters.join(" AND ")}`)
      .bind(...refundParams).first(),
    db.prepare(`SELECT COALESCE(SUM(c.amount_cents),0) AS amountCents FROM commissions c WHERE ${commissionFilters.join(" AND ")}`)
      .bind(...commissionParams).first(),
  ]);
  const serviceRevenueCents = number(services?.amountCents);
  const productRevenueCents = number(products?.amountCents);
  const expensesCents = number(expenses?.amountCents);
  const refundsCents = number(refunds?.amountCents);
  const commissionsCents = number(commissions?.amountCents);
  const grossRevenueCents = serviceRevenueCents + productRevenueCents;
  return {
    grossRevenueCents, serviceRevenueCents, productRevenueCents, expensesCents, refundsCents, commissionsCents,
    netRevenueCents: grossRevenueCents - refundsCents - expensesCents - commissionsCents,
    tipsCents: number(services?.tipCents) + number(products?.tipCents),
    paidAppointments: number(services?.paidAppointments),
  };
}

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("finance.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const url = new URL(request.url);
    const today = localDate(context.timezone);
    const from = url.searchParams.get("from") || shiftDate(today, -29);
    const to = url.searchParams.get("to") || today;
    const professionalId = url.searchParams.get("professionalId")?.trim() || "";
    const serviceId = url.searchParams.get("serviceId")?.trim() || "";
    const method = url.searchParams.get("method")?.trim() || "";
    if (!isDate(from) || !isDate(to) || from > to || dateDistance(from, to) > 366) throw new HttpError(400, "El periodo del reporte no es válido.");
    const db = await ensureDatabase();
    const filters: PeriodFilters = { professionalId, serviceId, method };
    const payment = paymentFilterClause(filters);
    const params: unknown[] = [context.businessId, from, to, ...payment.extra];
    const paymentWhere = payment.where;
    const productFilters = ["s.business_id = ?", "substr(s.created_at,1,10) BETWEEN ? AND ?", "s.status = 'completed'"];
    const productParams: unknown[] = [context.businessId, from, to];
    if (method) { productFilters.push("s.method = ?"); productParams.push(method); }
    if (professionalId || serviceId) productFilters.push("1 = 0");
    const commissionFilters = ["c.business_id = ?", "substr(c.created_at,1,10) BETWEEN ? AND ?", "c.status <> 'cancelled'"];
    const commissionParams: unknown[] = [context.businessId, from, to];
    if (professionalId) { commissionFilters.push("c.professional_id = ?"); commissionParams.push(professionalId); }
    if (serviceId) { commissionFilters.push("c.service_id = ?"); commissionParams.push(serviceId); }
    if (method) { commissionFilters.push("EXISTS (SELECT 1 FROM payments source_payment WHERE source_payment.id=c.source_payment_id AND source_payment.business_id=c.business_id AND source_payment.method = ?)"); commissionParams.push(method); }
    const commissionWhere = commissionFilters.join(" AND ");
    const appointmentFilters = ["a.business_id = ?", "a.appointment_date BETWEEN ? AND ?"];
    const appointmentParams: unknown[] = [context.businessId, from, to];
    if (professionalId) { appointmentFilters.push("a.professional_id = ?"); appointmentParams.push(professionalId); }
    if (serviceId) { appointmentFilters.push("a.service_id = ?"); appointmentParams.push(serviceId); }
    const appointmentWhere = appointmentFilters.join(" AND ");
    const periodDays = dateDistance(from, to) + 1;
    const previousFrom = shiftDate(from, -periodDays);
    const previousTo = shiftDate(from, -1);

    const [summaryTotals, previousTotals, services, professionals, methods, products, commissionSummary, commissions,
      daily, appointmentStatus, appointmentSources, clientNew, clientActivity, weekdays, hours, topClients,
      professionalCatalog, serviceCatalog, business] = await Promise.all([
      periodTotals(db, context.businessId, from, to, filters),
      periodTotals(db, context.businessId, previousFrom, previousTo, filters),
      db.prepare(`SELECT s.id,s.name,COALESCE(SUM(p.amount_cents),0) AS revenueCents,COUNT(DISTINCT p.appointment_id) AS appointmentCount
        FROM payments p JOIN appointments a ON a.id=p.appointment_id AND a.business_id=p.business_id JOIN services s ON s.id=a.service_id AND s.business_id=a.business_id
        WHERE ${paymentWhere} GROUP BY s.id,s.name ORDER BY revenueCents DESC`).bind(...params).all(),
      db.prepare(`SELECT pr.id,pr.name,COALESCE(SUM(p.amount_cents),0) AS revenueCents,COALESCE(SUM(p.tip_cents),0) AS tipCents,COUNT(DISTINCT p.appointment_id) AS appointmentCount
        FROM payments p JOIN appointments a ON a.id=p.appointment_id AND a.business_id=p.business_id JOIN professionals pr ON pr.id=a.professional_id AND pr.business_id=a.business_id
        WHERE ${paymentWhere} GROUP BY pr.id,pr.name ORDER BY revenueCents DESC`).bind(...params).all(),
      db.prepare(`SELECT p.method,COALESCE(SUM(p.amount_cents),0) AS amountCents,COALESCE(SUM(p.tip_cents),0) AS tipCents,COUNT(*) AS transactionCount
        FROM payments p JOIN appointments a ON a.id=p.appointment_id AND a.business_id=p.business_id WHERE ${paymentWhere} GROUP BY p.method ORDER BY amountCents DESC`).bind(...params).all(),
      db.prepare(`SELECT s.id,s.receipt_number AS receiptNumber,COALESCE(s.total_cents,0) AS revenueCents,COALESCE(s.tip_cents,0) AS tipCents,s.method
        FROM product_sales s WHERE ${productFilters.join(" AND ")} ORDER BY s.created_at DESC LIMIT 500`).bind(...productParams).all(),
      db.prepare(`SELECT COALESCE(SUM(c.amount_cents),0) AS amountCents,COUNT(*) AS count,
          COALESCE(SUM(CASE WHEN c.status='pending' THEN c.amount_cents ELSE 0 END),0) AS pendingCents
        FROM commissions c WHERE ${commissionWhere}`).bind(...commissionParams).first(),
      db.prepare(`SELECT c.id,c.appointment_id AS appointmentId,c.professional_id AS professionalId,c.service_id AS serviceId,
          c.professional_name AS professionalName,c.service_name AS serviceName,c.rule_name AS ruleName,c.kind,c.value,
          c.basis_cents AS basisCents,c.amount_cents AS amountCents,c.status,c.batch_id AS batchId,c.created_at AS createdAt,c.paid_at AS paidAt
        FROM commissions c WHERE ${commissionWhere} ORDER BY c.created_at DESC LIMIT 1000`).bind(...commissionParams).all(),
      db.prepare(`SELECT day, SUM(serviceCents) AS serviceCents, SUM(productCents) AS productCents,
          SUM(expenseCents) AS expenseCents, SUM(refundCents) AS refundCents, SUM(tipCents) AS tipCents
        FROM (
          SELECT substr(p.created_at,1,10) AS day, p.amount_cents AS serviceCents, 0 AS productCents, 0 AS expenseCents, 0 AS refundCents, p.tip_cents AS tipCents
            FROM payments p JOIN appointments a ON a.id=p.appointment_id AND a.business_id=p.business_id WHERE ${paymentWhere}
          UNION ALL
          SELECT substr(s.created_at,1,10), 0, s.total_cents, 0, 0, s.tip_cents FROM product_sales s WHERE ${productFilters.join(" AND ")}
          UNION ALL
          SELECT substr(e.created_at,1,10), 0, 0, e.amount_cents, 0, 0 FROM expenses e
            WHERE e.business_id = ? AND substr(e.created_at,1,10) BETWEEN ? AND ? AND e.status = 'completed'${method ? " AND e.method = ?" : ""}
          UNION ALL
          SELECT substr(r.created_at,1,10), 0, 0, 0, r.amount_cents, 0 FROM refunds r
            WHERE r.business_id = ? AND substr(r.created_at,1,10) BETWEEN ? AND ? AND r.status = 'completed'${method ? " AND r.method = ?" : ""}
        ) GROUP BY day ORDER BY day`)
        .bind(...params, ...productParams,
          context.businessId, from, to, ...(method ? [method] : []),
          context.businessId, from, to, ...(method ? [method] : [])).all(),
      db.prepare(`SELECT a.status, COUNT(*) AS count FROM appointments a WHERE ${appointmentWhere} GROUP BY a.status`)
        .bind(...appointmentParams).all(),
      db.prepare(`SELECT a.source, COUNT(*) AS count FROM appointments a WHERE ${appointmentWhere} GROUP BY a.source`)
        .bind(...appointmentParams).all(),
      db.prepare("SELECT COUNT(*) AS count FROM clients WHERE business_id = ? AND substr(created_at,1,10) BETWEEN ? AND ?")
        .bind(context.businessId, from, to).first(),
      db.prepare(`SELECT COUNT(DISTINCT a.client_id) AS activeClients,
          COUNT(DISTINCT CASE WHEN EXISTS (
            SELECT 1 FROM appointments earlier WHERE earlier.business_id = a.business_id
              AND earlier.client_id = a.client_id AND earlier.appointment_date < ?
          ) THEN a.client_id END) AS returningClients
        FROM appointments a WHERE ${appointmentWhere}`)
        .bind(from, ...appointmentParams).all(),
      db.prepare(`SELECT CAST(strftime('%w', a.appointment_date) AS INTEGER) AS weekday, COUNT(*) AS count,
          COALESCE(SUM(CASE WHEN a.status = 'completada' THEN 1 ELSE 0 END),0) AS completedCount
        FROM appointments a WHERE ${appointmentWhere} GROUP BY weekday ORDER BY weekday`)
        .bind(...appointmentParams).all(),
      db.prepare(`SELECT CAST(substr(a.start_time,1,2) AS INTEGER) AS hour, COUNT(*) AS count
        FROM appointments a WHERE ${appointmentWhere} GROUP BY hour ORDER BY hour`)
        .bind(...appointmentParams).all(),
      db.prepare(`SELECT c.id, c.name, COALESCE(SUM(p.amount_cents),0) AS revenueCents, COUNT(DISTINCT p.appointment_id) AS visitCount
        FROM payments p
        JOIN appointments a ON a.id=p.appointment_id AND a.business_id=p.business_id
        JOIN clients c ON c.id=a.client_id AND c.business_id=a.business_id
        WHERE ${paymentWhere} GROUP BY c.id, c.name ORDER BY revenueCents DESC LIMIT 8`).bind(...params).all(),
      db.prepare("SELECT id,name FROM professionals WHERE business_id=? ORDER BY name COLLATE NOCASE").bind(context.businessId).all(),
      db.prepare("SELECT id,name FROM services WHERE business_id=? ORDER BY name COLLATE NOCASE").bind(context.businessId).all(),
      db.prepare("SELECT currency FROM businesses WHERE id=?").bind(context.businessId).first<{currency:string}>(),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of appointmentStatus.results ?? []) statusCounts[String((row as Record<string,unknown>).status)] = number((row as Record<string,unknown>).count);
    const totalAppointments = Object.values(statusCounts).reduce((total, value) => total + value, 0);
    const completed = statusCounts.completada ?? 0;
    const cancelled = statusCounts.cancelada ?? 0;
    const noShow = statusCounts.no_asistio ?? 0;
    const sourceCounts: Record<string, number> = {};
    for (const row of appointmentSources.results ?? []) sourceCounts[String((row as Record<string,unknown>).source)] = number((row as Record<string,unknown>).count);
    const activity = (clientActivity.results ?? [])[0] as Record<string, unknown> | undefined;
    const activeClients = number(activity?.activeClients);
    const returningClients = number(activity?.returningClients);

    const report = {
      filters: { from, to, professionalId, serviceId, method },
      currency: business?.currency ?? "USD",
      summary: {
        ...summaryTotals,
        productSalesCount: (products.results ?? []).length,
        expenseCount: 0,
        refundCount: 0,
        commissionCount: number(commissionSummary?.count),
        pendingCommissionsCents: number(commissionSummary?.pendingCents),
      },
      previous: { from: previousFrom, to: previousTo, ...previousTotals },
      daily: daily.results ?? [],
      appointmentStats: {
        total: totalAppointments,
        completed, cancelled, noShow,
        scheduled: statusCounts.programada ?? 0,
        confirmed: statusCounts.confirmada ?? 0,
        inProgress: statusCounts.en_progreso ?? 0,
        completionRate: totalAppointments ? Math.round((completed / totalAppointments) * 100) : 0,
        noShowRate: totalAppointments ? Math.round((noShow / totalAppointments) * 100) : 0,
        onlineCount: sourceCounts.online ?? 0,
        panelCount: sourceCounts.panel ?? 0,
      },
      clientStats: {
        newClients: number(clientNew?.count),
        activeClients,
        returningClients,
        newInPeriod: Math.max(0, activeClients - returningClients),
      },
      weekdays: weekdays.results ?? [],
      hours: hours.results ?? [],
      topClients: topClients.results ?? [],
      services: services.results ?? [],
      professionals: professionals.results ?? [],
      methods: methods.results ?? [],
      products: products.results ?? [],
      commissions: commissions.results ?? [],
      catalogs: { professionals: professionalCatalog.results ?? [], services: serviceCatalog.results ?? [] },
    };
    const [expenseCount, refundCount] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS count FROM expenses e WHERE e.business_id = ? AND substr(e.created_at,1,10) BETWEEN ? AND ? AND e.status='completed'${method ? " AND e.method = ?" : ""}`)
        .bind(context.businessId, from, to, ...(method ? [method] : [])).first(),
      db.prepare(`SELECT COUNT(*) AS count FROM refunds r WHERE r.business_id = ? AND substr(r.created_at,1,10) BETWEEN ? AND ? AND r.status='completed'${method ? " AND r.method = ?" : ""}`)
        .bind(context.businessId, from, to, ...(method ? [method] : [])).first(),
    ]);
    report.summary.expenseCount = number(expenseCount?.count);
    report.summary.refundCount = number(refundCount?.count);
    if (url.searchParams.get("format") === "csv") return csvResponse(report);
    return Response.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

function number(value:unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0; }
function shiftDate(date:string,days:number) { const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10); }
function dateDistance(from:string,to:string) { return Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86_400_000); }

function csvResponse(report: {
  filters: Record<string,string>; currency: string; summary: Record<string,number>;
  daily: unknown[]; services: unknown[]; professionals: unknown[];
  methods: unknown[]; products: unknown[]; commissions: unknown[];
}) {
  const rows: string[][] = [
    ["seccion","concepto","detalle","monto_centavos","estado","fecha"],
    ["resumen","ingresos_brutos","",String(report.summary.grossRevenueCents),"",""],
    ["resumen","ingresos_servicios","",String(report.summary.serviceRevenueCents),"",""],
    ["resumen","ingresos_productos","",String(report.summary.productRevenueCents),"",""],
    ["resumen","propinas","",String(report.summary.tipsCents),"",""],
    ["resumen","gastos","",String(report.summary.expensesCents),"",""],
    ["resumen","reembolsos","",String(report.summary.refundsCents),"",""],
    ["resumen","comisiones","",String(report.summary.commissionsCents),"",""],
    ["resumen","ingreso_neto","",String(report.summary.netRevenueCents),"",""],
    ...report.daily.map((item) => {
      const row = item as Record<string, unknown>;
      const net = number(row.serviceCents) + number(row.productCents) - number(row.expenseCents) - number(row.refundCents);
      return ["dia", String(row.day ?? ""), "ingreso_neto_dia", String(net), "", String(row.day ?? "")];
    }),
    ...report.services.map((item) => row("servicio", item, "name", "revenueCents", "", "")),
    ...report.professionals.map((item) => row("profesional", item, "name", "revenueCents", "", "")),
    ...report.methods.map((item) => row("metodo", item, "method", "amountCents", "", "")),
    ...report.products.map((item) => row("producto", item, "receiptNumber", "revenueCents", "", "")),
    ...report.commissions.map((item) => row("comision", item, "professionalName", "amountCents", "status", "createdAt")),
  ];
  const csv = rows.map((values) => values.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reporte-${report.filters.from}-${report.filters.to}.csv"`, "cache-control": "no-store" } });
}

function row(section: string, value: unknown, labelKey: string, amountKey: string, statusKey: string, dateKey: string) {
  const item = value as Record<string,unknown>;
  return [section, String(item[labelKey] ?? ""), String(item.serviceName ?? item.method ?? item.receiptNumber ?? ""), String(number(item[amountKey])), String(statusKey ? item[statusKey] ?? "" : ""), String(dateKey ? item[dateKey] ?? "" : "")];
}
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
