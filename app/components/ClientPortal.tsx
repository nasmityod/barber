"use client";

import { useState } from "react";
import { CalendarDays, Check, ShieldCheck, X } from "lucide-react";
import { BrandMark } from "./Brand";
import { apiError, readJsonObject } from "./api-json";

type PortalData = {
  business: { name: string; slug: string; timezone: string; currency: string; timeFormat: string };
  appointment: { id: string; status: string; date: string; time: string; endTime: string; notes: string; serviceName: string; serviceId: string; professionalId: string; professionalName: string; totalCents: number };
  client: { name: string; email: string; phone: string };
  policy: { allowClientCancellation: boolean; cancellationWindowHours: number; cancellationFeePercent: number; requireConfirmation: boolean; bookingLeadMinutes: number; bookingMaxDays: number };
  expiresAt: string;
};

export function ClientPortal({ token, initialData }: { token: string; initialData: PortalData }) {
  const [data, setData] = useState(initialData); const [rescheduling, setRescheduling] = useState(false); const [date, setDate] = useState(initialData.appointment.date); const [time, setTime] = useState(initialData.appointment.time); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const appointment = data.appointment; const editable = ["programada", "confirmada"].includes(appointment.status);
  const formatDate = (value: string) => new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const formatTime = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23) return value;
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "p. m." : "a. m."}`;
  };
  const money = new Intl.NumberFormat("es-VE", { style: "currency", currency: data.business.currency }).format(appointment.totalCents / 100);
  const expires = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Caracas" }).format(new Date(data.expiresAt));
  const act = async (action: string) => { setSaving(true); setError(""); setNotice(""); try { const response = await fetch(`/api/public/appointments/${encodeURIComponent(token)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date, time }) }); const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos actualizar la cita.")); setData(body as unknown as PortalData); setRescheduling(false); setNotice(action === "cancel" ? "La cita fue cancelada." : action === "reschedule" ? "La cita fue reprogramada." : "La cita quedó confirmada."); } catch (value) { setError(value instanceof Error ? value.message : "No pudimos actualizar la cita."); } finally { setSaving(false); } };
  return (
    <div className="client-portal-card">
      <header className="client-portal-head">
        <div className="booking-brand"><BrandMark /><div><strong>{data.business.name.toUpperCase()}</strong><small>Portal de cita</small></div></div>
        <ShieldCheck />
      </header>
      <div className="client-portal-intro">
        <h1>Gestiona tu cita</h1>
        <p>Hola, <b>{data.client.name}</b>. Consulta los detalles y haz cambios desde este enlace seguro.</p>
      </div>
      <section className="portal-appointment-card">
        <div className="portal-status"><span className={`status ${appointment.status}`}>{statusLabel(appointment.status)}</span><span>{money}</span></div>
        <h2>{appointment.serviceName}</h2>
        <div className="receipt">
          <div><span>Fecha</span><strong>{formatDate(appointment.date)}</strong></div>
          <div><span>Hora (Venezuela)</span><strong>{formatTime(appointment.time)} — {formatTime(appointment.endTime)}</strong></div>
          <div><span>Profesional</span><strong>{appointment.professionalName}</strong></div>
        </div>
        {appointment.notes && <p className="portal-notes">Nota: {appointment.notes}</p>}
      </section>
      {notice && <p className="form-success" role="status"><Check size={15} />{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {rescheduling && editable && (
        <form className="portal-reschedule" onSubmit={(event) => { event.preventDefault(); void act("reschedule"); }}>
          <h2>Elige un nuevo horario</h2>
          <label>Fecha<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} max={dateAfter(data.policy.bookingMaxDays)} onChange={(event) => setDate(event.target.value)} required /></label>
          <label>Hora<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
          <p>La disponibilidad se valida al guardar para evitar horarios ocupados. La hora es de Venezuela.</p>
          <div>
            <button className="secondary" type="button" onClick={() => setRescheduling(false)}>Volver</button>
            <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar nuevo horario"}</button>
          </div>
        </form>
      )}
      {editable && !rescheduling && (
        <div className="portal-actions">
          {appointment.status === "programada" && <button className="primary" onClick={() => void act("confirm")} disabled={saving}><Check size={15} />Confirmar cita</button>}
          <button className="secondary" onClick={() => setRescheduling(true)} disabled={saving}><CalendarDays size={15} />Reprogramar</button>
          {data.policy.allowClientCancellation && <button className="portal-cancel" onClick={() => void act("cancel")} disabled={saving}><X size={15} />Cancelar cita</button>}
        </div>
      )}
      <footer className="portal-policy"><ShieldCheck /><span>Los cambios se permiten hasta {data.policy.cancellationWindowHours} horas antes de la cita. Este enlace caduca el {expires}.</span></footer>
    </div>
  );
}

function dateAfter(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function statusLabel(status: string) { return ({ programada: "Pendiente", confirmada: "Confirmada", cancelada: "Cancelada", completada: "Completada", no_asistio: "No asistió", en_progreso: "En atención" } as Record<string, string>)[status] ?? status; }
