"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiError, readJsonObject } from "./api-json";

export function ResetPasswordForm({ token }: { token: string }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); if (password !== String(form.get("confirmation") ?? "")) { setError("Las contraseñas no coinciden."); setSaving(false); return; } try { const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) }); const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos restablecer la contraseña.")); window.location.assign("/login?reset=1"); } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos restablecer la contraseña."); setSaving(false); } };
  return <form className="login-form" onSubmit={submit}><label>Nueva contraseña<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label><label>Confirmar contraseña<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="login-button" disabled={saving}>{saving ? "Guardando…" : <>Guardar contraseña <ArrowRight /></>}</button></form>;
}
