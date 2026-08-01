import { ensureDatabase } from "../../../../db/init";
import { createAppointment } from "../../../appointments";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, normalizeEmail, readJson, sha256, writeAudit,
} from "../../../security";

type AppointmentPayload = {
  name?: unknown; email?: unknown; phone?: unknown; serviceId?: unknown;
  professionalId?: unknown; date?: unknown; time?: unknown; notes?: unknown;
};

type StatusPayload = { id?: unknown; status?: unknown };

export async function GET() {
  try {
    const context = await getAdminContext("appointments.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const result = await db.prepare(`SELECT a.id, a.appointment_date AS date, a.start_time AS time,
      a.end_time AS endTime, a.status, a.source, a.total_cents AS totalCents,
      c.name AS clientName, c.phone, c.email, s.name AS serviceName,
      p.name AS professionalName
      FROM appointments a
      JOIN clients c ON c.id = a.client_id AND c.business_id = a.business_id
      JOIN services s ON s.id = a.service_id AND s.business_id = a.business_id
      JOIN professionals p ON p.id = a.professional_id AND p.business_id = a.business_id
      WHERE a.business_id = ?
      ORDER BY a.appointment_date ASC, a.start_time ASC LIMIT 100`)
      .bind(context.businessId).all();
    return Response.json({ appointments: result.results ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<AppointmentPayload>(request);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(idempotencyKey)) throw new HttpError(400, "Solicitud no válida.");
    const result = await createAppointment(db, {
      businessId: context.businessId, timezone: context.timezone,
      name: cleanText(body.name, 100), email: normalizeEmail(body.email), phone: cleanText(body.phone, 25),
      serviceId: cleanText(body.serviceId, 80), professionalId: cleanText(body.professionalId, 80),
      date: cleanText(body.date, 10), time: cleanText(body.time, 5), notes: cleanText(body.notes, 500),
      source: "panel", idempotencyHash: await sha256(`${context.businessId}:${idempotencyKey}`), actor: context.user,
    });
    return Response.json({ id: result.id, message: result.duplicate ? "Cita ya creada" : "Cita creada" },
      { status: result.duplicate ? 200 : 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<StatusPayload>(request);
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 24);
    if (!id || !["programada", "confirmada", "en_progreso", "completada", "cancelada", "no_asistio"].includes(status)) {
      throw new HttpError(400, "Estado de cita no válido.");
    }
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-write:${context.user.userId}`, 60, 60 * 1000);
    const appointment = await db.prepare("SELECT status FROM appointments WHERE id = ? AND business_id = ?")
      .bind(id, context.businessId).first<{ status:string }>();
    if (!appointment) throw new HttpError(404, "Cita no encontrada.");
    const allowed: Record<string, readonly string[]> = {
      programada: ["confirmada", "cancelada", "no_asistio"],
      confirmada: ["en_progreso", "cancelada", "no_asistio"],
      en_progreso: ["completada", "cancelada"],
    };
    if (appointment.status !== status && !(allowed[appointment.status] ?? []).includes(status)) {
      throw new HttpError(409, "Ese cambio de estado no está permitido.");
    }
    if (appointment.status !== status) {
      const statements = [db.prepare("UPDATE appointments SET status = ? WHERE id = ? AND business_id = ?").bind(status, id, context.businessId)];
      if (status === "cancelada" || status === "no_asistio") statements.push(db.prepare("DELETE FROM appointment_slots WHERE appointment_id = ? AND business_id = ?").bind(id, context.businessId));
      await db.batch(statements);
      await writeAudit(db, { businessId: context.businessId, user: context.user, action: "appointment.status_updated", entityType: "appointment", entityId: id, metadata: { from: appointment.status, to: status } });
    }
    return Response.json({ id, status }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
