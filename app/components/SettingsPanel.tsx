"use client";

import { useEffect, useState } from "react";
import { apiError, isJsonObject, readJsonObject } from "./api-json";
import { CheckCircle2, Image as ImageIcon, Save, Settings2 } from "lucide-react";

type BusinessSettings = {
  businessName: string; slug: string; timezone: string; currency: string; country: string; timeFormat: string;
  paymentMethods: string[]; cancellationWindowHours: number; cancellationFeePercent: number;
  allowClientCancellation: boolean; businessPhone: string; businessEmail: string; address: string;
  whatsappNumber: string; logoUrl: string; coverImageUrl: string; bookingLeadMinutes: number; bookingMaxDays: number;
  requireConfirmation: boolean; showPrices: boolean; showGallery: boolean; showReviews: boolean;
  headline: string; subtitle: string; primaryColor: string; publicNote: string;
  showServices: boolean; showProfessionals: boolean; showContact: boolean; showPolicies: boolean; updatedAt: string;
};

const paymentOptions = [
  ["cash", "Efectivo"], ["card", "Tarjeta"], ["transfer", "Transferencia"], ["mobile", "Pago móvil"], ["other", "Otro"],
] as const;

function isSettings(value: unknown): value is BusinessSettings {
  return isJsonObject(value) && typeof value.businessName === "string" && typeof value.slug === "string" &&
    typeof value.timezone === "string" && typeof value.currency === "string" && typeof value.country === "string" &&
    typeof value.timeFormat === "string" && Array.isArray(value.paymentMethods) && value.paymentMethods.every((item) => typeof item === "string") &&
    ["cancellationWindowHours", "cancellationFeePercent", "bookingLeadMinutes", "bookingMaxDays"].every((key) => typeof value[key] === "number") &&
    ["allowClientCancellation", "requireConfirmation", "showPrices", "showGallery", "showReviews", "showServices", "showProfessionals", "showContact", "showPolicies"].every((key) => typeof value[key] === "boolean") &&
    ["businessPhone", "businessEmail", "address", "whatsappNumber", "logoUrl", "coverImageUrl", "headline", "subtitle", "primaryColor", "publicNote", "updatedAt"].every((key) => typeof value[key] === "string");
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings", { credentials: "same-origin" }).then(async (response) => {
      const body = await readJsonObject(response);
      if (!response.ok) throw new Error(apiError(body, "No pudimos cargar la configuración"));
      if (!isSettings(body.settings)) throw new Error("La configuración recibida no es válida.");
      setSettings(body.settings);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "No pudimos cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="settings-stack"><div className="panel"><div className="loading-line" /></div></div>;
  if (!settings) return <div className="settings-stack">{error && <p className="form-error" role="alert">{error}</p>}</div>;

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const paymentMethods = paymentOptions.map(([value]) => value).filter((value) => form.get(`payment-${value}`) === "on");
    const payload = {
      businessName: form.get("businessName"), country: form.get("country"), timezone: form.get("timezone"),
      timeFormat: form.get("timeFormat"), currency: form.get("currency"), paymentMethods,
      cancellationWindowHours: form.get("cancellationWindowHours"), cancellationFeePercent: form.get("cancellationFeePercent"),
      allowClientCancellation: form.get("allowClientCancellation") === "on", businessPhone: form.get("businessPhone"),
      businessEmail: form.get("businessEmail"), address: form.get("address"), whatsappNumber: form.get("whatsappNumber"),
      logoUrl: form.get("logoUrl"), coverImageUrl: form.get("coverImageUrl"), bookingLeadMinutes: form.get("bookingLeadMinutes"),
      bookingMaxDays: form.get("bookingMaxDays"), requireConfirmation: form.get("requireConfirmation") === "on",
      showPrices: form.get("showPrices") === "on", showGallery: form.get("showGallery") === "on", showReviews: form.get("showReviews") === "on",
      headline: form.get("headline"), subtitle: form.get("subtitle"), primaryColor: form.get("primaryColor"), publicNote: form.get("publicNote"),
      showServices: form.get("showServices") === "on", showProfessionals: form.get("showProfessionals") === "on",
      showContact: form.get("showContact") === "on", showPolicies: form.get("showPolicies") === "on",
    };
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await readJsonObject(response);
      if (!response.ok) throw new Error(apiError(body, "No pudimos guardar la configuración"));
      if (!isSettings(body.settings)) throw new Error("La configuración guardada no es válida.");
      setSettings(body.settings); setNotice("Configuración guardada correctamente.");
      window.setTimeout(() => setNotice(""), 2600);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar la configuración");
    } finally { setSaving(false); }
  };

  return <div className="settings-stack">
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success"><CheckCircle2 size={15} />{notice}</p>}
    <form className="settings-form" onSubmit={save}>
      <section className="panel settings-card">
        <div className="settings-card-head"><div><span className="eyebrow">Identidad comercial</span><h2>Datos del negocio</h2><p>Esta información se conserva por negocio y alimenta la experiencia pública.</p></div><Settings2 size={22} /></div>
        <div className="form-grid">
          <label className="wide">Nombre comercial<input name="businessName" required minLength={2} maxLength={120} defaultValue={settings.businessName} /></label>
          <label>País<input name="country" required maxLength={2} pattern="[A-Za-z]{2}" defaultValue={settings.country} /></label>
          <label>Zona horaria<input name="timezone" required maxLength={80} defaultValue={settings.timezone} placeholder="America/Caracas" /></label>
          <label>Moneda<input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={settings.currency} /></label>
          <label>Formato de hora<select name="timeFormat" defaultValue={settings.timeFormat}><option value="24h">24 horas</option><option value="12h">12 horas</option></select></label>
          <label>Teléfono<input name="businessPhone" maxLength={25} defaultValue={settings.businessPhone} placeholder="+58 412 000 0000" /></label>
          <label>Correo<input name="businessEmail" type="email" maxLength={254} defaultValue={settings.businessEmail} /></label>
          <label className="wide">Dirección<input name="address" maxLength={240} defaultValue={settings.address} placeholder="Dirección visible para tus clientes" /></label>
          <label>WhatsApp<input name="whatsappNumber" maxLength={25} defaultValue={settings.whatsappNumber} placeholder="+58 412 000 0000" /></label>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="settings-card-head"><div><span className="eyebrow">Link público</span><h2>Apariencia y bloques</h2><p>Personaliza el mensaje principal y decide qué información verá el cliente antes de reservar.</p></div><Settings2 size={22} /></div>
        <div className="form-grid">
          <label className="wide">Titular<input name="headline" required minLength={2} maxLength={120} defaultValue={settings.headline} /></label>
          <label className="wide">Descripción<input name="subtitle" required minLength={2} maxLength={240} defaultValue={settings.subtitle} /></label>
          <label>Color principal<input name="primaryColor" type="color" defaultValue={settings.primaryColor} /></label>
          <label className="wide">Nota pública<input name="publicNote" maxLength={240} defaultValue={settings.publicNote} placeholder="Reserva online disponible todos los días." /></label>
          <fieldset className="wide settings-checks"><legend>Bloques visibles</legend>
            <label><input name="showServices" type="checkbox" defaultChecked={settings.showServices} /><span>Servicios</span></label>
            <label><input name="showProfessionals" type="checkbox" defaultChecked={settings.showProfessionals} /><span>Profesionales</span></label>
            <label><input name="showContact" type="checkbox" defaultChecked={settings.showContact} /><span>Contacto y ubicación</span></label>
            <label><input name="showPolicies" type="checkbox" defaultChecked={settings.showPolicies} /><span>Políticas</span></label>
          </fieldset>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="settings-card-head"><div><span className="eyebrow">Reservas y cobros</span><h2>Reglas de operación</h2><p>Define cómo se presenta y cuándo puede reservar un cliente.</p></div><Save size={22} /></div>
        <div className="form-grid">
          <fieldset className="wide settings-checks"><legend>Métodos de pago aceptados</legend>{paymentOptions.map(([value, label]) => <label key={value}><input name={`payment-${value}`} type="checkbox" defaultChecked={settings.paymentMethods.includes(value)} /><span>{label}</span></label>)}</fieldset>
          <label>Anticipación mínima (minutos)<input name="bookingLeadMinutes" type="number" min="0" max="10080" required defaultValue={settings.bookingLeadMinutes} /></label>
          <label>Horizonte de reservas (días)<input name="bookingMaxDays" type="number" min="1" max="365" required defaultValue={settings.bookingMaxDays} /></label>
          <label>Ventana de cancelación (horas)<input name="cancellationWindowHours" type="number" min="0" max="720" required defaultValue={settings.cancellationWindowHours} /></label>
          <label>Cargo por cancelación (%)<input name="cancellationFeePercent" type="number" min="0" max="100" required defaultValue={settings.cancellationFeePercent} /></label>
          <fieldset className="wide settings-checks"><legend>Preferencias</legend>
            <label><input name="allowClientCancellation" type="checkbox" defaultChecked={settings.allowClientCancellation} /><span>Permitir cancelación desde el portal</span></label>
            <label><input name="requireConfirmation" type="checkbox" defaultChecked={settings.requireConfirmation} /><span>Revisar y confirmar reservas públicas</span></label>
            <label><input name="showPrices" type="checkbox" defaultChecked={settings.showPrices} /><span>Mostrar precios en la reserva pública</span></label>
          </fieldset>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="settings-card-head"><div><span className="eyebrow">Presentación pública</span><h2>Imágenes y contenido</h2><p>Por ahora se aceptan URLs HTTPS; la subida gestionada queda para el módulo de galería.</p></div><ImageIcon size={22} /></div>
        <div className="form-grid">
          <label>Logo (URL HTTPS)<input name="logoUrl" type="url" maxLength={500} defaultValue={settings.logoUrl} placeholder="https://..." /></label>
          <label>Portada (URL HTTPS)<input name="coverImageUrl" type="url" maxLength={500} defaultValue={settings.coverImageUrl} placeholder="https://..." /></label>
          <fieldset className="wide settings-checks"><legend>Secciones visibles</legend>
            <label><input name="showGallery" type="checkbox" defaultChecked={settings.showGallery} /><span>Galería</span></label>
            <label><input name="showReviews" type="checkbox" defaultChecked={settings.showReviews} /><span>Reseñas</span></label>
          </fieldset>
        </div>
      </section>
      <div className="settings-actions"><span>Última actualización: {new Date(settings.updatedAt).toLocaleString("es-VE")}</span><button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar configuración"}</button></div>
    </form>
  </div>;
}
