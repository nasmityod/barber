import { ensureDatabase } from "../../../../db/init";
import { availableTimes } from "../../../appointments";
import { cleanText, enforceRateLimit, errorResponse, getAdminContext, HttpError, isDate } from "../../../security";

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const url = new URL(request.url);
    const serviceId = cleanText(url.searchParams.get("serviceId"), 80);
    const professionalId = cleanText(url.searchParams.get("professionalId"), 80);
    const date = cleanText(url.searchParams.get("date"), 10);
    const appointmentId = cleanText(url.searchParams.get("appointmentId"), 80);
    const resourceId = cleanText(url.searchParams.get("resourceId"), 80) || null;
    if (!serviceId || !professionalId || !appointmentId || !isDate(date)) {
      throw new HttpError(400, "Parámetros no válidos.");
    }
    const db = await ensureDatabase();
    await enforceRateLimit(db, `admin-read:${context.user.userId}`, 240, 60 * 1000);
    const appointment = await db.prepare("SELECT id FROM appointments WHERE id = ? AND business_id = ?")
      .bind(appointmentId, context.businessId).first();
    if (!appointment) throw new HttpError(404, "Cita no encontrada.");
    const times = await availableTimes(db, {
      businessId: context.businessId, timezone: context.timezone, serviceId, professionalId, date,
      excludeAppointmentId: appointmentId, resourceId,
    });
    return Response.json({ times }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
