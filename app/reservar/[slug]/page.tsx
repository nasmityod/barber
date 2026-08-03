import { BookingApp, type BookingCatalog } from "../../components/BookingApp";
import { ensureDatabase } from "../../../db/init";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await ensureDatabase();
  const business = await db.prepare(`SELECT name, slug, timezone, currency FROM businesses WHERE slug = ?`)
    .bind(slug.toLowerCase()).first<BookingCatalog["business"]>();
  if (!business) return <BookingApp slug={slug} initialCatalog={null} />;
  const [services, professionals] = await Promise.all([
    db.prepare(`SELECT s.id, s.name, s.category, s.duration_minutes AS durationMinutes, s.price_cents AS priceCents
      FROM services s WHERE s.business_id = (SELECT id FROM businesses WHERE slug = ?) AND s.active = 1 AND EXISTS (
        SELECT 1 FROM professional_services ps JOIN professionals p
          ON p.id = ps.professional_id AND p.business_id = ps.business_id AND p.active = 1
        WHERE ps.business_id = s.business_id AND ps.service_id = s.id
      ) ORDER BY s.price_cents, s.name`)
      .bind(slug.toLowerCase()).all<BookingCatalog["services"][number]>(),
    db.prepare(`SELECT p.id, p.name, p.specialty,
      COALESCE(GROUP_CONCAT(ps.service_id), '') AS serviceIdsCsv
      FROM professionals p LEFT JOIN professional_services ps
        ON ps.business_id = p.business_id AND ps.professional_id = p.id
      WHERE p.business_id = (SELECT id FROM businesses WHERE slug = ?) AND p.active = 1
      GROUP BY p.id ORDER BY p.name`)
      .bind(slug.toLowerCase()).all<{id:string;name:string;specialty:string;serviceIdsCsv:string}>(),
  ]);
  const availableProfessionals=(professionals.results??[]).map(({serviceIdsCsv,...professional})=>({
    ...professional,serviceIds:serviceIdsCsv?serviceIdsCsv.split(","):[],
  }));
  return <BookingApp slug={slug} initialCatalog={{ business, services: services.results ?? [], professionals: availableProfessionals }} />;
}
