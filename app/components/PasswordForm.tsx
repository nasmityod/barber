"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiError, readJsonObject } from "./api-json";

export function PasswordForm(){
  const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError("");const form=new FormData(event.currentTarget);const currentPassword=String(form.get("currentPassword")??"");const newPassword=String(form.get("newPassword")??"");const confirmation=String(form.get("confirmation")??"");if(newPassword!==confirmation){setError("Las contraseñas nuevas no coinciden.");setSaving(false);return}try{const response=await fetch("/api/auth/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos cambiar la contraseña"));window.location.assign("/dashboard")}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cambiar la contraseña");setSaving(false)}};
  return <form className="login-form" onSubmit={submit}><label>Contraseña temporal<input name="currentPassword" type="password" required autoComplete="current-password"/></label><label>Nueva contraseña<input name="newPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label><label>Confirmar contraseña<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label><small className="password-help">Mínimo 10 caracteres, con letras y números.</small>{error&&<p className="form-error" role="alert">{error}</p>}<button className="login-button" disabled={saving}>{saving?"Guardando…":<>Guardar y continuar <ArrowRight/></>}</button></form>
}
