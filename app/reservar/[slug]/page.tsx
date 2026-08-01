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
    db.prepare(`SELECT id, name, category, duration_minutes AS durationMinutes, price_cents AS priceCents
      FROM services WHERE business_id = (SELECT id FROM businesses WHERE slug = ?) AND active = 1 ORDER BY price_cents, name`)
      .bind(slug.toLowerCase()).all<BookingCatalog["services"][number]>(),
    db.prepare(`SELECT id, name, specialty FROM professionals
      WHERE business_id = (SELECT id FROM businesses WHERE slug = ?) AND active = 1 ORDER BY name`)
      .bind(slug.toLowerCase()).all<BookingCatalog["professionals"][number]>(),
  ]);
  return <BookingApp slug={slug} initialCatalog={{ business, services: services.results ?? [], professionals: professionals.results ?? [] }} />;
}
