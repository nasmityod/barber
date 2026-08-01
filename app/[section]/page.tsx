import { AdminApp } from "../components/AdminApp";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <AdminApp section={section} />;
}
