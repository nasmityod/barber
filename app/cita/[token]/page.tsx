import { notFound } from "next/navigation";
import { ensureDatabase } from "../../../db/init";
import { getPortalAppointment, portalDetails } from "../../portal";
import { ClientPortal } from "../../components/ClientPortal";

export const dynamic = "force-dynamic";

export default async function ClientAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const appointment = await getPortalAppointment(await ensureDatabase(), token);
  if (!appointment) notFound();
  return <main className="client-portal-page"><ClientPortal token={token} initialData={portalDetails(appointment)} /></main>;
}
