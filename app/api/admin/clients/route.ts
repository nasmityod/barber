import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, isEmail, isPhone, normalizeEmail, readJson, writeAudit,
} from "../../../security";

type ClientPayload = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
};

const clientSelect = `SELECT c.id, c.name, c.email, c.phone, c.notes, c.created_at AS createdAt,
  COUNT(a.id) AS appointmentCount,
  SUM(CASE WHEN a.status = 'completada' THEN 1 ELSE 0 END) AS completedCount,
  COALESCE(SUM(CASE WHEN a.status = 'completada' THEN a.total_cents ELSE 0 END), 0) AS totalSpentCents,
  MAX(a.appointment_date) AS lastAppointmentDate
  FROM clients c
  LEFT JOIN appointments a ON a.client_id = c.id AND a.business_id = c.business_id`;

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("clients.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const clientId = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (clientId) {
      const client = await db.prepare(`${clientSelect}
        WHERE c.business_id = ? AND c.id = ? GROUP BY c.id`)
        .bind(context.businessId, clientId).first();
      if (!client) throw new HttpError(404, "Cliente no encontrado.");
      const history = await db.prepare(`SELECT a.id, a.appointment_date AS date, a.start_time AS time,
        a.end_time AS endTime, a.status, a.source, a.total_cents AS totalCents,
        s.name AS serviceName, p.name AS professionalName, a.notes
        FROM appointments a
        JOIN services s ON s.id = a.service_id AND s.business_id = a.business_id
        JOIN professionals p ON p.id = a.professional_id AND p.business_id = a.business_id
        WHERE a.business_id = ? AND a.client_id = ?
        ORDER BY a.appointment_date DESC, a.start_time DESC LIMIT 100`)
        .bind(context.businessId, clientId).all();
      return Response.json({ client, history: history.results ?? [], canManage: context.role !== "professional" },
        { headers: { "cache-control": "no-store" } });
    }
    const clients = await db.prepare(`${clientSelect}
      WHERE c.business_id = ? GROUP BY c.id ORDER BY c.name COLLATE NOCASE ASC LIMIT 1000`)
      .bind(context.businessId).all();
    return Response.json({ clients: clients.results ?? [], canManage: context.role !== "professional" },
      { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("clients.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const input = await clientInput(request);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const duplicate = await db.prepare("SELECT id FROM clients WHERE business_id = ? AND email = ?")
      .bind(context.businessId, input.email).first();
    if (duplicate) throw new HttpError(409, "Ya existe un cliente con ese correo.");
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO clients (id,business_id,name,email,phone,notes,created_at)
      VALUES (?,?,?,?,?,?,?)`).bind(id, context.businessId, input.name, input.email, input.phone, input.notes, new Date().toISOString()).run();
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "client.created", entityType: "client", entityId: id });
    const client = await findClient(db, context.businessId, id);
    return Response.json({ client }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("clients.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ClientPayload>(request);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Cliente no válido.");
    const input = validateClient(body);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const existing = await db.prepare("SELECT id, email FROM clients WHERE id = ? AND business_id = ?")
      .bind(id, context.businessId).first<{ id: string; email: string }>();
    if (!existing) throw new HttpError(404, "Cliente no encontrado.");
    const duplicate = await db.prepare("SELECT id FROM clients WHERE business_id = ? AND email = ? AND id <> ?")
      .bind(context.businessId, input.email, id).first();
    if (duplicate) throw new HttpError(409, "Ya existe otro cliente con ese correo.");
    await db.prepare("UPDATE clients SET name = ?, email = ?, phone = ?, notes = ? WHERE id = ? AND business_id = ?")
      .bind(input.name, input.email, input.phone, input.notes, id, context.businessId).run();
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "client.updated", entityType: "client", entityId: id, metadata: { emailChanged: existing.email !== input.email } });
    const client = await findClient(db, context.businessId, id);
    return Response.json({ client }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("clients.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ClientPayload>(request, 4096);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Cliente no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const existing = await db.prepare(`SELECT c.id, COUNT(a.id) AS appointmentCount
      FROM clients c LEFT JOIN appointments a ON a.client_id = c.id AND a.business_id = c.business_id
      WHERE c.id = ? AND c.business_id = ? GROUP BY c.id`).bind(id, context.businessId)
      .first<{ id: string; appointmentCount: number }>();
    if (!existing) throw new HttpError(404, "Cliente no encontrado.");
    if (Number(existing.appointmentCount) > 0) throw new HttpError(409, "No puedes eliminar un cliente que tiene citas. Puedes editar sus datos.");
    try {
      await db.prepare("DELETE FROM clients WHERE id = ? AND business_id = ?").bind(id, context.businessId).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("client_has_appointments")) {
        throw new HttpError(409, "No puedes eliminar un cliente que tiene citas.");
      }
      throw error;
    }
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "client.deleted", entityType: "client", entityId: id });
    return Response.json({ id }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function clientInput(request: Request) {
  return validateClient(await readJson<ClientPayload>(request));
}

function validateClient(body: ClientPayload) {
  const name = cleanText(body.name, 100);
  const email = normalizeEmail(body.email);
  const phone = cleanText(body.phone, 25);
  const notes = cleanText(body.notes, 1000);
  if (name.length < 2 || !isEmail(email) || !isPhone(phone)) {
    throw new HttpError(400, "Revisa el nombre, correo y teléfono.");
  }
  return { name, email, phone, notes };
}

async function findClient(db: D1Database, businessId: string, id: string) {
  const client = await db.prepare(`${clientSelect}
    WHERE c.business_id = ? AND c.id = ? GROUP BY c.id`).bind(businessId, id).first();
  if (!client) throw new HttpError(404, "Cliente no encontrado.");
  return client;
}
