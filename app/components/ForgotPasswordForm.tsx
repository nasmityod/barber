"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiError, readJsonObject } from "./api-json";

export function ForgotPasswordForm() {
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json", "x-corteza-local-recovery": "1" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) }); const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos procesar la solicitud.")); setMessage(typeof body.resetUrl === "string" ? `Enlace de recuperación generado: ${window.location.origin}${body.resetUrl}` : "Si el correo existe, recibirás instrucciones para recuperar la contraseña."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos procesar la solicitud."); } finally { setSaving(false); }
  };
  return <form className="login-form" onSubmit={submit}><label>Correo electrónico<input name="email" type="email" required autoComplete="email" placeholder="tu@barberia.com" /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="login-button" disabled={saving}>{saving ? "Procesando…" : <>Enviar instrucciones <ArrowRight /></>}</button></form>;
}
