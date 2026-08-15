import { ensureDatabase } from "../../../../../db/init";
import { updateAppointment } from "../../../../appointments";
import { getPortalAppointment, portalDetails } from "../../../../portal";
import {
  assertSameOrigin, clientAddress, cleanText, enforceRateLimit, errorResponse, HttpError,
  isWithinBookingWindow, localDateTimeTimestamp, readJson, sha256, writeAudit,
} from "../../../../security";

type PortalPayload = { action?: unknown; date?: unknown; time?: unknown; reason?: unknown };

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; const db = await ensureDatabase();
    const appointment = await getPortalAppointment(db, token, true);
    if (!appointment) throw new HttpError(404, "El enlace de la cita no es válido o ya venció.");
    return Response.json(portalDetails(appointment), { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const { token } = await params; const body = await readJson<PortalPayload>(request, 8_192); const action = cleanText(body.action, 20);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `public-appointment:${await sha256(`${clientAddress(request)}:${token}`)}`, 20, 15 * 60 * 1000);
    const appointment = await getPortalAppointment(db, token);
    if (!appointment) throw new HttpError(404, "El enlace de la cita no es válido o ya venció.");
    if (action === "confirm") {
      if (appointment.status === "confirmada") return Response.json(portalDetails(appointment), { headers: { "cache-control": "no-store" } });
      if (appointment.status !== "programada") throw new HttpError(409, "Esta cita ya no se puede confirmar.");
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("UPDATE appointments SET status='confirmada' WHERE id=? AND business_id=? AND status='programada'").bind(appointment.appointmentId, appointment.businessId),
        db.prepare(`INSERT INTO audit_logs (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
          VALUES (?,?,NULL,NULL,'appointment.client_confirmed','appointment',?,?,?)`).bind(crypto.randomUUID(), appointment.businessId, appointment.appointmentId, JSON.stringify({ source: "portal" }), now),
      ]);
      const saved = await getPortalAppointment(db, token);
      return Response.json(saved ? portalDetails(saved) : {}, { headers: { "cache-control": "no-store" } });
    }
    if (!["cancel", "reschedule"].includes(action)) throw new HttpError(400, "Acción no válida.");
    if (!["programada", "confirmada"].includes(appointment.status)) throw new HttpError(409, "Esta cita ya no se puede modificar.");
    const startAt = localDateTimeTimestamp(appointment.appointmentDate, appointment.startTime, appointment.timezone);
    if (!Number.isFinite(startAt) || startAt <= Date.now() || startAt - Date.now() < appointment.cancellationWindowHours * 60 * 60 * 1000) {
      throw new HttpError(409, `Los cambios deben hacerse con al menos ${appointment.cancellationWindowHours} horas de anticipación.`);
    }
    if (action === "cancel") {
      if (appointment.allowClientCancellation !== 1) throw new HttpError(403, "La barbería no permite cancelaciones desde este enlace.");
      const reason = cleanText(body.reason, 180) || "Cancelada por cliente desde el portal"; const now = new Date().toISOString();
      await db.batch([
        db.prepare("UPDATE appointments SET status='cancelada', cancellation_reason=? WHERE id=? AND business_id=? AND status IN ('programada','confirmada')").bind(reason, appointment.appointmentId, appointment.businessId),
        db.prepare("DELETE FROM appointment_slots WHERE appointment_id=? AND business_id=?").bind(appointment.appointmentId, appointment.businessId),
        db.prepare(`INSERT INTO audit_logs (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
          VALUES (?,?,NULL,NULL,'appointment.client_cancelled','appointment',?,?,?)`).bind(crypto.randomUUID(), appointment.businessId, appointment.appointmentId, JSON.stringify({ reason, source: "portal", cancellationFeePercent: appointment.cancellationFeePercent }), now),
      ]);
      const saved = await getPortalAppointment(db, token);
      return Response.json(saved ? portalDetails(saved) : {}, { headers: { "cache-control": "no-store" } });
    }
    const date = cleanText(body.date, 10); const time = cleanText(body.time, 5);
    if (!isWithinBookingWindow(date, time, appointment.timezone, appointment.bookingLeadMinutes, appointment.bookingMaxDays)) throw new HttpError(400, "La nueva fecha o hora no está dentro de la ventana de reservas.");
    const savedAppointment = await updateAppointment(db, {
      id: appointment.appointmentId, businessId: appointment.businessId, timezone: appointment.timezone,
      name: appointment.clientName, email: appointment.clientEmail, phone: appointment.clientPhone,
      serviceId: appointment.serviceId, professionalId: appointment.professionalId, date, time,
      notes: appointment.notes, resourceId: appointment.resourceId, actor: null,
    });
    await writeAudit(db, { businessId: appointment.businessId, action: "appointment.client_rescheduled", entityType: "appointment", entityId: appointment.appointmentId, metadata: { source: "portal", fromDate: appointment.appointmentDate, fromTime: appointment.startTime, toDate: date, toTime: time } });
    const refreshed = await getPortalAppointment(db, token);
    return Response.json(refreshed ? portalDetails(refreshed) : { appointment: savedAppointment }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
