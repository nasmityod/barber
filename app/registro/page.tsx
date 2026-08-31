import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { RegisterForm } from "../components/RegisterForm";
import { BrandLogo } from "../components/Brand";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <main className="password-page"><section className="password-card register-card"><BrandLogo /><span className="eyebrow">Registro autónomo</span><h1>Configura tu negocio</h1><p>Crea tu cuenta con correo y contraseña propios. No usamos proveedores externos para acceder.</p><RegisterForm /><footer><ShieldCheck /> Puedes comenzar con el plan Gratis</footer><p className="login-switch">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p></section></main>;
}
