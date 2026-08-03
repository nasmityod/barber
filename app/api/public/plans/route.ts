import { ensureDatabase } from "../../../../db/init";

export async function GET() {
  const db = await ensureDatabase();
  const rows = await db.prepare("SELECT id,name,description,monthly_price_cents AS monthlyPriceCents,max_professionals AS maxProfessionals,max_appointments AS maxAppointments FROM plans WHERE active=1 ORDER BY monthly_price_cents").all();
  return Response.json({ plans: rows.results ?? [] }, { headers: { "cache-control": "public, max-age=300" } });
}
