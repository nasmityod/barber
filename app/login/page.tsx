import { redirect } from "next/navigation";
import {
  CalendarCheck, Check, Clock3, LockKeyhole,
  Scissors, ShieldCheck, Sparkles, TrendingUp, UsersRound,
} from "lucide-react";
import { getSessionUser } from "../auth";
import { LoginForm } from "../components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/cambiar-clave" : "/dashboard");

  return (
    <main className="login-page">
      <section className="login-copy">
        <div className="login-brand" aria-label="Corteza">
          <span><Scissors /></span>
          <strong>CORTEZA</strong>
        </div>

        <div className="login-message">
          <span className="login-kicker"><Sparkles /> Gestión inteligente para barberías</span>
          <h1>Tu negocio.<br /><em>Más claro cada día.</em></h1>
          <p>Organiza reservas, clientes y equipo desde un espacio diseñado para trabajar rápido y decidir mejor.</p>
          <ul>
            <li><Check /> Agenda y reservas en tiempo real</li>
            <li><Check /> Información aislada por negocio</li>
            <li><Check /> Accesos y acciones protegidas</li>
          </ul>
        </div>

        <footer><ShieldCheck /> Protección de identidad y datos activa</footer>
      </section>

      <section className="login-access">
        <div className="login-preview" aria-hidden="true">
          <div className="preview-toolbar"><i /><i /><i /><span>Corteza Studio</span></div>
          <div className="preview-body">
            <aside><b>CT</b><i /><i /><i /><i /></aside>
            <div className="preview-content">
              <span>RESUMEN DE HOY</span>
              <strong>Todo bajo control</strong>
              <div className="preview-metrics">
                <div><CalendarCheck /><small>CITAS</small><b>08</b></div>
                <div><TrendingUp /><small>INGRESOS</small><b>$164</b></div>
                <div><UsersRound /><small>CLIENTES</small><b>06</b></div>
              </div>
              <div className="preview-schedule">
                <header><b>Próximas citas</b><span>Hoy</span></header>
                <div><time>10:30</time><i className="blue"/><p><b>Corte + Barba</b><small>55 min</small></p></div>
                <div><time>12:00</time><i className="cyan"/><p><b>Corte Signature</b><small>35 min</small></p></div>
                <div><time>15:30</time><i className="violet"/><p><b>Barba Ritual</b><small>25 min</small></p></div>
              </div>
            </div>
          </div>
          <div className="preview-float"><Clock3 /><span><b>Agenda actualizada</b><small>Disponibilidad en tiempo real</small></span></div>
        </div>

        <div className="login-card">
          <div className="login-lock"><LockKeyhole /></div>
          <span className="eyebrow">Panel administrativo</span>
          <h2>Bienvenido a Corteza</h2>
          <p>Inicia sesión con las credenciales privadas de tu barbería.</p>
          <LoginForm />
          <div className="login-security"><ShieldCheck /><span><b>Acceso propio de Corteza</b><small>Sesión cifrada, protección contra intentos repetidos y permisos por rol.</small></span></div>
        </div>
      </section>
    </main>
  );
}
