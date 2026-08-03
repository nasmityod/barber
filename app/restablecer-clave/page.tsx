import Link from "next/link";
import { KeyRound, Scissors } from "lucide-react";
import { ResetPasswordForm } from "../components/ResetPasswordForm";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token } = await searchParams; return <main className="password-page"><section className="password-card"><div className="login-brand dark"><span><Scissors /></span><strong>CORTEZA</strong></div><div className="login-lock"><KeyRound /></div><span className="eyebrow">Nueva contraseña</span><h1>Restablece tu acceso</h1>{token ? <ResetPasswordForm token={token} /> : <p className="form-error">Falta el enlace de recuperación. Solicita uno nuevo.</p>}<p className="login-switch"><Link href="/recuperar-clave">Solicitar otro enlace</Link></p></section></main>; }
