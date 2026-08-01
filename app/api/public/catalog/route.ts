import { ensureDatabase } from "../../../../db/init";
import { clientAddress, enforceRateLimit, errorResponse, HttpError, sha256 } from "../../../security";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug)) throw new HttpError(400, "Negocio no válido.");
    const db = await ensureDatabase();
    const rateKey = await sha256(`catalog:${new Date().toISOString().slice(0, 10)}:${clientAddress(request)}`);
    await enforceRateLimit(db, `catalog:${rateKey}`, 120, 60 * 60 * 1000);
    const business = await db.prepare(`SELECT id, name, slug, timezone, currency
      FROM businesses WHERE slug = ?`).bind(slug)
      .first<{ id: string; name: string; slug: string; timezone: string; currency: string }>();
    if (!business) throw new HttpError(404, "Barbería no encontrada.");
    const [services, professionals] = await Promise.all([
      db.prepare(`SELECT id, name, category, duration_minutes AS durationMinutes, price_cents AS priceCents
        FROM services WHERE business_id = ? AND active = 1 ORDER BY price_cents, name`)
        .bind(business.id).all(),
      db.prepare(`SELECT id, name, specialty FROM professionals
        WHERE business_id = ? AND active = 1 ORDER BY name`).bind(business.id).all(),
    ]);
    return Response.json({
      business: { name: business.name, slug: business.slug, timezone: business.timezone, currency: business.currency },
      services: services.results ?? [], professionals: professionals.results ?? [],
    }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return errorResponse(error);
  }
}
