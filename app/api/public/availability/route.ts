import { ensureDatabase } from "../../../../db/init";
import { availableTimes } from "../../../appointments";
import { clientAddress, enforceRateLimit, errorResponse, HttpError, isDate, sha256 } from "../../../security";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const professionalId = url.searchParams.get("professionalId") ?? "";
    const date = url.searchParams.get("date") ?? "";
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug) || !isDate(date)) throw new HttpError(400, "Parámetros no válidos.");
    const db = await ensureDatabase();
    const rateKey = await sha256(`availability:${new Date().toISOString().slice(0, 10)}:${clientAddress(request)}`);
    await enforceRateLimit(db, `availability:${rateKey}`, 180, 60 * 60 * 1000);
    const business = await db.prepare("SELECT id, timezone FROM businesses WHERE slug = ?")
      .bind(slug).first<{ id: string; timezone: string }>();
    if (!business) throw new HttpError(404, "Barbería no encontrada.");
    const times = await availableTimes(db, { businessId: business.id, timezone: business.timezone, serviceId, professionalId, date });
    return Response.json({ times }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
