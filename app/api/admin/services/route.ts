import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  hasPermission, HttpError, readJson, writeAudit,
} from "../../../security";

type ServicePayload = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  durationMinutes?: unknown;
  price?: unknown;
  active?: unknown;
};

type ExistingService = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
  active: number;
};

const serviceSelect = `SELECT s.id, s.name, s.category,
  s.duration_minutes AS durationMinutes, s.price_cents AS priceCents, s.active,
  COUNT(a.id) AS appointmentCount
  FROM services s
  LEFT JOIN appointments a ON a.service_id = s.id AND a.business_id = s.business_id`;

export async function GET() {
  try {
    const context = await getAdminContext("services.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const services = await db.prepare(`${serviceSelect}
      WHERE s.business_id = ? GROUP BY s.id
      ORDER BY s.active DESC, s.category COLLATE NOCASE, s.name COLLATE NOCASE`)
      .bind(context.businessId).all();
    return Response.json({
      services: services.results ?? [],
      canManage: hasPermission(context.role, "services.write"),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("services.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const input = validateService(await readJson<ServicePayload>(request, 4096), true);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    await assertUniqueName(db, context.businessId, input.name);
    const id = crypto.randomUUID();
    try {
      await db.prepare(`INSERT INTO services
        (id,business_id,name,category,duration_minutes,price_cents,active)
        VALUES (?,?,?,?,?,?,?)`)
        .bind(id, context.businessId, input.name, input.category, input.durationMinutes, input.priceCents, input.active ? 1 : 0).run();
    } catch (error) {
      throwUniqueName(error);
    }
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "service.created", entityType: "service", entityId: id, metadata: { active: input.active } });
    const service = await findService(db, context.businessId, id);
    return Response.json({ service }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("services.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ServicePayload>(request, 4096);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Servicio no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const existing = await db.prepare(`SELECT id, name, category, duration_minutes AS durationMinutes,
      price_cents AS priceCents, active FROM services WHERE id = ? AND business_id = ?`)
      .bind(id, context.businessId).first<ExistingService>();
    if (!existing) throw new HttpError(404, "Servicio no encontrado.");
    const input = validateService(body, existing.active === 1);
    await assertUniqueName(db, context.businessId, input.name, id);
    try {
      await db.prepare(`UPDATE services SET name = ?, category = ?, duration_minutes = ?,
        price_cents = ?, active = ? WHERE id = ? AND business_id = ?`)
        .bind(input.name, input.category, input.durationMinutes, input.priceCents, input.active ? 1 : 0, id, context.businessId).run();
    } catch (error) {
      throwUniqueName(error);
    }
    await writeAudit(db, {
      businessId: context.businessId, user: context.user, action: "service.updated", entityType: "service", entityId: id,
      metadata: { activeChanged: existing.active !== (input.active ? 1 : 0), active: input.active },
    });
    const service = await findService(db, context.businessId, id);
    return Response.json({ service }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("services.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ServicePayload>(request, 4096);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Servicio no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const existing = await db.prepare(`SELECT s.id, s.name, COUNT(a.id) AS appointmentCount
      FROM services s LEFT JOIN appointments a ON a.service_id = s.id AND a.business_id = s.business_id
      WHERE s.id = ? AND s.business_id = ? GROUP BY s.id`)
      .bind(id, context.businessId).first<{ id: string; name: string; appointmentCount: number }>();
    if (!existing) throw new HttpError(404, "Servicio no encontrado.");
    if (Number(existing.appointmentCount) > 0) {
      throw new HttpError(409, "Este servicio tiene citas y no puede eliminarse. Puedes desactivarlo.");
    }
    try {
      await db.batch([
        db.prepare("DELETE FROM professional_services WHERE service_id = ? AND business_id = ?").bind(id, context.businessId),
        db.prepare("DELETE FROM services WHERE id = ? AND business_id = ?").bind(id, context.businessId),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("service_has_appointments")) {
        throw new HttpError(409, "Este servicio tiene citas y no puede eliminarse.");
      }
      throw error;
    }
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "service.deleted", entityType: "service", entityId: id, metadata: { name: existing.name } });
    return Response.json({ id }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function validateService(body: ServicePayload, defaultActive: boolean) {
  const name = cleanText(body.name, 100);
  const category = cleanText(body.category, 60);
  const durationMinutes = integerInRange(body.durationMinutes, 5, 480);
  const priceCents = moneyToCents(body.price);
  const active = booleanValue(body.active, defaultActive);
  if (name.length < 2 || category.length < 2 || durationMinutes === null || priceCents === null) {
    throw new HttpError(400, "Revisa el nombre, categoría, duración y precio.");
  }
  return { name, category, durationMinutes, priceCents, active };
}

function integerInRange(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(cleanText(value, 12));
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function moneyToCents(value: unknown) {
  const normalized = (typeof value === "number" ? String(value) : cleanText(value, 20)).replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/u.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 100_000_000 ? cents : null;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new HttpError(400, "Estado de servicio no válido.");
}

async function assertUniqueName(db: D1Database, businessId: string, name: string, excludedId = "") {
  const duplicate = await db.prepare(`SELECT id FROM services
    WHERE business_id = ? AND name = ? COLLATE NOCASE AND id <> ?`)
    .bind(businessId, name, excludedId).first();
  if (duplicate) throw new HttpError(409, "Ya existe un servicio con ese nombre.");
}

function throwUniqueName(error: unknown): never {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    throw new HttpError(409, "Ya existe un servicio con ese nombre.");
  }
  throw error;
}

async function findService(db: D1Database, businessId: string, id: string) {
  const service = await db.prepare(`${serviceSelect}
    WHERE s.business_id = ? AND s.id = ? GROUP BY s.id`).bind(businessId, id).first();
  if (!service) throw new HttpError(404, "Servicio no encontrado.");
  return service;
}
