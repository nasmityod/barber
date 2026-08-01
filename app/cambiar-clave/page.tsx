import { redirect } from "next/navigation";
import { KeyRound, Scissors, ShieldCheck } from "lucide-react";
import { getSessionUser } from "../auth";
import { PasswordForm } from "../components/PasswordForm";

export const dynamic="force-dynamic";

export default async function ChangePasswordPage(){
  const user=await getSessionUser();
  if(!user)redirect("/login");
  return <main className="password-page"><section className="password-card"><div className="login-brand dark"><span><Scissors/></span><strong>CORTEZA</strong></div><div className="login-lock"><KeyRound/></div><span className="eyebrow">Primer acceso</span><h1>Crea tu contraseña personal</h1><p>Por seguridad debes reemplazar la clave temporal antes de entrar al dashboard.</p><PasswordForm/><footer><ShieldCheck/> Tu nueva contraseña se guarda mediante un hash seguro.</footer></section></main>
}
