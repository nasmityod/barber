"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Scissors, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import type { PublicCatalog, PublicProfessional, PublicService } from "../public-catalog";
import { addCalendarDays, dateInTimeZone } from "../calendar";
import { apiError, isJsonObject, readJsonObject, stringArray } from "./api-json";

type Service = PublicService;
type Professional = PublicProfessional;
export type BookingCatalog = PublicCatalog;

function isService(value: unknown): value is Service {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.category === "string" &&
    typeof value.durationMinutes === "number" && typeof value.priceCents === "number";
}
function isProfessional(value: unknown): value is Professional {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.specialty === "string" &&
    Array.isArray(value.serviceIds) && value.serviceIds.every((id) => typeof id === "string");
}
function isBookingCatalog(value: unknown): value is BookingCatalog {
  if (!isJsonObject(value) || !isJsonObject(value.business)) return false;
  const business = value.business;
  return ["name", "slug", "timezone", "currency", "timeFormat", "headline", "subtitle", "primaryColor"].every((key) => typeof business[key] === "string") &&
    ["bookingLeadMinutes", "bookingMaxDays"].every((key) => typeof business[key] === "number") &&
    ["allowClientCancellation", "showPrices", "showGallery", "showReviews", "showServices", "showProfessionals", "showContact", "showPolicies"].every((key) => typeof business[key] === "boolean") &&
    Array.isArray(value.services) && value.services.every(isService) && Array.isArray(value.professionals) && value.professionals.every(isProfessional) &&
    Array.isArray(value.gallery) && Array.isArray(value.reviews);
}

/* El reloj vive fuera del componente: llamar Date.now() durante el render es impuro. */
function markStart(ref: { current: number }) { ref.current = Date.now(); }
function markStartOnce(ref: { current: number }) { if (!ref.current) ref.current = Date.now(); }

const VE_ZONE = "America/Caracas";
function bookingZone(timezone?: string) { return timezone?.trim() || VE_ZONE; }
function isoAfter(days: number, timezone = VE_ZONE) { return addCalendarDays(dateInTimeZone(timezone), days); }
function money(cents: number, currency: string) { return new Intl.NumberFormat("es-VE", { style: "currency", currency }).format(cents / 100); }
function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23) return value;
  const period = hours >= 12 ? "p. m." : "a. m.";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}
