import { redirect } from "next/navigation";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { getSessionUser } from "../auth";
import { LoginForm } from "../components/LoginForm";
import { BrandLockup, BrandLogo } from "../components/Brand";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/cambiar-clave" : "/dashboard");

  return (
    <main className="login-page">
      <section className="login-copy">
        <BrandLockup caption="Sistema interno" />

        <div className="login-message">
          <span className="login-kicker"><Sparkles /> Sistema interno del estudio</span>
          <h1>Todo el estudio,<br /><em>en un solo panel.</em></h1>
          <p>Agenda, turno del día, clientes, cobros y arqueo de 787 Barber Studio. Entrada reservada al equipo.</p>
          <ul>
            <li><Check /> Agenda y reservas en tiempo real</li>
            <li><Check /> Cobros y caja con trazabilidad</li>
            <li><Check /> Permisos por rol y sesión protegida</li>
          </ul>
        </div>

        <footer><ShieldCheck /> Protección de identidad y datos activa</footer>
        <span className="watermark-787" aria-hidden="true">787</span>
      </section>

      <section className="login-access">
        <div className="login-card">
          <BrandLogo />
          <span className="eyebrow">Acceso privado</span>
          <h2>Entra a 787 Barber Studio</h2>
          <p>Usa las credenciales del estudio. Cada intento queda registrado.</p>
          <LoginForm />
          <p className="login-switch">¿Configuras un negocio nuevo? <Link href="/registro">Crea tu cuenta</Link></p>
          <div className="login-security"><ShieldCheck /><span><b>Acceso propio de 787</b><small>Sesión cifrada, protección contra intentos repetidos y permisos por rol.</small></span></div>
        </div>
      </section>
    </main>
  );
}
