import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext, HttpError, isDate, readJson, writeAudit,
} from "../../../security";

type CommissionPayload = {
  action?: unknown; id?: unknown; name?: unknown; scope?: unknown; professionalId?: unknown; serviceId?: unknown;
  category?: unknown; kind?: unknown; value?: unknown; priority?: unknown; active?: unknown; commissionIds?: unknown;
  batchName?: unknown; periodFrom?: unknown; periodTo?: unknown;
};

const SCOPES = ["default", "professional", "service", "category"] as const;
const KINDS = ["percent", "fixed"] as const;

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("finance.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const url = new URL(request.url);
    const today = localDate(context.timezone);
    const from = url.searchParams.get("from") || shiftDate(today, -89);
    const to = url.searchParams.get("to") || today;
    const professionalId = url.searchParams.get("professionalId")?.trim() || "";
    const status = url.searchParams.get("status")?.trim() || "all";
    if (!isDate(from) || !isDate(to) || from > to || dateDistance(from, to) > 366) throw new HttpError(400, "El periodo de comisiones no es válido.");
    if (status !== "all" && !["pending", "paid", "cancelled"].includes(status)) throw new HttpError(400, "El estado de comisiones no es válido.");
    const db = await ensureDatabase();
    const filters = ["c.business_id=?", "substr(c.created_at,1,10) BETWEEN ? AND ?"];
    const params: unknown[] = [context.businessId, from, to];
    if (professionalId) { filters.push("c.professional_id=?"); params.push(professionalId); }
    if (status !== "all") { filters.push("c.status=?"); params.push(status); }
    const where = filters.join(" AND ");
    const [summary, commissions, rules, batches, professionals, services] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(c.amount_cents),0) AS amountCents,
          COALESCE(SUM(CASE WHEN c.status='pending' THEN c.amount_cents ELSE 0 END),0) AS pendingCents,
          COALESCE(SUM(CASE WHEN c.status='paid' THEN c.amount_cents ELSE 0 END),0) AS paidCents
        FROM commissions c WHERE ${where}`).bind(...params).first(),
      db.prepare(`SELECT c.id,c.appointment_id AS appointmentId,c.professional_id AS professionalId,c.service_id AS serviceId,
          c.rule_id AS ruleId,c.professional_name AS professionalName,c.service_name AS serviceName,c.rule_name AS ruleName,
          c.kind,c.value,c.basis_cents AS basisCents,c.amount_cents AS amountCents,c.status,c.batch_id AS batchId,
          b.name AS batchName,c.created_at AS createdAt,c.paid_at AS paidAt
        FROM commissions c LEFT JOIN commission_batches b ON b.id=c.batch_id AND b.business_id=c.business_id
        WHERE ${where} ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END,c.created_at DESC LIMIT 500`).bind(...params).all(),
      db.prepare(`SELECT r.id,r.name,r.scope,r.professional_id AS professionalId,r.service_id AS serviceId,r.category,
          r.kind,r.value,r.priority,r.active,r.created_at AS createdAt,r.updated_at AS updatedAt,
          p.name AS professionalName,s.name AS serviceName
        FROM commission_rules r LEFT JOIN professionals p ON p.id=r.professional_id AND p.business_id=r.business_id
        LEFT JOIN services s ON s.id=r.service_id AND s.business_id=r.business_id
        WHERE r.business_id=? ORDER BY r.active DESC,r.priority DESC,r.created_at DESC`).bind(context.businessId).all(),
      db.prepare(`SELECT id,name,period_from AS periodFrom,period_to AS periodTo,status,total_cents AS totalCents,
          commission_count AS commissionCount,created_at AS createdAt,paid_at AS paidAt
        FROM commission_batches WHERE business_id=? ORDER BY created_at DESC LIMIT 100`).bind(context.businessId).all(),
      db.prepare("SELECT id,name FROM professionals WHERE business_id=? ORDER BY name COLLATE NOCASE").bind(context.businessId).all(),
      db.prepare("SELECT id,name,category FROM services WHERE business_id=? ORDER BY name COLLATE NOCASE").bind(context.businessId).all(),
    ]);
    return Response.json({
      filters: { from, to, professionalId, status },
      summary: { count: number(summary?.count), amountCents: number(summary?.amountCents), pendingCents: number(summary?.pendingCents), paidCents: number(summary?.paidCents) },
      commissions: commissions.results ?? [], rules: rules.results ?? [], batches: batches.results ?? [],
      catalogs: { professionals: professionals.results ?? [], services: services.results ?? [] },
      canManage: context.role === "owner" || context.role === "admin",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("finance.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<CommissionPayload>(request);
    const action = cleanText(body.action, 24);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `commission-write:${context.user.userId}`, 40, 60 * 1000);
    if (["rule_create", "rule_update"].includes(action)) return Response.json(await saveRule(db, context, body, action === "rule_update"));
    if (action === "rule_toggle") return Response.json(await toggleRule(db, context, body));
    if (action === "batch_pay") return Response.json(await payBatch(db, context, body));
    throw new HttpError(400, "Acción de comisiones no válida.");
  } catch (error) { return errorResponse(error); }
}

async function saveRule(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, body: CommissionPayload, update: boolean) {
  const id = cleanText(body.id, 80);
  const name = cleanText(body.name, 120);
  const scope = cleanText(body.scope, 20);
  const kind = cleanText(body.kind, 12);
  const value = integer(body.value);
  const priority = integer(body.priority);
  if (update && !id) throw new HttpError(400, "La regla no es válida.");
  if (!name || !(SCOPES as readonly string[]).includes(scope) || !(KINDS as readonly string[]).includes(kind) || value === null || priority === null || priority < 0 || priority > 1000) {
    throw new HttpError(400, "Revisa el nombre, alcance, tipo, valor y prioridad de la regla.");
  }
  if (kind === "percent" && value > 10_000) throw new HttpError(400, "El porcentaje debe estar entre 0 y 100%.");
  if (kind === "fixed" && value > 100_000_000) throw new HttpError(400, "El monto fijo no es válido.");
  const professionalId = scope === "professional" ? cleanText(body.professionalId, 80) : null;
  const serviceId = scope === "service" ? cleanText(body.serviceId, 80) : null;
  const category = scope === "category" ? cleanText(body.category, 100) : null;
  if (scope === "professional" && !professionalId) throw new HttpError(400, "Selecciona el profesional de la regla.");
  if (scope === "service" && !serviceId) throw new HttpError(400, "Selecciona el servicio de la regla.");
  if (scope === "category" && !category) throw new HttpError(400, "Indica la categoría de la regla.");
  if (professionalId && !(await db.prepare("SELECT id FROM professionals WHERE id=? AND business_id=?").bind(professionalId, context.businessId).first())) throw new HttpError(400, "El profesional no pertenece al negocio.");
  if (serviceId && !(await db.prepare("SELECT id FROM services WHERE id=? AND business_id=?").bind(serviceId, context.businessId).first())) throw new HttpError(400, "El servicio no pertenece al negocio.");
  const now = new Date().toISOString();
  const ruleId = update ? id : crypto.randomUUID();
  if (update) {
    const exists = await db.prepare("SELECT id FROM commission_rules WHERE id=? AND business_id=?").bind(id, context.businessId).first();
    if (!exists) throw new HttpError(404, "La regla no existe.");
    await db.prepare(`UPDATE commission_rules SET name=?,scope=?,professional_id=?,service_id=?,category=?,kind=?,value=?,priority=?,updated_at=? WHERE id=? AND business_id=?`)
      .bind(name, scope, professionalId, serviceId, category, kind, value, priority, now, id, context.businessId).run();
  } else {
    await db.prepare(`INSERT INTO commission_rules
      (id,business_id,name,scope,professional_id,service_id,category,kind,value,priority,active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(ruleId, context.businessId, name, scope, professionalId, serviceId, category, kind, value, priority, now, now).run();
  }
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: update ? "commission_rule.updated" : "commission_rule.created", entityType: "commission_rule", entityId: ruleId, metadata: { name, scope, kind, value, priority } });
  return { id: ruleId, name, scope, professionalId, serviceId, category, kind, value, priority, active: true };
}

