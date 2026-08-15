import { ensureDatabase } from "../../../db/init";
import { getPublicCatalog } from "../../public-catalog";
import { BookingApp } from "../../components/BookingApp";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getPublicCatalog(await ensureDatabase(), slug.toLowerCase());
  return <BookingApp slug={slug} initialCatalog={catalog} />;
}
