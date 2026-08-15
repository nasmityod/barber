import { ensureDatabase } from "../../../../db/init";
import { availableTimes } from "../../../appointments";
import { clientAddress, enforceRateLimit, errorResponse, HttpError, isDate, isWithinBookingWindow, localDate, localDateAfter, sha256 } from "../../../security";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const professionalId = url.searchParams.get("professionalId") ?? "";
    const date = url.searchParams.get("date") ?? "";
    const resourceId = url.searchParams.get("resourceId")?.trim() || null;
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug) || !isDate(date)) throw new HttpError(400, "Parámetros no válidos.");
    const db = await ensureDatabase();
    const rateKey = await sha256(`availability:${new Date().toISOString().slice(0, 10)}:${clientAddress(request)}`);
    await enforceRateLimit(db, `availability:${rateKey}`, 180, 60 * 60 * 1000);
    const business = await db.prepare(`SELECT business.id, business.timezone,
        COALESCE(settings.booking_lead_minutes, 60) AS bookingLeadMinutes,
        COALESCE(settings.booking_max_days, 60) AS bookingMaxDays
      FROM businesses business LEFT JOIN business_settings settings ON settings.business_id = business.id
      WHERE business.slug = ?`)
      .bind(slug).first<{ id: string; timezone: string; bookingLeadMinutes: number; bookingMaxDays: number }>();
    if (!business) throw new HttpError(404, "Barbería no encontrada.");
    if (date < localDate(business.timezone) || date > localDateAfter(business.timezone, business.bookingMaxDays)) {
      return Response.json({ times: [] }, { headers: { "cache-control": "no-store" } });
    }
    const times = await availableTimes(db, { businessId: business.id, timezone: business.timezone, serviceId, professionalId, date, resourceId });
    return Response.json({ times: times.filter((time) => isWithinBookingWindow(date, time, business.timezone, business.bookingLeadMinutes, business.bookingMaxDays)) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
