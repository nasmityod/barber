"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiError, readJsonObject } from "./api-json";

export function RegisterForm() {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos crear tu negocio."));
      window.location.assign("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos crear tu negocio."); setSaving(false); }
  };
  return <form className="login-form register-form" onSubmit={submit}>
    <label>Nombre del negocio<input name="businessName" required minLength={2} maxLength={100} placeholder="Nombre de tu barbería" /></label>
    <label>Tu nombre<input name="displayName" required minLength={2} maxLength={100} autoComplete="name" placeholder="Andrea Silva" /></label>
    <label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="tu@barberia.com" /></label>
    <label>Enlace público (opcional)<input name="slug" maxLength={50} pattern="[A-Za-z0-9-]+" placeholder="mi-barberia" /><small className="password-help">Se usará en tu enlace de reservas.</small></label>
    <label>Plan<select name="planId" defaultValue="free"><option value="free">Gratis · sin tarjeta</option><option value="pro">Pro · para crecer</option><option value="business">Business · equipos grandes</option></select></label>
    <label>Contraseña<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Mínimo 10 caracteres, letras y números" /></label>
    <label className="checkbox-field"><input name="acceptedTerms" type="checkbox" value="true" required /><span>Acepto los <a href="/terminos" target="_blank" rel="noreferrer">términos</a> y la <a href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</a>.</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="login-button" disabled={saving}>{saving ? "Creando negocio…" : <>Crear mi negocio <ArrowRight /></>}</button>
  </form>;
}
