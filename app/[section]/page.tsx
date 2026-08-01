import { AdminApp } from "../components/AdminApp";
import { getAdminContext, HttpError } from "../security";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  let context;
  try {
    context = await getAdminContext("appointments.read");
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      context = null;
    } else {
      throw error;
    }
  }
  if (!context) return <main className="access-denied"><div><span>Acceso protegido</span><h1>Tu cuenta no pertenece a este negocio.</h1><p>Pide al propietario que te invite con el mismo email de tu cuenta.</p><Link href="/signout-with-chatgpt?return_to=%2Fdashboard">Usar otra cuenta</Link></div></main>;
  return <AdminApp section={section} identity={{
    displayName: context.user.displayName,
    email: context.user.email,
    role: context.role,
    businessName: context.businessName,
    businessSlug: context.businessSlug,
    timezone: context.timezone,
  }} />;
}