async function toggleRule(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, body: CommissionPayload) {
  const id = cleanText(body.id, 80);
  if (!id) throw new HttpError(400, "La regla no es válida.");
  const row = await db.prepare("SELECT active FROM commission_rules WHERE id=? AND business_id=?").bind(id, context.businessId).first<{ active:number }>();
  if (!row) throw new HttpError(404, "La regla no existe.");
  const active = row.active ? 0 : 1;
  await db.prepare("UPDATE commission_rules SET active=?,updated_at=? WHERE id=? AND business_id=?").bind(active, new Date().toISOString(), id, context.businessId).run();
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: active ? "commission_rule.activated" : "commission_rule.deactivated", entityType: "commission_rule", entityId: id, metadata: { active: Boolean(active) } });
  return { id, active: Boolean(active) };
}

async function payBatch(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, body: CommissionPayload) {
  const rawIds = Array.isArray(body.commissionIds) ? body.commissionIds : [];
  const ids = [...new Set(rawIds.filter((value): value is string => typeof value === "string").map((value) => cleanText(value, 80)).filter(Boolean))];
  if (!ids.length || ids.length > 200) throw new HttpError(400, "Selecciona entre 1 y 200 comisiones pendientes.");
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT id,amount_cents AS amountCents,created_at AS createdAt FROM commissions WHERE business_id=? AND status='pending' AND id IN (${placeholders})`)
    .bind(context.businessId, ...ids).all<{ id:string; amountCents:number; createdAt:string }>();
  if ((rows.results ?? []).length !== ids.length) throw new HttpError(409, "Una o más comisiones ya no están pendientes.");
  const selected = rows.results ?? [];
  const totalCents = selected.reduce((sum, row) => sum + number(row.amountCents), 0);
  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const name = cleanText(body.batchName, 120) || `Lote ${now.slice(0, 10)}`;
  const dates = selected.map((row) => row.createdAt.slice(0, 10)).sort();
  await db.batch([
    db.prepare(`INSERT INTO commission_batches (id,business_id,name,period_from,period_to,status,total_cents,commission_count,created_by,created_at,paid_at)
      VALUES (?,?,?,? ,?,'paid',?,?,?,?,?)`).bind(batchId, context.businessId, name, dates[0], dates.at(-1), totalCents, selected.length, context.user.userId, now, now),
    db.prepare(`UPDATE commissions SET status='paid',batch_id=?,paid_at=?,paid_by=?,updated_at=? WHERE business_id=? AND status='pending' AND id IN (${placeholders})`)
      .bind(batchId, now, context.user.userId, now, context.businessId, ...ids),
  ]);
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "commission_batch.paid", entityType: "commission_batch", entityId: batchId, metadata: { commissionCount: selected.length, totalCents, commissionIds: ids.join(",") } });
  return { id: batchId, name, totalCents, commissionCount: selected.length, status: "paid" };
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function localDate(timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function dateDistance(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }
