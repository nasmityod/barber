import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm";
import { BrandLogo } from "../components/Brand";

export default function ForgotPasswordPage() { return <main className="password-page"><section className="password-card"><BrandLogo /><div className="login-lock"><KeyRound /></div><span className="eyebrow">Recuperación segura</span><h1>Recupera tu contraseña</h1><p>Escribe el correo de tu cuenta. No revelaremos si existe y el enlace caduca en 30 minutos.</p><ForgotPasswordForm /><footer><ShieldCheck /> Nunca compartas un enlace de recuperación.</footer><p className="login-switch"><Link href="/login">Volver al acceso</Link></p></section></main>; }
