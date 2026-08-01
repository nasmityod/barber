import { ensureDatabase } from "../../../../db/init";
import { createAppointment } from "../../../appointments";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, normalizeEmail, readJson, sha256,
} from "../../../security";

type AppointmentPayload = {
  name?: unknown; email?: unknown; phone?: unknown; serviceId?: unknown;
  professionalId?: unknown; date?: unknown; time?: unknown; notes?: unknown;
};

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
