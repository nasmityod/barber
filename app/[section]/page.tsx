import { AdminApp } from "../components/AdminApp";
import { getAdminContext, HttpError } from "../security";

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
  if (!context) return <main className="access-denied"><div><span>Acceso no disponible</span><h1>No pudimos cargar el negocio.</h1><p>Comprueba la conexión con la base de datos de Cloudflare.</p></div></main>;
  return <AdminApp section={section} identity={{
    displayName: context.user.displayName,
    email: context.user.email,
    role: context.role,
    businessName: context.businessName,
    businessSlug: context.businessSlug,
    timezone: context.timezone,
  }} />;
}
