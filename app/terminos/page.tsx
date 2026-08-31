import Link from "next/link";

export const metadata = { title: "Términos de servicio · 787 Barber Studio" };

export default function TermsPage() {
  return <main className="legal-page"><article className="legal-card"><span className="eyebrow">787 · vigente 01/08/2026</span><h1>Términos de servicio</h1><p>Esta plataforma proporciona herramientas de agenda, clientes, cobros y reservas para negocios independientes. El propietario es responsable de los datos que incorpora y de mantener sus credenciales seguras.</p><h2>Uso permitido</h2><p>Usa el sistema para gestionar tu negocio de forma legal. No compartas credenciales, no intentes acceder a otro negocio y no uses la plataforma para fraude o abuso.</p><h2>Planes y pagos</h2><p>El plan seleccionado define límites y funciones. Las solicitudes de depósitos a clientes quedan bajo confirmación del negocio; la plataforma no guarda números completos de tarjetas.</p><h2>Datos y disponibilidad</h2><p>Aplicamos aislamiento por negocio, sesiones seguras y copias exportables. Ningún servicio online puede garantizar disponibilidad absoluta, por lo que recomendamos descargar respaldos periódicos.</p><p><Link href="/registro">Volver al registro</Link> · <Link href="/privacidad">Política de privacidad</Link></p></article></main>;
}
