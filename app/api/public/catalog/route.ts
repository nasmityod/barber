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
    const [services, professionals, gallery, reviews] = await Promise.all([
      db.prepare(`SELECT s.id, s.name, s.category, s.duration_minutes AS durationMinutes, s.price_cents AS priceCents
        FROM services s WHERE s.business_id = ? AND s.active = 1 AND EXISTS (
          SELECT 1 FROM professional_services ps JOIN professionals p
            ON p.id = ps.professional_id AND p.business_id = ps.business_id AND p.active = 1
          WHERE ps.business_id = s.business_id AND ps.service_id = s.id
        ) ORDER BY s.price_cents, s.name`)
        .bind(business.id).all(),
      db.prepare(`SELECT p.id, p.name, p.specialty,
        COALESCE(GROUP_CONCAT(ps.service_id), '') AS serviceIdsCsv
        FROM professionals p LEFT JOIN professional_services ps
          ON ps.business_id = p.business_id AND ps.professional_id = p.id
        WHERE p.business_id = ? AND p.active = 1
        GROUP BY p.id ORDER BY p.name`).bind(business.id).all<{id:string;name:string;specialty:string;serviceIdsCsv:string}>(),
      db.prepare(`SELECT id,title,image_url AS imageUrl,caption FROM gallery_items WHERE business_id=? AND active=1 ORDER BY sort_order,created_at DESC LIMIT 30`).bind(business.id).all(),
      db.prepare(`SELECT r.id,r.rating,r.comment,r.created_at AS createdAt,c.name AS clientName FROM reviews r LEFT JOIN clients c ON c.id=r.client_id AND c.business_id=r.business_id WHERE r.business_id=? AND r.status='published' ORDER BY r.published_at DESC, r.created_at DESC LIMIT 30`).bind(business.id).all(),
    ]);
    return Response.json({
      business: { name: business.name, slug: business.slug, timezone: business.timezone, currency: business.currency },
      services: services.results ?? [],
      gallery: gallery.results ?? [],
      reviews: reviews.results ?? [],
      professionals: (professionals.results ?? []).map(({serviceIdsCsv,...professional})=>({
        ...professional,serviceIds:serviceIdsCsv?serviceIdsCsv.split(","):[],
      })),
    }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return errorResponse(error);
  }
}
