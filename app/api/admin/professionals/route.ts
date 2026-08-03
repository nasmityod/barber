import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  hasPermission, HttpError, isEmail, isPhone, normalizeEmail, readJson, writeAudit,
} from "../../../security";

type ProfessionalPayload = {
  id?: unknown;
  name?: unknown;
  specialty?: unknown;
  email?: unknown;
  phone?: unknown;
  active?: unknown;
  serviceIds?: unknown;
};

type ProfessionalRow = {
  id: string; name: string; specialty: string; email: string; phone: string; active: number;
  appointmentCount: number; completedCount: number; totalRevenueCents: number; blockCount: number;
  serviceIdsCsv: string;
};

type ExistingProfessional = {
  id: string;
  name: string;
  specialty: string;
  email: string | null;
  phone: string | null;
  active: number;
};

const professionalSelect = `SELECT p.id, p.name, p.specialty,
  COALESCE(p.email, '') AS email, COALESCE(p.phone, '') AS phone, p.active,
  COUNT(a.id) AS appointmentCount,
  COALESCE(SUM(CASE WHEN a.status = 'completada' THEN 1 ELSE 0 END), 0) AS completedCount,
  COALESCE(SUM(CASE WHEN a.status = 'completada' THEN a.total_cents ELSE 0 END), 0) AS totalRevenueCents,
  (SELECT COUNT(*) FROM time_blocks b
    WHERE b.business_id = p.business_id AND b.professional_id = p.id) AS blockCount,
  COALESCE((SELECT GROUP_CONCAT(ps.service_id) FROM professional_services ps
    WHERE ps.business_id = p.business_id AND ps.professional_id = p.id), '') AS serviceIdsCsv
  FROM professionals p
  LEFT JOIN appointments a ON a.professional_id = p.id AND a.business_id = p.business_id`;