function formatClock(timezone: string) {
  const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  return formatTime(stamp);
}
function firstProfessionalId(catalog: BookingCatalog | null, serviceId: string) { return catalog?.professionals.find((item) => item.serviceIds.includes(serviceId))?.id ?? ""; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function formatDateShort(value: string) { return new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }

const STEPS = [
  { n: 1, label: "Servicio", hint: "Qué vas a hacerte" },
  { n: 2, label: "Cuándo", hint: "Barbero, día y hora" },
  { n: 3, label: "Tus datos", hint: "Confirmar la cita" },
] as const;

export function BookingApp({ slug, initialCatalog }: { slug: string; initialCatalog: BookingCatalog | null }) {
  const [catalog, setCatalog] = useState<BookingCatalog | null>(initialCatalog); const [loadingError, setLoadingError] = useState("");
  const initialServiceId = initialCatalog?.services[0]?.id ?? "";
  const [step, setStep] = useState(0); const [dir, setDir] = useState(1);
  const [serviceId, setServiceId] = useState(initialServiceId); const [professionalId, setProfessionalId] = useState(firstProfessionalId(initialCatalog, initialServiceId));
  const zone = bookingZone(initialCatalog?.business.timezone);
  const [date, setDate] = useState(() => isoAfter(initialCatalog?.business.bookingMaxDays === 1 ? 0 : 1, zone)); const [time, setTime] = useState(""); const [times, setTimes] = useState<string[]>([]); const [loadingTimes, setLoadingTimes] = useState(false);
  const [done, setDone] = useState(false); const [portalUrl, setPortalUrl] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [clock, setClock] = useState(() => formatClock(zone));
  const formStartedAt = useRef(0); const idempotencyKey = useRef(""); const advanceTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  useEffect(() => {
    if (initialCatalog) return;
    fetch(`/api/public/catalog?slug=${encodeURIComponent(slug)}`).then(async (response) => {
      const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos cargar esta barbería"));
      if (!isBookingCatalog(body)) throw new Error("El catálogo recibido no es válido.");
      const firstService = body.services[0]?.id ?? ""; setCatalog(body); setServiceId(firstService); setProfessionalId(firstProfessionalId(body, firstService)); setDate(isoAfter(body.business.bookingMaxDays === 1 ? 0 : 1, bookingZone(body.business.timezone))); setLoadingTimes(true);
    }).catch((reason) => setLoadingError(reason instanceof Error ? reason.message : "No pudimos cargar esta barbería"));
  }, [slug, initialCatalog]);

  useEffect(() => {
    if (!catalog || !serviceId || !professionalId || !date) return;
    fetch(`/api/public/availability?slug=${encodeURIComponent(slug)}&serviceId=${encodeURIComponent(serviceId)}&professionalId=${encodeURIComponent(professionalId)}&date=${date}`).then(async (response) => {
      const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos consultar la disponibilidad"));
      const nextTimes = stringArray(body.times); setTimes(nextTimes); setTime((current) => nextTimes.includes(current) ? current : (nextTimes[0] ?? ""));
    }).catch((reason) => { setTimes([]); setTime(""); setError(reason instanceof Error ? reason.message : "No pudimos consultar la disponibilidad"); }).finally(() => setLoadingTimes(false));
  }, [catalog, serviceId, professionalId, date, slug]);

  const tz = bookingZone(catalog?.business.timezone);
  useEffect(() => {
    const tick = () => setClock(formatClock(tz));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [tz]);
  const dates = useMemo(() => Array.from({ length: Math.min(14, Math.max(1, (catalog?.business.bookingMaxDays ?? 7) + 1)) }, (_, index) => {
    const iso = isoAfter(index, tz); const parsed = new Date(`${iso}T12:00:00Z`);
    return { iso, day: new Intl.DateTimeFormat("es-VE", { weekday: "short", timeZone: "UTC" }).format(parsed).replace(".", ""), num: iso.slice(8), month: new Intl.DateTimeFormat("es-VE", { month: "short", timeZone: "UTC" }).format(parsed) };
  }), [catalog?.business.bookingMaxDays, tz]);
  const service = catalog?.services.find((item) => item.id === serviceId) ?? catalog?.services[0]; const eligibleProfessionals = catalog?.professionals.filter((item) => item.serviceIds.includes(service?.id ?? "")) ?? []; const professional = eligibleProfessionals.find((item) => item.id === professionalId) ?? eligibleProfessionals[0];

  const go = (next: number) => {
    window.clearTimeout(advanceTimer.current);
    setDir(next >= step ? 1 : -1);
    setStep(next);
  };
  const later = (next: number) => {
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => go(next), 240);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!service || !professional || !time) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget); if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/public/bookings", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), slug, serviceId, professionalId, date, time, formStartedAt: formStartedAt.current }) });
      const body = await readJsonObject(response); if (!response.ok) throw new Error(apiError(body, "No pudimos confirmar")); setPortalUrl(typeof body.portalUrl === "string" ? body.portalUrl : ""); setDone(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos confirmar"); setSaving(false); }
  };

  if (loadingError) return <div className="booking-site"><BookingHeader name="Corteza" logoUrl="" /><main className="success-card"><span className="eyebrow">Reserva segura</span><h1>No encontramos esta barbería.</h1><p>{loadingError}</p></main></div>;
  if (!catalog || !service || !professional) return <div className="booking-loading"><Scissors /><strong>Cargando agenda segura…</strong></div>;
  const publicStyle = { "--booking-accent": catalog.business.primaryColor } as CSSProperties;
  if (done) return (
    <div className="booking-site" style={publicStyle}>
      <BookingHeader name={catalog.business.name} logoUrl={catalog.business.logoUrl} />
      <main className="success-card">
        <div className="success-check"><Check /></div>
        <span className="eyebrow">Reserva confirmada</span>
        <h1>Nos vemos pronto.</h1>
        <p>Tu cita quedó guardada en hora de Venezuela. Conserva esta pantalla como confirmación.</p>
        <div className="receipt">
          <div><span>Servicio</span><strong>{service.name}</strong></div>
          <div><span>Fecha y hora (Venezuela)</span><strong>{formatDate(date)} · {formatTime(time)}</strong></div>
          <div><span>Profesional</span><strong>{professional.name}</strong></div>
          {catalog.business.showPrices && <div><span>Total</span><strong>{money(service.priceCents, catalog.business.currency)}</strong></div>}
        </div>
        <div className="success-actions">
          {portalUrl && <a className="secondary portal-link" href={portalUrl}>Gestionar mi cita</a>}
          <button className="booking-primary" onClick={() => { setDone(false); setPortalUrl(""); setStep(0); setSaving(false); idempotencyKey.current = ""; formStartedAt.current = Date.now(); }}>Hacer otra reserva</button>
        </div>
      </main>
      <BookingFooter name={catalog.business.name} />
    </div>
  );
  const begin = () => { markStart(formStartedAt); go(1); };
  const selectService = (id: string) => { markStartOnce(formStartedAt); setServiceId(id); setProfessionalId(firstProfessionalId(catalog, id)); setLoadingTimes(true); setError(""); };
  const chooseService = (id: string) => { selectService(id); go(2); };
  const pickService = (id: string) => { selectService(id); later(2); };
  const pickTime = (value: string) => { setTime(value); later(3); };
  const chooseDate = (value: string) => { setLoadingTimes(true); setError(""); setDate(value); };

  if (step === 0) {
    return <div className="booking-site" style={publicStyle}><BookingHeader name={catalog.business.name} logoUrl={catalog.business.logoUrl} /><Landing catalog={catalog} onStart={begin} onSelect={chooseService} /><BookingFooter name={catalog.business.name} /></div>;
  }

  return (
    <div className="booking-site book-live" style={publicStyle}>
      <BookingHeader name={catalog.business.name} logoUrl={catalog.business.logoUrl} />
      <main className="book-stage">
        <aside className="book-ticket" aria-label="Resumen de tu cita">
          <div className="book-ticket-mark" />
          <p className="book-ticket-kicker">Tu reserva</p>
          <strong className="book-ticket-shop">{catalog.business.name}</strong>
          <p className="book-clock" aria-live="polite"><Clock3 /> {clock} · Venezuela</p>
          <ol className="book-rail">
            {STEPS.map((item) => {
              const state = step > item.n ? "done" : step === item.n ? "now" : "wait";
              return (
                <li key={item.n} className={state}>
                  <button type="button" disabled={state === "wait"} onClick={() => go(item.n)} aria-current={state === "now" ? "step" : undefined}>
                    <span>{state === "done" ? <Check size={14} /> : item.n}</span>
                    <b>{item.label}</b>
                    <small>{item.hint}</small>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="book-fills">
            <div className={serviceId ? "in" : ""}>
              <Scissors /><div><em>Servicio</em><b>{service.name}</b></div>
              {catalog.business.showPrices && <strong>{money(service.priceCents, catalog.business.currency)}</strong>}
            </div>
            <div className={professional ? "in" : ""}>
              <UserRound /><div><em>Barbero</em><b>{professional.name}</b></div>
            </div>
            <div className={date ? "in" : ""}>
              <CalendarDays /><div><em>Día</em><b>{formatDate(date)}</b></div>
            </div>
            <div className={time ? "in" : ""}>
              <Clock3 /><div><em>Hora</em><b>{time ? formatTime(time) : "Elige un horario"}</b></div>
            </div>
          </div>
          <div className="book-meter" aria-hidden="true"><i style={{ width: `${(step / 3) * 100}%` }} /></div>
          <p className="book-mobile-sum">
            <span>{service.name}</span>
            <span>{formatDateShort(date)}{time ? ` · ${formatTime(time)}` : ""}</span>
          </p>
        </aside>

        <section className="book-canvas">
          <div className="book-pane" key={step} data-dir={dir}>
            {step === 1 && (
              <ServiceStep
                services={catalog.services}
                currency={catalog.business.currency}
                showPrices={catalog.business.showPrices}
                selected={serviceId}
                onSelect={pickService}
              />
            )}
            {step === 2 && (
              <DateStep
                dates={dates}
                date={date}
                setDate={chooseDate}
                time={time}
                setTime={pickTime}
                times={times}
                loading={loadingTimes}
                professional={professional}
                professionals={eligibleProfessionals}
                showProfessionals={catalog.business.showProfessionals}
                timezoneLabel="Hora de Venezuela"
                setProfessional={(id) => { setLoadingTimes(true); setError(""); setProfessionalId(id); }}
              />
            )}
            {step === 3 && (
              <DetailsStep
                service={service}
                showPrices={catalog.business.showPrices}
                currency={catalog.business.currency}
                time={time}
                onSubmit={submit}
                saving={saving}
                error={error}
              />
            )}
          </div>
          {error && step !== 3 && <p className="form-error book-alert" role="alert">{error}</p>}
          <div className="book-nav">
            <button type="button" className="booking-back" onClick={() => go(step === 1 ? 0 : step - 1)}>
              <ArrowLeft /> {step === 1 ? "Inicio" : "Atrás"}
            </button>
            {step < 3 && (
              <button type="button" className="booking-primary" disabled={step === 2 && !time} onClick={() => go(step + 1)}>
                Continuar <ArrowRight />
              </button>
            )}
          </div>
        </section>
      </main>
      <BookingFooter name={catalog.business.name} />
    </div>
  );
}

function BookingHeader({ name, logoUrl }: { name: string; logoUrl: string }) { return <header className="booking-header"><div className="booking-brand">{logoUrl ? <img src={logoUrl} alt="" /> : <span><Scissors /></span>}<div><strong>{name.toUpperCase()}</strong><small>RESERVAS ONLINE</small></div></div><div className="secure-booking"><ShieldCheck /><span>Conexión y reserva protegidas</span></div></header>; }
function Landing({ catalog, onStart, onSelect }: { catalog: BookingCatalog; onStart: () => void; onSelect: (id: string) => void }) {
  const { business } = catalog; const buttonStyle = { "--booking-accent": business.primaryColor } as CSSProperties;
  return <><section className="booking-hero"><div className="hero-noise" />{business.coverImageUrl && <img className="hero-cover" src={business.coverImageUrl} alt="" /> }<div className="hero-copy"><span className="hero-pill"><Sparkles /> Reservas online 24/7</span><h1>{business.headline}</h1><p>{business.subtitle}</p><button className="booking-primary large" style={buttonStyle} onClick={onStart}>Reservar ahora <ArrowRight /></button><div className="hero-proof"><span><ShieldCheck />Seguro</span><p>{business.publicNote}</p></div></div><div className="hero-visual"><div className="poster-card" style={{ background: `linear-gradient(145deg, #050505, ${business.primaryColor}, #9a7b3c)` }}><span>AGENDA ONLINE</span><div className="poster-scissors"><Scissors /></div><strong>{business.name.toUpperCase()}</strong><small>PRECISIÓN · CARÁCTER · CONFIANZA</small></div><div className="floating-note"><Clock3 /><div><b>Sin dobles reservas</b><span>Disponibilidad en tiempo real</span></div></div></div></section>{business.showServices && <section className="booking-services"><div className="section-intro"><span className="eyebrow">Servicios disponibles</span><h2>Elige tu experiencia</h2><p>Precio y duración confirmados por la barbería.</p></div><div className="public-service-grid">{catalog.services.map((item, index) => <button type="button" className="public-service-card" onClick={() => onSelect(item.id)} key={item.id}><div className={`public-service-art ${["copper", "olive", "ink"][index % 3]}`}><span>{String(index + 1).padStart(2, "0")}</span><Scissors /></div><div><span className="category">{item.category}</span><h3>{item.name}</h3><p>Servicio profesional con disponibilidad en tiempo real.</p><footer><span><Clock3 />{item.durationMinutes} min</span>{business.showPrices && <strong>{money(item.priceCents, business.currency)}</strong>}</footer></div></button>)}</div></section>}{business.showProfessionals && <section className="public-proof-section"><span className="eyebrow">Equipo disponible</span><h2>Elige con quién atenderte.</h2><div className="public-professionals">{catalog.professionals.map((item) => <div className="public-professional" key={item.id}><span>{item.name.slice(0, 1)}</span><div><strong>{item.name}</strong><small>{item.specialty}</small></div></div>)}</div></section>}{business.showGallery && catalog.gallery.length > 0 && <section className="public-gallery"><div className="section-intro"><span className="eyebrow">Trabajos recientes</span><h2>Hecho con precisión.</h2></div><div className="public-gallery-grid">{catalog.gallery.slice(0, 6).map((item) => <figure key={item.id}><img src={item.imageUrl} alt={item.title} /><figcaption>{item.title}</figcaption></figure>)}</div></section>}{business.showReviews && catalog.reviews.length > 0 && <section className="public-reviews"><span className="eyebrow">Clientes reales</span><h2>La experiencia se nota.</h2><div className="public-review-grid">{catalog.reviews.slice(0, 3).map((item) => <blockquote key={item.id}><div>{"★".repeat(Math.max(1, Math.min(5, item.rating)))}</div><p>“{item.comment}”</p><cite>{item.clientName || "Cliente verificado"}</cite></blockquote>)}</div></section>}{business.showContact && (business.businessPhone || business.businessEmail || business.address || business.whatsappNumber) && <section className="public-contact"><div><span className="eyebrow">Encuéntranos</span><h2>Todo listo para recibirte.</h2><p>{business.address || "Atención con reserva previa."}</p></div><div>{business.businessPhone && <a href={`tel:${business.businessPhone}`}>{business.businessPhone}</a>}{business.whatsappNumber && <a href={`https://wa.me/${business.whatsappNumber.replace(/\D/gu, "")}`}>WhatsApp</a>}{business.businessEmail && <a href={`mailto:${business.businessEmail}`}>{business.businessEmail}</a>}</div></section>}{business.showPolicies && <section className="public-policies"><ShieldCheck /><span>Política de reserva</span><p>Si necesitas cambiar o cancelar tu cita, usa el enlace seguro que recibirás al confirmar. La ventana de cancelación es de {business.cancellationWindowHours} horas.</p></section>}<section className="trust-strip"><div><ShieldCheck /><strong>Confirmación inmediata</strong><span>Bloqueo seguro de tu horario</span></div><div><UserRound /><strong>Datos mínimos</strong><span>Solo pedimos lo necesario</span></div><div><CalendarDays /><strong>Disponibilidad real</strong><span>Horarios calculados desde la agenda</span></div></section></>;
}

function ServiceStep({ services, currency, showPrices, selected, onSelect }: { services: Service[]; currency: string; showPrices: boolean; selected: string; onSelect: (value: string) => void }) {
  return (
    <div className="book-copy">
      <span className="book-kicker">Paso 1 de 3</span>
      <h1>Elige el servicio</h1>
      <p>Toca una tarjeta. Pasamos solos al siguiente paso.</p>
      <div className="book-svc-grid">
        {services.map((item, index) => (
          <button type="button" className={`book-svc tone-${index % 3}${selected === item.id ? " is-on" : ""}`} onClick={() => onSelect(item.id)} key={item.id} aria-pressed={selected === item.id}>
            <span className="book-svc-cat">{item.category}</span>
            <strong>{item.name}</strong>
            <span className="book-svc-meta"><Clock3 /> {item.durationMinutes} min</span>
            {showPrices && <b>{money(item.priceCents, currency)}</b>}
            {selected === item.id && <i><Check /></i>}
          </button>
        ))}
      </div>
    </div>
  );
}

function DateStep({ dates, date, setDate, time, setTime, times, loading, professional, professionals, showProfessionals, timezoneLabel, setProfessional }: {
  dates: { iso: string; day: string; num: string; month: string }[]; date: string; setDate: (value: string) => void;
  time: string; setTime: (value: string) => void; times: string[]; loading: boolean; professional: Professional;
  professionals: Professional[]; showProfessionals: boolean; timezoneLabel: string; setProfessional: (value: string) => void;
}) {
  return (
    <div className="book-copy">
      <span className="book-kicker">Paso 2 de 3</span>
      <h1>Fecha y silla</h1>
      <p>Primero el barbero, luego el día. Los horarios están en {timezoneLabel}.</p>
      {showProfessionals && (
        <div className="book-barbers" role="listbox" aria-label="Profesional">
          {professionals.map((item) => (
            <button type="button" role="option" aria-selected={professional.id === item.id} className={professional.id === item.id ? "is-on" : ""} onClick={() => setProfessional(item.id)} key={item.id}>
              <span>{item.name.slice(0, 1)}</span>
              <b>{item.name}</b>
              <small>{item.specialty}</small>
            </button>
          ))}
        </div>
      )}
      <div className="book-when">
        <div>
          <h2>Días</h2>
          <div className="book-days">
            {dates.map((item) => (
              <button type="button" className={date === item.iso ? "is-on" : ""} onClick={() => setDate(item.iso)} key={item.iso}>
                <span>{item.day}</span>
                <strong>{item.num}</strong>
                <small>{item.month}</small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2>Horarios con {professional.name} <em>{timezoneLabel}</em></h2>
          {loading ? (
            <div className="book-empty pulse">Consultando la agenda…</div>
          ) : times.length ? (
            <div className="book-slots">
              {times.map((item) => (
                <button type="button" className={time === item ? "is-on" : ""} onClick={() => setTime(item)} key={item}>{formatTime(item)}</button>
              ))}
            </div>
          ) : (
            <div className="book-empty">No quedan horarios este día. Prueba otra fecha.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailsStep({ service, showPrices, currency, time, onSubmit, saving, error }: {
  service: Service; showPrices: boolean; currency: string; time: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; error: string;
}) {
  return (
    <div className="book-copy">
      <span className="book-kicker">Paso 3 de 3</span>
      <h1>Tus datos</h1>
      <p>Solo para gestionar esta cita. El resumen quedó en el ticket.</p>
      <form className="book-form" onSubmit={onSubmit}>
        <label>Nombre completo<input name="name" required maxLength={100} autoComplete="name" placeholder="Tu nombre" /></label>
        <label>WhatsApp / teléfono<input name="phone" type="tel" inputMode="tel" required maxLength={25} autoComplete="tel" placeholder="+58 412 000 0000" /></label>
        <label className="wide">Email<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="tu@email.com" /></label>
        <label className="wide">Notas <span>(opcional)</span><textarea name="notes" maxLength={500} placeholder="¿Algo que debamos saber?" /></label>
        <label className="honeypot" aria-hidden="true">Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label>
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <button className="booking-primary wide submit-booking" disabled={saving || !time}>
          {saving ? "Confirmando…" : `Confirmar reserva${showPrices ? ` · ${money(service.priceCents, currency)}` : ""}`}
        </button>
      </form>
    </div>
  );
}

function BookingFooter({ name }: { name: string }) { return <footer className="booking-footer"><div className="booking-brand"><span><Scissors /></span><div><strong>{name.toUpperCase()}</strong><small>RESERVAS ONLINE</small></div></div><p>© 2026 · Privacidad por diseño</p><span><ShieldCheck size={13} /> Reserva protegida</span></footer>; }
