import Link from "next/link";

export const metadata = { title: "Privacidad · Corteza" };

export default function PrivacyPage() {
  return <main className="legal-page"><article className="legal-card"><span className="eyebrow">Corteza · privacidad</span><h1>Política de privacidad</h1><p>Guardamos los datos necesarios para operar tu negocio: cuenta, clientes, citas, cobros y registros de seguridad. Cada consulta administrativa se limita al negocio de la sesión.</p><h2>Seguridad y retención</h2><p>Las contraseñas se almacenan como hashes con saltos únicos, los tokens expiran y las acciones sensibles quedan auditadas. Puedes descargar una copia de los datos de tu negocio desde el Centro de seguridad.</p><h2>Tus derechos</h2><p>Puedes solicitar corrección o eliminación de datos cuando no existan dependencias operativas. Para consultas, escribe al correo de soporte configurado por tu cuenta.</p><p><Link href="/registro">Volver al registro</Link> · <Link href="/terminos">Términos de servicio</Link></p></article></main>;
}
