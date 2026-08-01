import { AdminApp } from "../components/AdminApp";
import { getAdminContext, HttpError } from "../security";
import Link from "next/link";
import { getSessionUser } from "../auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const session = await getSessionUser();
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(`/${section}`)}`);
  if (session.mustChangePassword) redirect("/cambiar-clave");
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
  if (!context) return <main className="access-denied"><div><span>Acceso protegido</span><h1>Tu cuenta no pertenece a este negocio.</h1><p>Pide al propietario que revise tu acceso.</p><Link href="/login">Volver al acceso</Link></div></main>;
  return <AdminApp section={section} identity={{
    displayName: context.user.displayName,
    email: context.user.email,
    role: context.role,
    businessName: context.businessName,
    businessSlug: context.businessSlug,
    timezone: context.timezone,
  }} />;
}
