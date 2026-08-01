"use client";

import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { apiError, readJsonObject } from "./api-json";

export function LoginForm() {
  const [showPassword,setShowPassword]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setSaving(true);setError("");
    const form=new FormData(event.currentTarget);
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(form.entries()))});
      const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos iniciar sesión"));
      window.location.assign(data.mustChangePassword===true?"/cambiar-clave":"/dashboard");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos iniciar sesión");setSaving(false)}
  };
  return <form className="login-form" onSubmit={submit}>
    <label>Correo electrónico<input name="email" type="email" autoComplete="username" required maxLength={254} placeholder="tu@barberia.com" /></label>
    <label>Contraseña<span className="password-field"><input name="password" type={showPassword?"text":"password"} autoComplete="current-password" required minLength={8} maxLength={128} placeholder="Tu contraseña"/><button type="button" onClick={()=>setShowPassword((value)=>!value)} aria-label={showPassword?"Ocultar contraseña":"Mostrar contraseña"}>{showPassword?<EyeOff/>:<Eye/>}</button></span></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="login-button" disabled={saving}>{saving?"Verificando…":<>Entrar al dashboard <ArrowRight /></>}</button>
  </form>;
}