export async function GET() {
  try {
    const context = await getAdminContext("professionals.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const professionals = await db.prepare(`${professionalSelect}
      WHERE p.business_id = ? GROUP BY p.id
      ORDER BY p.active DESC, p.name COLLATE NOCASE`)
      .bind(context.businessId).all<ProfessionalRow>();
    return Response.json({
      professionals: (professionals.results ?? []).map(serializeProfessional),
      canManage: hasPermission(context.role, "professionals.write"),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("professionals.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ProfessionalPayload>(request, 4096);
    const input = validateProfessional(body, true);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    await assertUniqueName(db, context.businessId, input.name);
    const serviceIds = await resolveServiceIds(db, context.businessId, body.serviceIds);
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare(`INSERT INTO professionals
          (id,business_id,name,specialty,email,phone,active)
          VALUES (?,?,?,?,?,?,?)`)
          .bind(id, context.businessId, input.name, input.specialty, input.email || null, input.phone || null, input.active ? 1 : 0),
        ...[1, 2, 3, 4, 5, 6].map((weekday) => db.prepare(`INSERT INTO business_hours
          (id,business_id,professional_id,weekday,start_time,end_time,active)
          VALUES (?,?,?,?, '09:00','19:00',1)`)
          .bind(crypto.randomUUID(), context.businessId, id, weekday)),
        ...serviceIds.map((serviceId) => db.prepare(`INSERT INTO professional_services
          (business_id,professional_id,service_id) VALUES (?,?,?)`)
          .bind(context.businessId, id, serviceId)),
      ]);
    } catch (error) {
      throwUniqueName(error);
    }
    await writeAudit(db, {
      businessId: context.businessId, user: context.user, action: "professional.created",
      entityType: "professional", entityId: id, metadata: { active: input.active, serviceCount: serviceIds.length },
    });
    const professional = await findProfessional(db, context.businessId, id);
    return Response.json({ professional }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("professionals.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ProfessionalPayload>(request, 4096);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Profesional no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const existing = await db.prepare(`SELECT id, name, specialty, email, phone, active
      FROM professionals WHERE id = ? AND business_id = ?`)
      .bind(id, context.businessId).first<ExistingProfessional>();
    if (!existing) throw new HttpError(404, "Profesional no encontrado.");
    const input = validateProfessional(body, existing.active === 1);
    await assertUniqueName(db, context.businessId, input.name, id);
    const serviceIds = await resolveServiceIds(db, context.businessId, body.serviceIds, id);
    try {
      await db.batch([
        db.prepare(`UPDATE professionals SET name = ?, specialty = ?, email = ?, phone = ?, active = ?
          WHERE id = ? AND business_id = ?`)
          .bind(input.name, input.specialty, input.email || null, input.phone || null, input.active ? 1 : 0, id, context.businessId),
        db.prepare("DELETE FROM professional_services WHERE business_id = ? AND professional_id = ?")
          .bind(context.businessId, id),
        ...serviceIds.map((serviceId) => db.prepare(`INSERT INTO professional_services
          (business_id,professional_id,service_id) VALUES (?,?,?)`)
          .bind(context.businessId, id, serviceId)),
      ]);
    } catch (error) {
      throwUniqueName(error);
    }
    await writeAudit(db, {
      businessId: context.businessId, user: context.user, action: "professional.updated",
      entityType: "professional", entityId: id,
      metadata: { activeChanged: existing.active !== (input.active ? 1 : 0), active: input.active, serviceCount: serviceIds.length },
    });
    const professional = await findProfessional(db, context.businessId, id);
    return Response.json({ professional }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("professionals.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ProfessionalPayload>(request, 4096);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Profesional no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const existing = await db.prepare(`SELECT p.id, p.name,
      (SELECT COUNT(*) FROM appointments a WHERE a.business_id = p.business_id AND a.professional_id = p.id) AS appointmentCount,
      (SELECT COUNT(*) FROM time_blocks b WHERE b.business_id = p.business_id AND b.professional_id = p.id) AS blockCount
      FROM professionals p WHERE p.id = ? AND p.business_id = ?`)
      .bind(id, context.businessId).first<{ id: string; name: string; appointmentCount: number; blockCount: number }>();
    if (!existing) throw new HttpError(404, "Profesional no encontrado.");
    if (Number(existing.appointmentCount) > 0 || Number(existing.blockCount) > 0) {
      throw new HttpError(409, "Este profesional tiene historial o bloqueos y no puede eliminarse. Puedes desactivarlo.");
    }
    try {
      await db.batch([
        db.prepare("DELETE FROM business_hours WHERE business_id = ? AND professional_id = ?").bind(context.businessId, id),
        db.prepare("DELETE FROM professional_services WHERE business_id = ? AND professional_id = ?").bind(context.businessId, id),
        db.prepare("DELETE FROM professionals WHERE id = ? AND business_id = ?").bind(id, context.businessId),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("professional_has_dependencies")) {
        throw new HttpError(409, "Este profesional ya tiene datos relacionados y no puede eliminarse.");
      }
      throw error;
    }
    await writeAudit(db, {
      businessId: context.businessId, user: context.user, action: "professional.deleted",
      entityType: "professional", entityId: id, metadata: { name: existing.name },
    });
    return Response.json({ id }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function validateProfessional(body: ProfessionalPayload, defaultActive: boolean) {
  const name = cleanText(body.name, 100);
  const specialty = cleanText(body.specialty, 120);
  const email = normalizeEmail(body.email);
  const phone = cleanText(body.phone, 25);
  const active = booleanValue(body.active, defaultActive);
  if (name.length < 2 || specialty.length < 2 || (email && !isEmail(email)) || (phone && !isPhone(phone))) {
    throw new HttpError(400, "Revisa el nombre, la especialidad, el correo y el teléfono.");
  }
  return { name, specialty, email, phone, active };
}

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new HttpError(400, "Estado de profesional no válido.");
}

async function assertUniqueName(db: D1Database, businessId: string, name: string, excludedId = "") {
  const duplicate = await db.prepare(`SELECT id FROM professionals
    WHERE business_id = ? AND name = ? COLLATE NOCASE AND id <> ?`)
    .bind(businessId, name, excludedId).first();
  if (duplicate) throw new HttpError(409, "Ya existe un profesional con ese nombre.");
}

function throwUniqueName(error: unknown): never {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    throw new HttpError(409, "Ya existe un profesional con ese nombre.");
  }
  throw error;
}

async function findProfessional(db: D1Database, businessId: string, id: string) {
  const professional = await db.prepare(`${professionalSelect}
    WHERE p.business_id = ? AND p.id = ? GROUP BY p.id`).bind(businessId, id).first<ProfessionalRow>();
  if (!professional) throw new HttpError(404, "Profesional no encontrado.");
  return serializeProfessional(professional);
}

function serializeProfessional(row: ProfessionalRow) {
  const { serviceIdsCsv, ...professional } = row;
  return { ...professional, serviceIds: serviceIdsCsv ? serviceIdsCsv.split(",") : [] };
}

async function resolveServiceIds(db: D1Database, businessId: string, value: unknown, professionalId = "") {
  if (value === undefined) {
    const rows = professionalId
      ? await db.prepare(`SELECT service_id AS id FROM professional_services
          WHERE business_id = ? AND professional_id = ? ORDER BY service_id`).bind(businessId, professionalId).all<{ id:string }>()
      : await db.prepare("SELECT id FROM services WHERE business_id = ? AND active = 1 ORDER BY id")
        .bind(businessId).all<{ id:string }>();
    return (rows.results ?? []).map((row) => row.id);
  }
  if (!Array.isArray(value) || value.length > 100) throw new HttpError(400, "La selección de servicios no es válida.");
  const ids = Array.from(new Set(value.map((item) => cleanText(item, 80)).filter(Boolean)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM services
    WHERE business_id = ? AND id IN (${placeholders})`).bind(businessId, ...ids).first<{ count:number }>();
  if (Number(row?.count) !== ids.length) throw new HttpError(400, "Uno de los servicios no pertenece a este negocio.");
  return ids;
}
