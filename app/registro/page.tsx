import Link from "next/link";
import { Scissors, ShieldCheck } from "lucide-react";
import { RegisterForm } from "../components/RegisterForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <main className="password-page"><section className="password-card register-card"><div className="login-brand dark"><span><Scissors /></span><strong>CORTEZA</strong></div><span className="eyebrow">Registro autónomo</span><h1>Configura tu negocio</h1><p>Crea tu cuenta con correo y contraseña propios. No usamos Login with ChatGPT ni proveedores externos para acceder.</p><RegisterForm /><footer><ShieldCheck /> 14 días de prueba · Puedes comenzar con el plan Gratis</footer><p className="login-switch">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p></section></main>;
}
