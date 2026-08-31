import { KeyRound, ShieldCheck } from "lucide-react";
import { PasswordForm } from "../components/PasswordForm";
import { getSessionUser } from "../auth";
import { redirect } from "next/navigation";
import { BrandLogo } from "../components/Brand";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <main className="password-page"><section className="password-card"><BrandLogo /><div className="login-lock"><KeyRound/></div><span className="eyebrow">Primer acceso</span><h1>Crea tu contraseña personal</h1><p>Por seguridad debes reemplazar la clave temporal antes de entrar al panel.</p><PasswordForm/><footer><ShieldCheck/> Tu nueva contraseña se guarda mediante un hash seguro.</footer></section></main>
}
