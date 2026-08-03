"use client";

import { useEffect, useRef, useState } from "react";
import { apiError, isJsonObject, readJsonObject, stringArray } from "./api-json";
import { CommerceManager } from "./CommerceManager";
import { GrowthManager } from "./GrowthManager";
import {
  calendarDates, calendarRange, dateInTimeZone, shiftCalendarAnchor,
  startOfCalendarWeek, type CalendarView,
} from "../calendar";
import {
  BarChart3, Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Copy,
  LayoutDashboard, Menu, Plus, Scissors, Search, Settings, Sparkles,
  Star, UserRound, UsersRound, WalletCards, X, CheckCircle2, TrendingUp,
  Armchair, Megaphone, ShieldCheck, ArrowUpRight, MoreHorizontal, LogOut,
  CalendarOff, Trash2, Pencil, GripVertical, Upload, Download,
} from "lucide-react";

type Appointment = {
  id: string; clientId: string; date: string; time: string; endTime: string; status: string; source: string;
  totalCents: number; paidCents: number; paymentStatus: string; clientName: string; phone: string; email: string; notes: string; cancellationReason: string;
  serviceId: string; serviceName: string; professionalId: string; professionalName: string;
  recurringSeriesId: string|null; occurrenceNumber: number|null;
};

type AppointmentChanges = Partial<Pick<Appointment, "clientName"|"phone"|"email"|"notes"|"serviceId"|"professionalId"|"date"|"time">>;

type Service = { id:string; name:string; category:string; durationMinutes:number; priceCents:number; active?:number|boolean; appointmentCount?:number };
type ManagedService = Service & { active:number|boolean; appointmentCount:number };
type Professional = { id:string; name:string; specialty:string; active?:number|boolean; serviceIds?:string[] };
type ManagedProfessional = Professional & {
  email:string; phone:string; active:number|boolean; appointmentCount:number;
  completedCount:number; totalRevenueCents:number; blockCount:number; serviceIds:string[];
};
type Catalog = { business:{name:string;slug:string;timezone:string;currency:string};services:Service[];professionals:Professional[] };
type BusinessHour = { id:string; professionalId:string; weekday:number; startTime:string; endTime:string; active:number|boolean };
type TimeBlock = { id:string; professionalId:string; professionalName:string; date:string; startTime:string; endTime:string; reason:string; createdAt:string };
type ClientRecord = {
  id:string; name:string; email:string; phone:string; notes:string; createdAt:string;
  appointmentCount:number; completedCount:number; totalSpentCents:number; lastAppointmentDate:string|null;
};
type ClientHistoryItem = {
  id:string; date:string; time:string; endTime:string; status:string; source:string;
  totalCents:number; serviceName:string; professionalName:string; notes:string;
};

type RecurringSeries = {
  id:string;status:string;frequency:string;startDate:string;endDate:string;time:string;notes:string;createdAt:string;updatedAt:string;
  clientId:string;clientName:string;email:string;phone:string;serviceId:string;serviceName:string;
  professionalId:string;professionalName:string;totalCount:number;activeCount:number;futureCount:number;nextDate:string|null;
};

function isAppointment(value: unknown): value is Appointment {
  if (!isJsonObject(value)) return false;
  return ["id", "clientId", "date", "time", "endTime", "status", "source", "paymentStatus", "clientName", "phone", "email", "notes", "cancellationReason", "serviceId", "serviceName", "professionalId", "professionalName"]
    .every((key) => typeof value[key] === "string") && typeof value.totalCents === "number" && typeof value.paidCents === "number" &&
    (typeof value.recurringSeriesId === "string" || value.recurringSeriesId === null) &&
    (typeof value.occurrenceNumber === "number" || value.occurrenceNumber === null);
}

function isRecurringSeries(value:unknown):value is RecurringSeries {
  return isJsonObject(value) && ["id","status","frequency","startDate","endDate","time","notes","createdAt","updatedAt","clientId","clientName","email","phone","serviceId","serviceName","professionalId","professionalName"].every((key)=>typeof value[key]==="string") &&
    ["totalCount","activeCount","futureCount"].every((key)=>typeof value[key]==="number") &&
    (typeof value.nextDate==="string"||value.nextDate===null);
}

function isService(value: unknown): value is Service {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.category === "string" && typeof value.durationMinutes === "number" && typeof value.priceCents === "number";
}

function isManagedService(value:unknown):value is ManagedService {
  return isService(value) && (typeof value.active === "number" || typeof value.active === "boolean") && typeof value.appointmentCount === "number";
}

function serviceIsActive(service:Service) {
  return service.active !== 0 && service.active !== false;
}

function isProfessional(value: unknown): value is Professional {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.specialty === "string" &&
    (value.serviceIds === undefined || Array.isArray(value.serviceIds) && value.serviceIds.every((id)=>typeof id === "string"));
}

function isManagedProfessional(value:unknown):value is ManagedProfessional {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.specialty === "string" && typeof value.email === "string" && typeof value.phone === "string" &&
    (typeof value.active === "number" || typeof value.active === "boolean") &&
    typeof value.appointmentCount === "number" && typeof value.completedCount === "number" &&
    typeof value.totalRevenueCents === "number" && typeof value.blockCount === "number" &&
    Array.isArray(value.serviceIds) && value.serviceIds.every((id)=>typeof id === "string");
}

function professionalIsActive(professional:Professional) {
  return professional.active !== 0 && professional.active !== false;
}

function professionalsForService(catalog:Catalog,serviceId:string) {
  return catalog.professionals.filter((professional)=>!professional.serviceIds||professional.serviceIds.includes(serviceId));
}

function isCatalog(value: unknown): value is Catalog {
  if (!isJsonObject(value) || !isJsonObject(value.business)) return false;
  const { business } = value;
  return ["name", "slug", "timezone", "currency"].every((key) => typeof business[key] === "string") &&
    Array.isArray(value.services) && value.services.every(isService) &&
    Array.isArray(value.professionals) && value.professionals.every(isProfessional);
}

function isBusinessHour(value: unknown): value is BusinessHour {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.professionalId === "string" &&
    typeof value.weekday === "number" && typeof value.startTime === "string" && typeof value.endTime === "string" &&
    (typeof value.active === "number" || typeof value.active === "boolean");
}

function isTimeBlock(value: unknown): value is TimeBlock {
  return isJsonObject(value) && ["id", "professionalId", "professionalName", "date", "startTime", "endTime", "reason", "createdAt"]
    .every((key) => typeof value[key] === "string");
}

function isClientRecord(value:unknown):value is ClientRecord {
  return isJsonObject(value) && ["id","name","email","phone","notes","createdAt"].every((key)=>typeof value[key]==="string") &&
    ["appointmentCount","completedCount","totalSpentCents"].every((key)=>typeof value[key]==="number") &&
    (typeof value.lastAppointmentDate==="string"||value.lastAppointmentDate===null);
}

function isClientHistoryItem(value:unknown):value is ClientHistoryItem {
  return isJsonObject(value) && ["id","date","time","endTime","status","source","serviceName","professionalName","notes"].every((key)=>typeof value[key]==="string") &&
    typeof value.totalCents==="number";
}

type AdminIdentity = {
  displayName: string; email: string; role: string; businessName: string; businessSlug: string; timezone: string;
};

const nav = [
  { label: "Principal", items: [
    ["dashboard", "Inicio", LayoutDashboard], ["agenda", "Agenda", CalendarDays],
    ["citas", "Citas", Clock3], ["clientes", "Clientes", UsersRound], ["caja", "Caja", WalletCards],
  ]},
  { label: "Gestión", items: [
    ["servicios", "Servicios", Scissors], ["equipo", "Equipo", UserRound],
    ["horarios", "Horarios", CalendarDays], ["estaciones", "Estaciones", Armchair],
  ]},
  { label: "Crecimiento", items: [
    ["reportes", "Reportes", BarChart3], ["marketing", "Marketing", Megaphone],
    ["promociones", "Promociones", Star], ["fidelizacion", "Fidelización", Star], ["resenas", "Reseñas", Star], ["galeria", "Galería", Sparkles], ["espera", "Lista de espera", Clock3], ["pagos", "Pagos y depósitos", CircleDollarSign],
  ]},
  { label: "Sistema", items: [
    ["configuracion", "Configuración", Settings], ["usuarios", "Usuarios y roles", UsersRound],
    ["seguridad", "Centro de seguridad", ShieldCheck], ["plan", "Plan y suscripción", WalletCards],
  ]},
] as const;

const titles: Record<string, [string, string]> = {
  dashboard: ["Tu barbería, bajo control", "El pulso de tu negocio, actualizado ahora"],
  agenda: ["Agenda", "Organiza el día de todo tu equipo"], citas: ["Citas", "Gestiona reservas y estados"],
  clientes: ["Clientes", "Historial, preferencias y recurrencia"], caja: ["Caja", "Cobros, gastos y cierre del día"],
  servicios: ["Servicios", "Precios, duración y profesionales"], equipo: ["Equipo", "Profesionales y desempeño"],
  horarios: ["Horarios", "Disponibilidad semanal y bloqueos"], estaciones: ["Estaciones", "Sillas y recursos del local"],
  reportes: ["Reportes", "Entiende el rendimiento del negocio"], marketing: ["Marketing", "Mensajes y promociones"],
  fidelizacion: ["Fidelización", "Convierte visitas en clientes frecuentes"], configuracion: ["Configuración", "Preferencias del negocio y reservas"],
  promociones: ["Promociones", "Códigos, descuentos y vigencias"], resenas: ["Reseñas", "Modera y publica la voz de tus clientes"], galeria: ["Galería", "Muestra el trabajo de tu barbería"], espera: ["Lista de espera", "Recupera oportunidades cuando se libera un horario"], pagos: ["Pagos y depósitos", "Solicita anticipos con trazabilidad"],
  usuarios: ["Usuarios y roles", "Accesos seguros para tu equipo"],
  seguridad: ["Centro de seguridad", "Identidad, permisos, auditoría y protección activa"], plan: ["Plan y suscripción", "Elige el plan que acompaña el crecimiento de tu negocio"],
};

export function AdminApp({ section, identity }: { section: string; identity: AdminIdentity }) {
  const active = titles[section] ? section : "dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [recurringSeries,setRecurringSeries]=useState<RecurringSeries[]>([]);
  const [recurringModalOpen,setRecurringModalOpen]=useState(false);
  const [editingSeries,setEditingSeries]=useState<RecurringSeries|null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/appointments", { credentials: "same-origin" }),
      fetch(`/api/public/catalog?slug=${encodeURIComponent(identity.businessSlug)}`),
      fetch("/api/admin/recurring-appointments", { credentials: "same-origin" }),
    ]).then(async ([appointmentsResponse, catalogResponse,seriesResponse]) => {
      const appointmentsData = await readJsonObject(appointmentsResponse);
      const catalogData = await readJsonObject(catalogResponse);
      const seriesData = await readJsonObject(seriesResponse);
      if (!appointmentsResponse.ok) throw new Error(apiError(appointmentsData, "No pudimos cargar las citas"));
      if (!catalogResponse.ok) throw new Error(apiError(catalogData, "No pudimos cargar el catálogo"));
      if (!seriesResponse.ok) throw new Error(apiError(seriesData,"No pudimos cargar las series recurrentes"));
      const nextAppointments = Array.isArray(appointmentsData.appointments)
        ? appointmentsData.appointments.filter(isAppointment)
        : [];
      if (!isCatalog(catalogData)) throw new Error("El catálogo recibido no es válido.");
      setAppointments(nextAppointments);
      setRecurringSeries(Array.isArray(seriesData.series)?seriesData.series.filter(isRecurringSeries):[]);
      setCatalog(catalogData);
    }).catch((reason) => setLoadError(reason instanceof Error ? reason.message : "No pudimos cargar el panel"))
      .finally(() => setLoading(false));
  }, [identity.businessSlug]);

  const [title, subtitle] = titles[active];
  const displaySubtitle = active === "dashboard"
    ? new Intl.DateTimeFormat("es-VE", { timeZone: identity.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date())
    : subtitle;
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/reservar/${identity.businessSlug}`);
    setNotice("Link de reservas copiado"); setTimeout(() => setNotice(""), 2200);
  };
  const canWriteAppointments = ["owner", "admin", "reception"].includes(identity.role);
  const reloadRecurringModule=async()=>{
    const [appointmentsResponse,seriesResponse]=await Promise.all([
      fetch("/api/admin/appointments",{credentials:"same-origin"}),
      fetch("/api/admin/recurring-appointments",{credentials:"same-origin"}),
    ]);
    const appointmentsData=await readJsonObject(appointmentsResponse);const seriesData=await readJsonObject(seriesResponse);
    if(!appointmentsResponse.ok)throw new Error(apiError(appointmentsData,"No pudimos actualizar las citas"));
    if(!seriesResponse.ok)throw new Error(apiError(seriesData,"No pudimos actualizar las series"));
    setAppointments(Array.isArray(appointmentsData.appointments)?appointmentsData.appointments.filter(isAppointment):[]);
    setRecurringSeries(Array.isArray(seriesData.series)?seriesData.series.filter(isRecurringSeries):[]);
  };
  const saveAppointment = async (appointment: Appointment, changes: AppointmentChanges) => {
    const next = { ...appointment, ...changes };
    const response = await fetch("/api/admin/appointments", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: next.id, name: next.clientName, email: next.email, phone: next.phone, notes: next.notes,
        serviceId: next.serviceId, professionalId: next.professionalId, date: next.date, time: next.time,
      }),
    });
    const data = await readJsonObject(response);
    if (!response.ok) throw new Error(apiError(data, "No pudimos actualizar la cita"));
    if (!isAppointment(data.appointment)) throw new Error("La cita actualizada no es válida.");
    const updated = data.appointment;
    setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item));
    setNotice("Cita actualizada correctamente"); setTimeout(() => setNotice(""), 2200);
    return updated;
  };

  return (
    <div className="admin-shell">
      {mobileOpen && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Scissors size={20} /></div><div><strong>CORTEZA</strong><span>studio manager</span></div></div>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        <div className="workspace"><div className="avatar">{identity.businessName.slice(0, 2).toUpperCase()}</div><div><strong>{identity.businessName}</strong><span>Espacio protegido</span></div><ChevronDown size={16} /></div>
        <nav>
          {nav.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>
            {group.items.map(([slug, label, Icon]) => <a className={active === slug ? "active" : ""} href={`/${slug}`} key={slug} onClick={() => setMobileOpen(false)}><Icon size={18} /><span>{label}</span>{slug === "citas" && <em>{appointments.filter((item)=>["programada","confirmada"].includes(item.status)).length}</em>}</a>)}
          </div>)}
        </nav>
        <div className="sidebar-footer"><div className="plan-line"><span>Espacio Corteza</span><strong>{appointments.length}</strong></div><div className="plan-progress"><i style={{width:`${Math.min(100,appointments.length*2)}%`}} /></div><small>{appointments.length} citas registradas</small></div>
      </aside>

      <main className="admin-main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="topbar-search"><Search size={17} /><input aria-label="Buscar" placeholder="Buscar cliente, cita o servicio..." /></div>
          <a className="public-link" href={`/reservar/${identity.businessSlug}`} target="_blank" rel="noreferrer"><Sparkles size={16} /> Ver página pública</a>
          <button className="icon-button" aria-label="Notificaciones"><Bell size={19} /></button>
          <div className="account-menu">
            <button className="user-avatar" aria-label="Abrir menú de cuenta" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}>{initials(identity.displayName)}</button>
            {accountOpen && <div className="account-popover"><strong>{identity.displayName}</strong><small>{identity.email}</small><small>{roleLabel(identity.role)} · {identity.businessName}</small><form action="/api/auth/logout" method="post"><button><LogOut size={15}/> Cerrar sesión</button></form></div>}
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading"><div><p className="eyebrow">{identity.businessName}</p><h1>{title}</h1><p>{displaySubtitle}</p></div><div className="heading-actions"><button className="secondary" onClick={copyLink}><Copy size={16} /> Link de reservas</button>{canWriteAppointments&&<button className="primary" onClick={() => setModalOpen(true)} disabled={!catalog}><Plus size={17} /> Nueva cita</button>}</div></div>
          {loading && <div className="loading-line" />}
          {loadError && <p className="form-error" role="alert">{loadError}</p>}
          {active === "dashboard" ? <Dashboard appointments={appointments} timezone={identity.timezone} /> : <ModuleView section={active} appointments={appointments} recurringSeries={recurringSeries} catalog={catalog} identity={identity} canWrite={canWriteAppointments} onServicesChanged={(services)=>setCatalog((current)=>current?{...current,services}:current)} onProfessionalsChanged={(professionals,changed)=>{setCatalog((current)=>current?{...current,professionals}:current);if(changed)setAppointments((items)=>items.map((item)=>item.professionalId===changed.id?{...item,professionalName:changed.name}:item))}} onClientUpdated={(client)=>setAppointments((items)=>items.map((item)=>item.clientId===client.id?{...item,clientName:client.name,email:client.email,phone:client.phone}:item))} onPaymentChanged={(appointmentId,paidCents)=>setAppointments((items)=>items.map((item)=>item.id===appointmentId?{...item,paidCents,paymentStatus:paymentStatusFor(item.totalCents,paidCents)}:item))} onNew={() => setModalOpen(true)} onNewRecurring={()=>setRecurringModalOpen(true)} onEditSeries={setEditingSeries} onCancelSeries={async(series)=>{
            const answer=window.prompt(`Motivo para cancelar las citas futuras de ${series.clientName}:`,"");if(answer===null)return;
            const reason=answer.trim();if(!reason){setNotice("El motivo de cancelación es obligatorio");return}
            const response=await fetch("/api/admin/recurring-appointments",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:series.id,reason})});
            const data=await readJsonObject(response);if(!response.ok){setNotice(apiError(data,"No pudimos cancelar la serie"));return}
            await reloadRecurringModule();const count=typeof data.cancelledCount==="number"?data.cancelledCount:0;setNotice(`Serie cancelada · ${count} citas futuras`);setTimeout(()=>setNotice(""),2600);
          }} onEdit={setEditingAppointment} onReschedule={async(appointment,date,time)=>{
            try { await saveAppointment(appointment,{date,time}) } catch(reason) { setNotice(reason instanceof Error?reason.message:"No pudimos reprogramar la cita"); throw reason }
          }} onStatus={async(id,status)=>{
            const appointment=appointments.find((item)=>item.id===id);let reason="";
            if(status==="cancelada"&&appointment?.status!=="cancelada"){
              const answer=window.prompt("Indica el motivo de la cancelación:","");
              if(answer===null)return;
              reason=answer.trim();if(!reason){setNotice("El motivo de cancelación es obligatorio");return}
            }
            const response=await fetch("/api/admin/appointments",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status,reason})});
            const data=await readJsonObject(response); if(!response.ok){setNotice(apiError(data,"No pudimos actualizar la cita"));return}
            const cancellationReason=typeof data.cancellationReason==="string"?data.cancellationReason:"";
            setAppointments((items)=>items.map((item)=>item.id===id?{...item,status,cancellationReason}:item));setNotice(status==="cancelada"?"Cita cancelada con motivo registrado":"Estado actualizado");setTimeout(()=>setNotice(""),2200);
          }} />}
        </div>
      </main>
      {modalOpen && catalog && <AppointmentModal catalog={catalog} onClose={() => setModalOpen(false)} onCreated={(appointment) => { setAppointments((old) => [...old, appointment]); setModalOpen(false); setNotice("Cita creada correctamente"); setTimeout(() => setNotice(""), 2500); }} />}
      {editingAppointment && catalog && <AppointmentEditModal key={editingAppointment.id} appointment={editingAppointment} catalog={catalog} onClose={()=>setEditingAppointment(null)} onSave={saveAppointment}/>}
      {(recurringModalOpen||editingSeries)&&catalog&&<RecurringSeriesModal key={editingSeries?.id??"new"} series={editingSeries} catalog={catalog} onClose={()=>{setRecurringModalOpen(false);setEditingSeries(null)}} onSaved={async(message)=>{await reloadRecurringModule();setRecurringModalOpen(false);setEditingSeries(null);setNotice(message);setTimeout(()=>setNotice(""),3000)}}/>}
      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}</div>}
    </div>
  );
}

function Dashboard({ appointments, timezone }: { appointments: Appointment[]; timezone: string }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayAppointments = appointments.filter((appointment) => appointment.date === today);
  const todayRevenue = todayAppointments.reduce((sum, appointment) => sum + appointment.paidCents, 0);
  const clientCount = new Set(appointments.map((appointment) => appointment.email ?? appointment.phone)).size;
  const days = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(); value.setDate(value.getDate() - (6 - index));
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  });
  const revenue = days.map((date) => appointments.filter((item) => item.date === date).reduce((sum, item) => sum + item.paidCents, 0));
  const revenueMax = Math.max(...revenue, 1);
  const popular = Array.from(appointments.reduce((map, item) => map.set(item.serviceName, (map.get(item.serviceName) ?? 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const future = appointments.filter((item) => item.date >= today && !["cancelada", "no_asistio"].includes(item.status)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return <>
    <section className="metric-grid">
      <Metric icon={<CalendarDays />} tone="terracotta" label="Citas de hoy" value={String(todayAppointments.length)} trend="Datos reales de agenda" />
      <Metric icon={<CircleDollarSign />} tone="olive" label="Cobrado hoy" value={`$${(todayRevenue / 100).toFixed(2)}`} trend="Pagos registrados" />
      <Metric icon={<UsersRound />} tone="ink" label="Clientes en agenda" value={String(clientCount)} trend="Sin registros ficticios" />
      <Metric icon={<Clock3 />} tone="sand" label="Por atender" value={String(todayAppointments.filter((item) => !["completada", "cancelada", "no_asistio"].includes(item.status)).length)} trend="Pendientes de hoy" />
    </section>
    <section className="dashboard-grid">
      <div className="panel revenue-panel"><PanelTitle title="Ingresos completados" subtitle="Últimos 7 días" /><div className="big-number">${(revenue.reduce((sum, value) => sum + value, 0) / 100).toFixed(2)} <span><TrendingUp size={15} /> Datos reales</span></div><div className="chart">
        {revenue.map((value, index) => <div className="bar-wrap" key={days[index]} title={`$${(value / 100).toFixed(2)}`}><div className={`bar ${index === 6 ? "hot" : ""}`} style={{height:`${Math.max(5, (value / revenueMax) * 100)}%`}} /><span>{new Intl.DateTimeFormat("es-VE", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${days[index]}T12:00:00Z`))}</span></div>)}
      </div></div>
      <div className="panel"><PanelTitle title="Próximas citas" subtitle={`${future.length} por atender`} />
        <div className="appointment-list">{future.length ? future.slice(0,4).map((a)=><AppointmentRow key={a.id} appointment={a} />) : <EmptyState text="Tu agenda está libre." />}</div>
      </div>
    </section>
    <section className="lower-grid"><div className="panel"><PanelTitle title="Servicios más pedidos" subtitle="Según tu agenda" />
      {popular.length ? popular.map(([name, count]) => <div className="service-progress" key={name}><div><strong>{name}</strong><span>{count} {count === 1 ? "cita" : "citas"}</span></div><div><i style={{width:`${Math.max(12, (count / (popular[0]?.[1] ?? 1)) * 100)}%`}} /></div></div>) : <EmptyState text="Aún no hay servicios reservados." />}
    </div><div className="panel"><PanelTitle title="Actividad reciente" subtitle="Últimos movimientos" />
      {appointments.length ? appointments.slice().sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0,3).map((item) => <div className="activity" key={item.id}><span className={`activity-icon ${item.source === "online" ? "ok" : "neutral"}`}>{item.source === "online" ? <Sparkles /> : <UserRound />}</span><div><strong>{item.source === "online" ? "Reserva online" : "Cita creada desde el panel"}</strong><p>{item.clientName} · {item.serviceName}</p></div><time>{formatShortDate(item.date)}</time></div>) : <EmptyState text="Todavía no hay actividad." />}
    </div></section>
  </>;
}

function Metric({ icon, tone, label, value, trend }: { icon: React.ReactNode; tone: string; label: string; value: string; trend: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>;
}

function PanelTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button>{action}<ArrowUpRight size={14} /></button>}</div>;
}

function initials(value: string) {
  return value.split(/\s+/u).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "U";
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><CalendarDays size={24}/><strong>{text}</strong><span>Los datos aparecerán aquí cuando se registren.</span></div>;
}

function AppointmentRow({ appointment: a }: { appointment: Appointment }) {
  return <div className="appointment-row"><time>{a.time}</time><div className="person-initial">{a.clientName.split(" ").map((n)=>n[0]).slice(0,2).join("")}</div><div><strong>{a.clientName}</strong><p>{a.serviceName} · {a.professionalName}</p></div><span className={`status ${a.status}`}>{a.status}</span><button className="ghost-icon" aria-label="Más opciones"><MoreHorizontal size={18}/></button></div>;
}

function ModuleView({ section, appointments, recurringSeries, catalog, identity, canWrite, onServicesChanged, onProfessionalsChanged, onClientUpdated, onPaymentChanged, onNew, onNewRecurring, onEditSeries, onCancelSeries, onEdit, onReschedule, onStatus }: { section: string; appointments: Appointment[]; recurringSeries:RecurringSeries[]; catalog: Catalog|null; identity:AdminIdentity; canWrite:boolean; onServicesChanged:(services:Service[])=>void; onProfessionalsChanged:(professionals:Professional[],changed?:Professional)=>void; onClientUpdated:(client:ClientRecord)=>void; onPaymentChanged:(appointmentId:string,paidCents:number)=>void; onNew: () => void; onNewRecurring:()=>void; onEditSeries:(series:RecurringSeries)=>void; onCancelSeries:(series:RecurringSeries)=>Promise<void>; onEdit:(appointment:Appointment)=>void; onReschedule:(appointment:Appointment,date:string,time:string)=>Promise<void>; onStatus:(id:string,status:string)=>Promise<void> }) {
  if (section === "agenda") return <Agenda appointments={appointments} professionals={catalog?.professionals??[]} timezone={identity.timezone} canWrite={canWrite} onEdit={onEdit} onReschedule={onReschedule} />;
  if (section === "citas") return <Appointments appointments={appointments} recurringSeries={recurringSeries} canWrite={canWrite} onNew={onNew} onNewRecurring={onNewRecurring} onEditSeries={onEditSeries} onCancelSeries={onCancelSeries} onEdit={onEdit} onStatus={onStatus} />;
  if (section === "clientes") return <Clients onClientUpdated={onClientUpdated} />;
  if (section === "caja") return <CommerceManager appointments={appointments} onPaymentChanged={onPaymentChanged} />;
  if (section === "servicios") return <Services initialServices={catalog?.services??[]} onCatalogChanged={onServicesChanged} />;
  if (section === "equipo") return <Team initialProfessionals={catalog?.professionals??[]} services={catalog?.services??[]} onCatalogChanged={onProfessionalsChanged} />;
  if (section === "horarios") return <Schedules professionals={catalog?.professionals??[]} timezone={identity.timezone} />;
  if (section === "reportes") return <Reports appointments={appointments} />;
  if (["marketing","promociones","fidelizacion","resenas","galeria","espera","pagos"].includes(section)) return <GrowthManager section={section} />;
  return <FeatureSection section={section} />;
}

function Agenda({appointments,professionals,timezone,canWrite,onEdit,onReschedule}:{appointments:Appointment[];professionals:Professional[];timezone:string;canWrite:boolean;onEdit:(appointment:Appointment)=>void;onReschedule:(appointment:Appointment,date:string,time:string)=>Promise<void>}) {
  const today=dateInTimeZone(timezone);
  const [view,setView]=useState<CalendarView>("week");
  const [anchorDate,setAnchorDate]=useState(today);
  const [professionalId,setProfessionalId]=useState("todos");
  const [loaded,setLoaded]=useState<{key:string;items:Appointment[];error:string}>({key:"",items:[],error:""});
  const [moving,setMoving]=useState("");
  const [moveError,setMoveError]=useState("");
  const range=calendarRange(anchorDate,view);
  const rangeKey=`${range.from}:${range.to}`;

  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/admin/appointments?from=${range.from}&to=${range.to}`,{credentials:"same-origin",signal:controller.signal}).then(async(response)=>{
      const data=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(data,"No pudimos cargar este rango de la agenda"));
      const items=Array.isArray(data.appointments)?data.appointments.filter(isAppointment):[];
      setLoaded({key:rangeKey,items,error:""});
    }).catch((reason)=>{
      if(reason instanceof DOMException&&reason.name==="AbortError")return;
      setLoaded({key:rangeKey,items:[],error:reason instanceof Error?reason.message:"No pudimos cargar este rango"});
    });
    return()=>controller.abort();
  },[range.from,range.to,rangeKey]);

  const fetched=loaded.key===rangeKey?loaded.items:[];
  const merged=new Map<string,Appointment>();
  fetched.forEach((item)=>merged.set(item.id,item));
  appointments.forEach((item)=>merged.set(item.id,item));
  const visible=Array.from(merged.values()).filter((item)=>item.date>=range.from&&item.date<=range.to&&(professionalId==="todos"||item.professionalId===professionalId)).sort(compareAppointments);
  const isLoading=loaded.key!==rangeKey;
  const activeCount=visible.filter((item)=>!["cancelada","no_asistio"].includes(item.status)).length;
  const completedCount=visible.filter((item)=>item.status==="completada").length;
  const days=view==="month"?calendarDates(range.from,range.to):view==="week"?calendarDates(range.from,range.to):[anchorDate];
  const changeView=(next:CalendarView)=>{setView(next);setAnchorDate(next==="week"?startOfCalendarWeek(anchorDate):anchorDate)};
  const moveAppointment=async(id:string,date:string,time:string)=>{
    const appointment=visible.find((item)=>item.id===id);
    if(!appointment||appointment.date===date&&appointment.time===time)return;
    setMoving(id);setMoveError("");
    try{await onReschedule(appointment,date,time)}catch(reason){setMoveError(reason instanceof Error?reason.message:"No pudimos reprogramar la cita")}finally{setMoving("")}
  };

  return <div className="agenda-stack">
    <section className="panel agenda-panel">
      <div className="agenda-toolbar">
        <div className="agenda-navigation"><button className="icon-button" aria-label="Periodo anterior" onClick={()=>setAnchorDate(shiftCalendarAnchor(anchorDate,view,-1))}><ChevronLeft/></button><button className="secondary compact" onClick={()=>setAnchorDate(today)}>Hoy</button><button className="icon-button" aria-label="Periodo siguiente" onClick={()=>setAnchorDate(shiftCalendarAnchor(anchorDate,view,1))}><ChevronRight/></button></div>
        <strong>{calendarTitle(anchorDate,view,range)}</strong>
        <div className="agenda-filters">
          {professionals.length>1&&<select aria-label="Filtrar agenda por profesional" value={professionalId} onChange={(event)=>setProfessionalId(event.target.value)}><option value="todos">Todo el equipo</option>{professionals.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select>}
          <div className="segmented" aria-label="Vista de agenda">{(["day","week","month"] as CalendarView[]).map((item)=><button className={view===item?"selected":""} aria-pressed={view===item} onClick={()=>changeView(item)} key={item}>{({day:"Día",week:"Semana",month:"Mes"} as Record<CalendarView,string>)[item]}</button>)}</div>
        </div>
      </div>
      <div className="agenda-summary"><span><b>{visible.length}</b> citas en el periodo</span><span><b>{activeCount}</b> activas</span><span><b>{completedCount}</b> completadas</span>{isLoading&&<span className="agenda-sync">Actualizando…</span>}</div>
      {loaded.key===rangeKey&&loaded.error&&<p className="form-error" role="alert">{loaded.error}</p>}
      {moveError&&<p className="form-error" role="alert">{moveError}</p>}
      {view==="day"&&<AgendaDay date={anchorDate} appointments={visible} canWrite={canWrite} onEdit={onEdit}/>}
      {view==="week"&&<AgendaWeek days={days} appointments={visible} today={today} canWrite={canWrite} moving={moving} onEdit={onEdit} onMove={moveAppointment}/>}
      {view==="month"&&<AgendaMonth days={days} anchorDate={anchorDate} appointments={visible} today={today} onOpenDay={(date)=>{setAnchorDate(date);setView("day")}}/>}
    </section>
  </div>;
}

function AgendaDay({date,appointments,canWrite,onEdit}:{date:string;appointments:Appointment[];canWrite:boolean;onEdit:(appointment:Appointment)=>void}){
  const items=appointments.filter((item)=>item.date===date);
  return <div className="agenda-day"><div className="agenda-day-date"><span>{formatCalendarDate(date,{weekday:"long"})}</span><strong>{formatCalendarDate(date,{day:"2-digit"})}</strong><small>{formatCalendarDate(date,{month:"long",year:"numeric"})}</small></div><div className="agenda-day-timeline">{items.length?items.map((item)=><AgendaEvent appointment={item} expanded canWrite={canWrite} onEdit={onEdit} key={item.id}/>):<EmptyState text="No hay citas para este día."/>}</div></div>;
}

function AgendaWeek({days,appointments,today,canWrite,moving,onEdit,onMove}:{days:string[];appointments:Appointment[];today:string;canWrite:boolean;moving:string;onEdit:(appointment:Appointment)=>void;onMove:(id:string,date:string,time:string)=>Promise<void>}){
  const appointmentHours=appointments.map((item)=>Number(item.time.slice(0,2))).filter(Number.isFinite);
  const firstHour=Math.min(8,...appointmentHours);
  const lastHour=Math.max(19,...appointmentHours);
  const hours=Array.from({length:lastHour-firstHour+1},(_,index)=>String(firstHour+index).padStart(2,"0")+":00");
  return <div className="agenda-scroll"><div className="week-calendar"><div className="week-calendar-row week-calendar-header"><span/>{days.map((day)=><div className={day===today?"today":""} key={day}><span>{formatCalendarDate(day,{weekday:"short"})}</span><b>{formatCalendarDate(day,{day:"numeric"})}</b></div>)}</div>{hours.map((hour)=><div className="week-calendar-row" key={hour}><time>{hour}</time>{days.map((day)=>{const items=appointments.filter((item)=>item.date===day&&item.time.slice(0,2)===hour.slice(0,2));return <div className="week-calendar-cell" key={day} onDragOver={canWrite?(event)=>event.preventDefault():undefined} onDrop={canWrite?(event)=>{event.preventDefault();const id=event.dataTransfer.getData("text/appointment-id");const appointment=appointments.find((item)=>item.id===id);if(appointment)void onMove(id,day,`${hour.slice(0,2)}:${appointment.time.slice(3,5)}`)}:undefined}>{items.map((item)=><AgendaEvent appointment={item} canWrite={canWrite} moving={moving===item.id} onEdit={onEdit} key={item.id}/>)}</div>})}</div>)}</div></div>;
}

function AgendaMonth({days,anchorDate,appointments,today,onOpenDay}:{days:string[];anchorDate:string;appointments:Appointment[];today:string;onOpenDay:(date:string)=>void}){
  const month=anchorDate.slice(0,7);
  return <div className="agenda-scroll"><div className="month-calendar"><div className="month-weekdays">{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((day)=><span key={day}>{day}</span>)}</div><div className="month-grid">{days.map((day)=>{const items=appointments.filter((item)=>item.date===day);return <button type="button" className={`month-day ${day.slice(0,7)!==month?"outside":""} ${day===today?"today":""}`} onClick={()=>onOpenDay(day)} aria-label={`${formatCalendarDate(day,{day:"numeric",month:"long"})}: ${items.length} citas`} key={day}><span>{Number(day.slice(8))}</span><div>{items.slice(0,3).map((item)=><small className={`month-event ${item.status}`} key={item.id}><b>{item.time}</b> {item.clientName}</small>)}{items.length>3&&<small className="month-more">+{items.length-3} más</small>}</div></button>})}</div></div></div>;
}

function AgendaEvent({appointment,expanded=false,canWrite=false,moving=false,onEdit}:{appointment:Appointment;expanded?:boolean;canWrite?:boolean;moving?:boolean;onEdit?:(appointment:Appointment)=>void}){
  const editable=canWrite&&["programada","confirmada"].includes(appointment.status);
  return <article className={`agenda-event ${appointment.status} ${expanded?"expanded":""} ${editable?"editable":""} ${moving?"moving":""}`} role={editable?"button":undefined} tabIndex={editable?0:undefined} draggable={editable} onClick={editable?()=>onEdit?.(appointment):undefined} onKeyDown={editable?(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEdit?.(appointment)}}:undefined} onDragStart={editable?(event)=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/appointment-id",appointment.id)}:undefined} title={editable?"Haz clic para editar o arrastra para reprogramar":undefined}><time>{appointment.time}<small>{appointment.endTime}</small></time><div><strong>{appointment.clientName}</strong><span>{appointment.serviceName}</span>{expanded&&<small>{appointment.professionalName} · {statusLabel(appointment.status)}</small>}</div>{editable&&!expanded&&<GripVertical className="agenda-drag"/>}{expanded&&<span className={`status ${appointment.status}`}>{statusLabel(appointment.status)}</span>}</article>;
}

function compareAppointments(a:Appointment,b:Appointment){return `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)}

function formatCalendarDate(date:string,options:Intl.DateTimeFormatOptions){return new Intl.DateTimeFormat("es-VE",{...options,timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`))}

function calendarTitle(anchorDate:string,view:CalendarView,range:{from:string;to:string}){
  if(view==="day")return capitalize(formatCalendarDate(anchorDate,{weekday:"long",day:"numeric",month:"long",year:"numeric"}));
  if(view==="week")return `${formatShortDate(range.from)} — ${formatShortDate(range.to)}`;
  return capitalize(formatCalendarDate(anchorDate,{month:"long",year:"numeric"}));
}

function capitalize(value:string){return value.charAt(0).toUpperCase()+value.slice(1)}

function Appointments({ appointments, recurringSeries, canWrite, onNew, onNewRecurring, onEditSeries, onCancelSeries, onEdit, onStatus }: { appointments: Appointment[]; recurringSeries:RecurringSeries[]; canWrite:boolean; onNew: () => void; onNewRecurring:()=>void; onEditSeries:(series:RecurringSeries)=>void; onCancelSeries:(series:RecurringSeries)=>Promise<void>; onEdit:(appointment:Appointment)=>void; onStatus:(id:string,status:string)=>Promise<void> }) {
  const [query,setQuery]=useState(""); const [status,setStatus]=useState("todos");
  const filtered=appointments.filter((item)=>(status==="todos"||item.status===status)&&`${item.clientName} ${item.serviceName} ${item.professionalName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return <div className="recurring-stack"><section className="panel recurring-series-panel"><div className="recurring-series-head"><div><span className="eyebrow">Automatización de agenda</span><h2>Series recurrentes</h2><p>Edita cada cita por separado o administra todas las futuras desde su serie.</p></div>{canWrite&&<button className="secondary" onClick={onNewRecurring}><CalendarDays size={16}/> Cita recurrente</button>}</div><div className="recurring-series-list">{recurringSeries.map((series)=><article className={`recurring-series-row ${series.status}`} key={series.id}><div className="recurring-series-icon"><CalendarDays/></div><div><strong>{series.clientName}</strong><p>{series.serviceName} · {series.professionalName}</p><small>{frequencyLabel(series.frequency)} · {series.time} · hasta {formatShortDate(series.endDate)}</small></div><div className="recurring-series-count"><strong>{series.futureCount}</strong><span>futuras</span></div><div className="recurring-series-next"><span>Próxima</span><strong>{series.nextDate?formatShortDate(series.nextDate):"Sin pendientes"}</strong></div><span className={`status ${series.status==="active"?"confirmada":"cancelada"}`}>{series.status==="active"?"Activa":"Cancelada"}</span>{canWrite&&series.status==="active"&&<div className="recurring-series-actions"><button className="ghost-icon" aria-label={`Editar serie de ${series.clientName}`} onClick={()=>onEditSeries(series)}><Pencil size={15}/></button><button className="ghost-icon danger" aria-label={`Cancelar serie de ${series.clientName}`} onClick={()=>void onCancelSeries(series)}><Trash2 size={15}/></button></div>}</article>)}{!recurringSeries.length&&<EmptyState text="Todavía no hay series recurrentes."/>}</div></section><div className="panel table-panel"><div className="table-tools"><div className="search-box"><Search size={16}/><input aria-label="Buscar cita" placeholder="Buscar cita..." value={query} onChange={(event)=>setQuery(event.target.value)}/></div><select aria-label="Filtrar por estado" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="todos">Todos los estados</option>{["programada","confirmada","en_progreso","completada","cancelada","no_asistio"].map((value)=><option value={value} key={value}>{statusLabel(value)}</option>)}</select>{canWrite&&<div className="table-action-group"><button className="secondary" onClick={onNewRecurring}><CalendarDays size={16}/> Recurrente</button><button className="primary" onClick={onNew}><Plus size={16}/> Nueva cita</button></div>}</div><div className="data-table"><div className="table-header"><span>Fecha</span><span>Cliente</span><span>Servicio</span><span>Profesional</span><span>Estado</span><span>Cobro</span></div>{filtered.map(a=>{const editable=canWrite&&["programada","confirmada"].includes(a.status);return <div className="table-row" key={a.id}><span><b>{a.time} — {a.endTime}</b><small>{formatShortDate(a.date)}</small></span><span><b>{a.clientName}</b><small>{a.phone}</small></span><span><span>{a.serviceName}</span>{a.recurringSeriesId&&<small className="recurring-badge"><CalendarDays size={11}/> Recurrente #{a.occurrenceNumber??""}</small>}</span><span>{a.professionalName}</span><span><select className="status-select" aria-label={`Estado de ${a.clientName}`} value={a.status} onChange={(event)=>void onStatus(a.id,event.target.value)} disabled={!canWrite||["cancelada","completada","no_asistio"].includes(a.status)}>{statusOptions(a.status).map((value)=><option value={value} key={value}>{statusLabel(value)}</option>)}</select>{a.status==="cancelada"&&a.cancellationReason&&<small className="cancellation-reason" title={a.cancellationReason}>{a.cancellationReason}</small>}</span><span className="appointment-total"><span><b>${(a.paidCents/100).toFixed(2)} / ${(a.totalCents/100).toFixed(2)}</b><small className={`payment-state ${a.paymentStatus}`}>{a.paymentStatus==="pagado"?"Pagada":a.paymentStatus==="parcial"?"Parcial":"Pendiente"}</small></span>{editable&&<button className="ghost-icon" aria-label={`Editar cita de ${a.clientName}`} onClick={()=>onEdit(a)}><Pencil size={15}/></button>}</span></div>})}{!filtered.length&&<EmptyState text="No encontramos citas con esos filtros."/>}</div></div></div>;
}

function Clients({onClientUpdated}:{onClientUpdated:(client:ClientRecord)=>void}){
  const [query,setQuery]=useState("");
  const [clients,setClients]=useState<ClientRecord[]>([]);
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [editing,setEditing]=useState<ClientRecord|null>(null);
  const [formOpen,setFormOpen]=useState(false);
  const [detail,setDetail]=useState<{client:ClientRecord;history:ClientHistoryItem[]}|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [importing,setImporting]=useState(false);
  const importInput=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/admin/clients",{credentials:"same-origin",signal:controller.signal}).then(async(response)=>{
      const data=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(data,"No pudimos cargar los clientes"));
      setClients(Array.isArray(data.clients)?data.clients.filter(isClientRecord):[]);
      setCanManage(data.canManage===true);
    }).catch((reason)=>{if(!(reason instanceof DOMException&&reason.name==="AbortError"))setError(reason instanceof Error?reason.message:"No pudimos cargar los clientes")}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[]);

  const openHistory=async(client:ClientRecord)=>{
    setDetailLoading(true);setError("");
    try{
      const response=await fetch(`/api/admin/clients?id=${encodeURIComponent(client.id)}`,{credentials:"same-origin"});
      const data=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(data,"No pudimos cargar el historial"));
      if(!isClientRecord(data.client))throw new Error("Los datos del cliente no son válidos.");
      setDetail({client:data.client,history:Array.isArray(data.history)?data.history.filter(isClientHistoryItem):[]});
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cargar el historial")}finally{setDetailLoading(false)}
  };
  const upsert=(client:ClientRecord)=>{
    setClients((items)=>[...items.filter((item)=>item.id!==client.id),client].sort((a,b)=>a.name.localeCompare(b.name,"es")));
    onClientUpdated(client);setFormOpen(false);setEditing(null);
    if(detail?.client.id===client.id)setDetail({...detail,client});
  };
  const remove=(id:string)=>{setClients((items)=>items.filter((item)=>item.id!==id));setFormOpen(false);setEditing(null);if(detail?.client.id===id)setDetail(null)};
  const filtered=clients.filter((item)=>`${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query.trim().toLowerCase()));
  const recurrent=clients.filter((item)=>item.appointmentCount>1).length;
  const completed=clients.reduce((sum,item)=>sum+item.completedCount,0);
  const revenue=clients.reduce((sum,item)=>sum+item.totalSpentCents,0);
  const importClients=async(file:File)=>{
    setImporting(true);setError("");
    try{const form=new FormData();form.append("file",file);const response=await fetch("/api/admin/clients/import",{method:"POST",body:form});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos importar los clientes"));const refresh=await fetch("/api/admin/clients",{credentials:"same-origin"});const refreshed=await readJsonObject(refresh);if(!refresh.ok)throw new Error(apiError(refreshed,"No pudimos actualizar el directorio"));setClients(Array.isArray(refreshed.clients)?refreshed.clients.filter(isClientRecord):[]);setError(`Importación lista: ${String(data.imported??0)} nuevos, ${String(data.updated??0)} actualizados, ${String(data.skipped??0)} omitidos.`)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos importar los clientes")}finally{setImporting(false);if(importInput.current)importInput.current.value=""}
  };

  return <>
    <section className="metric-grid three"><Metric icon={<UsersRound/>} tone="terracotta" label="Total clientes" value={String(clients.length)} trend="Registros persistentes"/><Metric icon={<Star/>} tone="olive" label="Recurrentes" value={clients.length?`${Math.round(recurrent/clients.length*100)}%`:"0%"} trend={`${recurrent} con más de una cita`}/><Metric icon={<TrendingUp/>} tone="sand" label="Ticket promedio" value={`$${(revenue/Math.max(1,completed)/100).toFixed(2)}`} trend="Sobre citas completadas"/></section>
    <div className="panel table-panel clients-panel"><div className="table-tools"><div className="search-box"><Search size={16}/><input aria-label="Buscar cliente" placeholder="Nombre, email o teléfono..." value={query} onChange={(event)=>setQuery(event.target.value)}/></div>{canManage&&<div className="table-action-group"><input ref={importInput} type="file" accept=".csv,text/csv" hidden onChange={(event)=>{const file=event.target.files?.[0];if(file)void importClients(file)}}/><button className="secondary" disabled={importing} onClick={()=>importInput.current?.click()}><Upload size={15}/>{importing?"Importando...":"Importar CSV"}</button><a className="secondary" href="/api/admin/clients/export" download><Download size={15}/> Exportar</a><button className="primary" onClick={()=>{setEditing(null);setFormOpen(true)}}><Plus size={16}/> Nuevo cliente</button></div>}</div>
      {loading&&<div className="loading-line"/>}{error&&<p className="form-error" role="alert">{error}</p>}
      <div className="client-list">{filtered.map((client)=><div className="client-row persistent" key={client.id}><div className="person-initial">{initials(client.name)}</div><div className="client-identity"><strong>{client.name}</strong><p>{client.phone} · {client.email}</p>{client.notes&&<small>{client.notes}</small>}</div><span><b>{client.appointmentCount}</b> {client.appointmentCount===1?"cita":"citas"}<small>{client.lastAppointmentDate?`Última: ${formatShortDate(client.lastAppointmentDate)}`:"Sin visitas"}</small></span><span><b>${(client.totalSpentCents/100).toFixed(2)}</b><small>Completado</small></span><div className="client-actions"><button className="secondary compact" disabled={detailLoading} onClick={()=>void openHistory(client)}>Historial</button>{canManage&&<button className="ghost-icon" aria-label={`Editar a ${client.name}`} onClick={()=>{setEditing(client);setFormOpen(true)}}><Pencil size={16}/></button>}</div></div>)}{!loading&&!filtered.length&&<EmptyState text={query?"No encontramos clientes con esa búsqueda.":"Aún no hay clientes registrados."}/>}</div>
    </div>
    {formOpen&&<ClientFormModal client={editing} onClose={()=>{setFormOpen(false);setEditing(null)}} onSaved={upsert} onDeleted={remove}/>}
    {detail&&<ClientHistoryModal client={detail.client} history={detail.history} canManage={canManage} onClose={()=>setDetail(null)} onEdit={()=>{setEditing(detail.client);setDetail(null);setFormOpen(true)}}/>}
  </>;
}

function ClientFormModal({client,onClose,onSaved,onDeleted}:{client:ClientRecord|null;onClose:()=>void;onSaved:(client:ClientRecord)=>void;onDeleted:(id:string)=>void}){
  const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError("");const payload=Object.fromEntries(new FormData(event.currentTarget).entries());try{const response=await fetch("/api/admin/clients",{method:client?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(client?{...payload,id:client.id}:payload)});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos guardar el cliente"));if(!isClientRecord(data.client))throw new Error("El cliente guardado no es válido.");onSaved(data.client)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos guardar el cliente");setSaving(false)}};
  const remove=async()=>{if(!client||client.appointmentCount>0||!window.confirm(`¿Eliminar a ${client.name}? Esta acción no se puede deshacer.`))return;setSaving(true);setError("");try{const response=await fetch("/api/admin/clients",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:client.id})});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos eliminar el cliente"));onDeleted(client.id)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos eliminar el cliente");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal client-modal" role="dialog" aria-modal="true" aria-labelledby="client-form-title"><div className="modal-head"><div><span className="eyebrow">Directorio real</span><h2 id="client-form-title">{client?"Editar cliente":"Nuevo cliente"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre completo<input name="name" required minLength={2} maxLength={100} autoComplete="name" defaultValue={client?.name??""}/></label><label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={client?.email??""}/></label><label>Teléfono<input name="phone" required maxLength={25} autoComplete="tel" placeholder="+58 412 000 0000" defaultValue={client?.phone??""}/></label><label className="wide">Notas<textarea name="notes" maxLength={1000} defaultValue={client?.notes??""} placeholder="Preferencias, alergias u observaciones..."/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}{client&&client.appointmentCount>0&&<p className="client-delete-note">Este cliente tiene historial y no puede eliminarse; sus datos sí pueden actualizarse.</p>}<div className="modal-actions split">{client&&client.appointmentCount===0?<button type="button" className="danger-button" disabled={saving} onClick={()=>void remove()}><Trash2 size={15}/> Eliminar</button>:<span/>}<div><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Guardar cliente"}</button></div></div></form></div></div>;
}

function ClientHistoryModal({client,history,canManage,onClose,onEdit}:{client:ClientRecord;history:ClientHistoryItem[];canManage:boolean;onClose:()=>void;onEdit:()=>void}){
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal client-history-modal" role="dialog" aria-modal="true" aria-labelledby="client-history-title"><div className="modal-head"><div><span className="eyebrow">Historial persistente</span><h2 id="client-history-title">{client.name}</h2><p>{client.phone} · {client.email}</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><div className="client-history-summary"><span><b>{client.appointmentCount}</b>Citas</span><span><b>{client.completedCount}</b>Completadas</span><span><b>${(client.totalSpentCents/100).toFixed(2)}</b>Facturado</span></div>{client.notes&&<div className="client-notes"><strong>Notas</strong><p>{client.notes}</p></div>}<div className="client-history-list">{history.map((item)=><div className="client-history-row" key={item.id}><time><b>{formatShortDate(item.date)}</b><small>{item.time} — {item.endTime}</small></time><div><strong>{item.serviceName}</strong><p>{item.professionalName}</p></div><span className={`status ${item.status}`}>{statusLabel(item.status)}</span><b>${(item.totalCents/100).toFixed(2)}</b></div>)}{!history.length&&<EmptyState text="Este cliente todavía no tiene citas."/>}</div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cerrar</button>{canManage&&<button className="primary" onClick={onEdit}><Pencil size={15}/> Editar datos</button>}</div></div></div>;
}


function Services({initialServices,onCatalogChanged}:{initialServices:Service[];onCatalogChanged:(services:Service[])=>void}){
  const [services,setServices]=useState<ManagedService[]>(()=>initialServices.map((service)=>({...service,active:service.active??1,appointmentCount:0})));
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("todos");
  const [editing,setEditing]=useState<ManagedService|null>(null);
  const [formOpen,setFormOpen]=useState(false);
  const [savingId,setSavingId]=useState("");

  const syncServices=(next:ManagedService[])=>{
    const ordered=[...next].sort((a,b)=>Number(serviceIsActive(b))-Number(serviceIsActive(a))||a.category.localeCompare(b.category,"es")||a.name.localeCompare(b.name,"es"));
    setServices(ordered);
    onCatalogChanged(ordered.filter(serviceIsActive).map((service)=>({
      id:service.id,name:service.name,category:service.category,durationMinutes:service.durationMinutes,
      priceCents:service.priceCents,active:service.active,
    })));
  };

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/admin/services",{credentials:"same-origin",signal:controller.signal}).then(async(response)=>{
      const data=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(data,"No pudimos cargar los servicios"));
      const loaded=Array.isArray(data.services)?data.services.filter(isManagedService):[];
      setServices([...loaded].sort((a,b)=>Number(serviceIsActive(b))-Number(serviceIsActive(a))||a.category.localeCompare(b.category,"es")||a.name.localeCompare(b.name,"es")));
      setCanManage(data.canManage===true);
    }).catch((reason)=>{if(!(reason instanceof DOMException&&reason.name==="AbortError"))setError(reason instanceof Error?reason.message:"No pudimos cargar los servicios")}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[]);

  const upsert=(service:ManagedService)=>{
    syncServices([...services.filter((item)=>item.id!==service.id),service]);
    setFormOpen(false);setEditing(null);
  };
  const toggle=async(service:ManagedService)=>{
    setSavingId(service.id);setError("");
    try{
      const response=await fetch("/api/admin/services",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
        id:service.id,name:service.name,category:service.category,durationMinutes:service.durationMinutes,
        price:(service.priceCents/100).toFixed(2),active:!serviceIsActive(service),
      })});
      const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos cambiar el estado"));
      if(!isManagedService(data.service))throw new Error("El servicio actualizado no es válido.");
      upsert(data.service);
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cambiar el estado")}finally{setSavingId("")}
  };
  const filtered=services.filter((service)=>(filter==="todos"||(filter==="activos")===serviceIsActive(service))&&`${service.name} ${service.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const activeCount=services.filter(serviceIsActive).length;

  return <>
    <section className="metric-grid three"><Metric icon={<Scissors/>} tone="terracotta" label="Servicios" value={String(services.length)} trend="Catálogo persistente"/><Metric icon={<CheckCircle2/>} tone="olive" label="Activos" value={String(activeCount)} trend="Visibles al reservar"/><Metric icon={<Clock3/>} tone="sand" label="Duración promedio" value={`${services.length?Math.round(services.reduce((sum,item)=>sum+item.durationMinutes,0)/services.length):0} min`} trend="Configurada por servicio"/></section>
    <div className="panel services-panel"><div className="table-tools services-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Buscar servicio" placeholder="Nombre o categoría..." value={query} onChange={(event)=>setQuery(event.target.value)}/></div><select aria-label="Filtrar servicios" value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></select>{canManage&&<button className="primary" onClick={()=>{setEditing(null);setFormOpen(true)}}><Plus size={16}/> Nuevo servicio</button>}</div>{loading&&<div className="loading-line"/>}{error&&<p className="form-error" role="alert">{error}</p>}
      <div className="cards-grid managed-services">{filtered.map((service,index)=><article className={`service-card managed ${serviceIsActive(service)?"":"inactive"}`} key={service.id}><div className={`service-art art-${index%3}`}><Scissors/></div><div className="service-card-copy"><span className="category">{service.category}</span><h3>{service.name}</h3><p><Clock3 size={15}/>{service.durationMinutes} min<b>${(service.priceCents/100).toFixed(2)}</b></p><small>{service.appointmentCount} {service.appointmentCount===1?"cita asociada":"citas asociadas"}</small></div><div className="service-card-actions"><span className={`status ${serviceIsActive(service)?"confirmada":"cancelada"}`}>{serviceIsActive(service)?"activo":"inactivo"}</span>{canManage&&<><button className="ghost-icon" aria-label={`Editar ${service.name}`} onClick={()=>{setEditing(service);setFormOpen(true)}}><Pencil size={15}/></button><button className="service-toggle" disabled={savingId===service.id} onClick={()=>void toggle(service)}>{savingId===service.id?"Guardando...":serviceIsActive(service)?"Desactivar":"Activar"}</button></>}</div></article>)}{!loading&&!filtered.length&&<div className="service-empty"><EmptyState text={query||filter!=="todos"?"No hay servicios con esos filtros.":"Aún no hay servicios registrados."}/></div>}</div>
    </div>
    {formOpen&&<ServiceFormModal service={editing} onClose={()=>{setFormOpen(false);setEditing(null)}} onSaved={upsert} onDeleted={(id)=>{syncServices(services.filter((item)=>item.id!==id));setFormOpen(false);setEditing(null)}}/>}
  </>;
}

function ServiceFormModal({service,onClose,onSaved,onDeleted}:{service:ManagedService|null;onClose:()=>void;onSaved:(service:ManagedService)=>void;onDeleted:(id:string)=>void}){
  const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError("");const form=new FormData(event.currentTarget);const payload={name:form.get("name"),category:form.get("category"),durationMinutes:form.get("durationMinutes"),price:form.get("price"),active:form.get("active")==="on"};try{const response=await fetch("/api/admin/services",{method:service?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(service?{...payload,id:service.id}:payload)});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos guardar el servicio"));if(!isManagedService(data.service))throw new Error("El servicio guardado no es válido.");onSaved(data.service)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos guardar el servicio");setSaving(false)}};
  const remove=async()=>{if(!service||service.appointmentCount>0||!window.confirm(`¿Eliminar ${service.name}? Esta acción no se puede deshacer.`))return;setSaving(true);setError("");try{const response=await fetch("/api/admin/services",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:service.id})});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos eliminar el servicio"));onDeleted(service.id)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos eliminar el servicio");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="service-form-title"><div className="modal-head"><div><span className="eyebrow">Catálogo real</span><h2 id="service-form-title">{service?"Editar servicio":"Nuevo servicio"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre<input name="name" required minLength={2} maxLength={100} defaultValue={service?.name??""} placeholder="Ej. Corte clásico"/></label><label>Categoría<input name="category" required minLength={2} maxLength={60} defaultValue={service?.category??""} placeholder="Cortes"/></label><label>Duración (minutos)<input name="durationMinutes" type="number" required min={5} max={480} step={5} defaultValue={service?.durationMinutes??30}/></label><label>Precio<input name="price" type="number" required min={0} max={1000000} step="0.01" defaultValue={service?(service.priceCents/100).toFixed(2):""} placeholder="0.00"/></label><label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={service?serviceIsActive(service):true}/><span><b>Servicio activo</b><small>Visible en la reserva pública y disponible para nuevas citas.</small></span></label></div>{error&&<p className="form-error" role="alert">{error}</p>}{service&&service.appointmentCount>0&&<p className="client-delete-note">Este servicio tiene citas y no puede eliminarse; puedes desactivarlo para impedir nuevas reservas.</p>}<div className="modal-actions split">{service&&service.appointmentCount===0?<button type="button" className="danger-button" disabled={saving} onClick={()=>void remove()}><Trash2 size={15}/> Eliminar</button>:<span/>}<div><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Guardar servicio"}</button></div></div></form></div></div>;
}

function Team({initialProfessionals,services,onCatalogChanged}:{initialProfessionals:Professional[];services:Service[];onCatalogChanged:(professionals:Professional[],changed?:Professional)=>void}){
  const [professionals,setProfessionals]=useState<ManagedProfessional[]>(()=>initialProfessionals.map((professional)=>({
    ...professional,email:"",phone:"",active:professional.active??1,appointmentCount:0,completedCount:0,totalRevenueCents:0,blockCount:0,serviceIds:professional.serviceIds??services.map((service)=>service.id),
  })));
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("todos");
  const [editing,setEditing]=useState<ManagedProfessional|null>(null);
  const [formOpen,setFormOpen]=useState(false);
  const [savingId,setSavingId]=useState("");

  const syncProfessionals=(next:ManagedProfessional[],changed?:ManagedProfessional)=>{
    const ordered=[...next].sort((a,b)=>Number(professionalIsActive(b))-Number(professionalIsActive(a))||a.name.localeCompare(b.name,"es"));
    setProfessionals(ordered);
    onCatalogChanged(ordered.filter(professionalIsActive).map((professional)=>({
      id:professional.id,name:professional.name,specialty:professional.specialty,active:professional.active,serviceIds:professional.serviceIds,
    })),changed);
  };

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/admin/professionals",{credentials:"same-origin",signal:controller.signal}).then(async(response)=>{
      const data=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(data,"No pudimos cargar el equipo"));
      const loaded=Array.isArray(data.professionals)?data.professionals.filter(isManagedProfessional):[];
      setProfessionals([...loaded].sort((a,b)=>Number(professionalIsActive(b))-Number(professionalIsActive(a))||a.name.localeCompare(b.name,"es")));
      setCanManage(data.canManage===true);
    }).catch((reason)=>{if(!(reason instanceof DOMException&&reason.name==="AbortError"))setError(reason instanceof Error?reason.message:"No pudimos cargar el equipo")}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[]);

  const upsert=(professional:ManagedProfessional)=>{
    syncProfessionals([...professionals.filter((item)=>item.id!==professional.id),professional],professional);
    setFormOpen(false);setEditing(null);
  };
  const toggle=async(professional:ManagedProfessional)=>{
    setSavingId(professional.id);setError("");
    try{
      const response=await fetch("/api/admin/professionals",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
        id:professional.id,name:professional.name,specialty:professional.specialty,email:professional.email,
        phone:professional.phone,active:!professionalIsActive(professional),serviceIds:professional.serviceIds,
      })});
      const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos cambiar el estado"));
      if(!isManagedProfessional(data.professional))throw new Error("El profesional actualizado no es válido.");
      upsert(data.professional);
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cambiar el estado")}finally{setSavingId("")}
  };
  const filtered=professionals.filter((professional)=>(filter==="todos"||(filter==="activos")===professionalIsActive(professional))&&`${professional.name} ${professional.specialty} ${professional.email} ${professional.phone}`.toLowerCase().includes(query.trim().toLowerCase()));
  const activeCount=professionals.filter(professionalIsActive).length;
  const completedCount=professionals.reduce((sum,item)=>sum+item.completedCount,0);

  return <>
    <section className="metric-grid three"><Metric icon={<UserRound/>} tone="terracotta" label="Profesionales" value={String(professionals.length)} trend="Perfiles persistentes"/><Metric icon={<CheckCircle2/>} tone="olive" label="Activos" value={String(activeCount)} trend="Disponibles para reservar"/><Metric icon={<TrendingUp/>} tone="sand" label="Servicios completados" value={String(completedCount)} trend="Historial real del equipo"/></section>
    <div className="panel team-panel"><div className="table-tools team-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Buscar profesional" placeholder="Nombre, especialidad o contacto..." value={query} onChange={(event)=>setQuery(event.target.value)}/></div><select aria-label="Filtrar profesionales" value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></select>{canManage&&<button className="primary" onClick={()=>{setEditing(null);setFormOpen(true)}}><Plus size={16}/> Nuevo profesional</button>}</div>{loading&&<div className="loading-line"/>}{error&&<p className="form-error" role="alert">{error}</p>}
      <div className="team-grid managed-team">{filtered.map((professional)=><article className={`team-card managed ${professionalIsActive(professional)?"":"inactive"}`} key={professional.id}><div className="team-photo">{initials(professional.name)}</div><div className="team-card-copy"><h2>{professional.name}</h2><p>{professional.specialty}</p><small>{[professional.email,professional.phone].filter(Boolean).join(" · ")||"Sin datos de contacto"}</small><div className="professional-services">{professional.serviceIds.slice(0,3).map((id)=><span key={id}>{services.find((service)=>service.id===id)?.name??"Servicio"}</span>)}{professional.serviceIds.length>3&&<span>+{professional.serviceIds.length-3}</span>}{!professional.serviceIds.length&&<span>Sin servicios</span>}</div></div><div className="team-card-actions"><span className={`status ${professionalIsActive(professional)?"confirmada":"cancelada"}`}>{professionalIsActive(professional)?"activo":"inactivo"}</span>{canManage&&<><button className="ghost-icon" aria-label={`Editar ${professional.name}`} onClick={()=>{setEditing(professional);setFormOpen(true)}}><Pencil size={15}/></button><button className="service-toggle" disabled={savingId===professional.id} onClick={()=>void toggle(professional)}>{savingId===professional.id?"Guardando...":professionalIsActive(professional)?"Desactivar":"Activar"}</button></>}</div><div className="team-stats"><span><b>{professional.appointmentCount}</b> citas</span><span><b>{professional.completedCount}</b> completadas</span><span><b>${(professional.totalRevenueCents/100).toFixed(2)}</b> ingresos</span></div></article>)}{!loading&&!filtered.length&&<div className="team-empty"><EmptyState text={query||filter!=="todos"?"No hay profesionales con esos filtros.":"Aún no hay profesionales registrados."}/></div>}</div>
    </div>
    {formOpen&&<ProfessionalFormModal professional={editing} services={services} onClose={()=>{setFormOpen(false);setEditing(null)}} onSaved={upsert} onDeleted={(id)=>{syncProfessionals(professionals.filter((item)=>item.id!==id));setFormOpen(false);setEditing(null)}}/>}
  </>;
}

function ProfessionalFormModal({professional,services,onClose,onSaved,onDeleted}:{professional:ManagedProfessional|null;services:Service[];onClose:()=>void;onSaved:(professional:ManagedProfessional)=>void;onDeleted:(id:string)=>void}){
  const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError("");const form=new FormData(event.currentTarget);const payload={name:form.get("name"),specialty:form.get("specialty"),email:form.get("email"),phone:form.get("phone"),active:form.get("active")==="on",serviceIds:form.getAll("serviceIds")};try{const response=await fetch("/api/admin/professionals",{method:professional?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(professional?{...payload,id:professional.id}:payload)});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos guardar el profesional"));if(!isManagedProfessional(data.professional))throw new Error("El profesional guardado no es válido.");onSaved(data.professional)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos guardar el profesional");setSaving(false)}};
  const hasDependencies=Boolean(professional&&(professional.appointmentCount>0||professional.blockCount>0));
  const remove=async()=>{if(!professional||hasDependencies||!window.confirm(`¿Eliminar a ${professional.name}? Esta acción no se puede deshacer.`))return;setSaving(true);setError("");try{const response=await fetch("/api/admin/professionals",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:professional.id})});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos eliminar el profesional"));onDeleted(professional.id)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos eliminar el profesional");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal professional-modal" role="dialog" aria-modal="true" aria-labelledby="professional-form-title"><div className="modal-head"><div><span className="eyebrow">Equipo real</span><h2 id="professional-form-title">{professional?"Editar profesional":"Nuevo profesional"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre completo<input name="name" required minLength={2} maxLength={100} autoComplete="name" defaultValue={professional?.name??""} placeholder="Ej. Andrea Silva"/></label><label className="wide">Especialidad<input name="specialty" required minLength={2} maxLength={120} defaultValue={professional?.specialty??""} placeholder="Fades, barba y clásicos"/></label><label>Correo electrónico<input name="email" type="email" maxLength={254} autoComplete="email" defaultValue={professional?.email??""}/></label><label>Teléfono<input name="phone" maxLength={25} autoComplete="tel" defaultValue={professional?.phone??""} placeholder="+58 412 000 0000"/></label><fieldset className="wide professional-service-picker"><legend>Servicios que ofrece</legend>{services.map((service)=><label key={service.id}><input name="serviceIds" type="checkbox" value={service.id} defaultChecked={professional?professional.serviceIds.includes(service.id):true}/><span><b>{service.name}</b><small>{service.durationMinutes} min · ${(service.priceCents/100).toFixed(2)}</small></span></label>)}{!services.length&&<p>No hay servicios activos para asignar.</p>}</fieldset><label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={professional?professionalIsActive(professional):true}/><span><b>Profesional activo</b><small>Visible en la reserva pública y disponible para nuevas citas.</small></span></label></div>{error&&<p className="form-error" role="alert">{error}</p>}{hasDependencies&&<p className="client-delete-note">Este profesional tiene historial o bloqueos y no puede eliminarse; puedes desactivarlo para impedir nuevas reservas.</p>}<div className="modal-actions split">{professional&&!hasDependencies?<button type="button" className="danger-button" disabled={saving} onClick={()=>void remove()}><Trash2 size={15}/> Eliminar</button>:<span/>}<div><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Guardar profesional"}</button></div></div></form></div></div>;
}

function Schedules({professionals,timezone}:{professionals:Professional[];timezone:string}){
  const [selectedProfessionalId,setProfessionalId]=useState(professionals[0]?.id??"");
  const [hours,setHours]=useState<BusinessHour[]>([]);
  const [blocks,setBlocks]=useState<TimeBlock[]>([]);
  const [canManage,setCanManage]=useState(false);
  const [canManageSchedule,setCanManageSchedule]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [savingSchedule,setSavingSchedule]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const weekdays=[{label:"Lunes",value:1},{label:"Martes",value:2},{label:"Miércoles",value:3},{label:"Jueves",value:4},{label:"Viernes",value:5},{label:"Sábado",value:6},{label:"Domingo",value:0}];

  useEffect(()=>{
    fetch("/api/admin/time-blocks",{credentials:"same-origin"}).then(async(response)=>{
      const data=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(data,"No pudimos cargar los horarios"));
      setHours(Array.isArray(data.hours)?data.hours.filter(isBusinessHour):[]);
      setBlocks(Array.isArray(data.blocks)?data.blocks.filter(isTimeBlock):[]);
      setCanManage(data.canManage===true);
      setCanManageSchedule(data.canManageSchedule===true);
    }).catch((reason)=>setError(reason instanceof Error?reason.message:"No pudimos cargar los horarios")).finally(()=>setLoading(false));
  },[]);

  const professionalId=professionals.some((item)=>item.id===selectedProfessionalId)?selectedProfessionalId:(professionals[0]?.id??"");
  const professional=professionals.find((item)=>item.id===professionalId);
  const professionalBlocks=blocks.filter((item)=>item.professionalId===professionalId);
  const saveSchedule=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!professionalId)return;setSavingSchedule(true);setError("");setMessage("");
    const form=new FormData(event.currentTarget);const days=weekdays.map((day)=>({weekday:day.value,active:form.get(`active-${day.value}`)==="on",startTime:String(form.get(`start-${day.value}`)??""),endTime:String(form.get(`end-${day.value}`)??"")}));
    try{
      const response=await fetch("/api/admin/time-blocks",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({professionalId,days})});
      const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos guardar el horario semanal"));
      const updated=Array.isArray(data.hours)?data.hours.filter(isBusinessHour):[];
      setHours((items)=>[...items.filter((item)=>item.professionalId!==professionalId),...updated]);setMessage("Horario semanal actualizado y aplicado a la disponibilidad.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos guardar el horario semanal")}finally{setSavingSchedule(false)}
  };
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!professionalId)return;setSaving(true);setError("");setMessage("");
    const form=event.currentTarget;const payload=Object.fromEntries(new FormData(form).entries());
    try{
      const response=await fetch("/api/admin/time-blocks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,professionalId})});
      const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos crear el bloqueo"));
      if(!isTimeBlock(data.block))throw new Error("El bloqueo guardado no es válido.");
      const block=data.block;
      setBlocks((items)=>[...items,block].sort((a,b)=>`${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
      form.reset();setMessage("Bloqueo guardado y aplicado a la disponibilidad.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos crear el bloqueo")}finally{setSaving(false)}
  };
  const remove=async(block:TimeBlock)=>{
    if(!window.confirm(`¿Eliminar el bloqueo del ${formatShortDate(block.date)} a las ${block.startTime}?`))return;
    setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/time-blocks",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:block.id})});
      const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos eliminar el bloqueo"));
      setBlocks((items)=>items.filter((item)=>item.id!==block.id));setMessage("Bloqueo eliminado. El horario vuelve a estar disponible.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos eliminar el bloqueo")}
  };

  if(!professionals.length)return <div className="panel"><EmptyState text="Agrega un profesional para configurar horarios."/></div>;
  return <div className="schedule-layout">
    <section className="panel"><div className="schedule-person"><div className="person-initial">{initials(professional?.name??"")}</div><div><strong>{professional?.name}</strong><p>Horario semanal guardado en Corteza</p></div><select className="schedule-professional-select" aria-label="Seleccionar profesional" value={professionalId} onChange={(event)=>{setProfessionalId(event.target.value);setError("");setMessage("")}}>{professionals.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
      {loading?<div className="loading-line"/>:<form className="weekly-schedule-form" onSubmit={saveSchedule} key={professionalId}>{weekdays.map((day)=>{const value=hours.find((item)=>item.professionalId===professionalId&&item.weekday===day.value);const active=Boolean(value?.active);return <div className="schedule-row editable" key={day.value}><strong>{day.label}</strong><label className="schedule-toggle" title={active?"Disponible":"Descanso"}><input name={`active-${day.value}`} type="checkbox" defaultChecked={active} disabled={!canManageSchedule}/><span/></label><div className="hours schedule-hours"><input aria-label={`Inicio ${day.label}`} name={`start-${day.value}`} type="time" defaultValue={value?.startTime??"09:00"} disabled={!canManageSchedule}/><i>—</i><input aria-label={`Fin ${day.label}`} name={`end-${day.value}`} type="time" defaultValue={value?.endTime??"19:00"} disabled={!canManageSchedule}/></div></div>})}{canManageSchedule?<button className="primary schedule-save" disabled={savingSchedule}>{savingSchedule?"Guardando...":"Guardar horario semanal"}</button>:<p className="block-readonly">Tu rol permite consultar el horario, pero no modificarlo.</p>}</form>}
    </section>
    <section className="panel blocks-panel"><PanelTitle title="Bloqueos de agenda" subtitle="Ausencias, descansos y compromisos del profesional"/>
      {canManage&&<form className="block-form" onSubmit={submit}><label className="wide">Fecha<input name="date" type="date" min={today} required/></label><label>Desde<input name="startTime" type="time" required/></label><label>Hasta<input name="endTime" type="time" required/></label><label className="wide">Motivo opcional<input name="reason" maxLength={160} placeholder="Ej. Almuerzo, diligencia o capacitación"/></label><button className="primary wide" disabled={saving||!professionalId}><CalendarOff size={16}/>{saving?"Guardando...":"Agregar bloqueo"}</button></form>}
      {!canManage&&!loading&&<p className="block-readonly">Tu rol permite consultar los bloqueos, pero no modificarlos.</p>}
      {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success">{message}</p>}
      <div className="block-list">{professionalBlocks.length?professionalBlocks.map((block)=><div className="block-row" key={block.id}><div className="activity-icon warn"><CalendarOff/></div><div><strong>{block.reason||"Tiempo bloqueado"}</strong><p>{formatShortDate(block.date)} · {block.startTime} — {block.endTime}</p></div>{canManage&&<button className="ghost-icon" aria-label={`Eliminar bloqueo de ${block.startTime}`} onClick={()=>void remove(block)}><Trash2 size={16}/></button>}</div>):!loading&&<EmptyState text="No hay bloqueos futuros para este profesional."/>}</div>
    </section>
  </div>
}

function Reports({appointments}:{appointments:Appointment[]}){const completed=appointments.filter((item)=>item.status==="completada");const total=appointments.reduce((sum,item)=>sum+item.paidCents,0);const unique=new Set(appointments.map((item)=>item.email??item.phone)).size;const byService=Array.from(appointments.reduce((map,item)=>map.set(item.serviceName,(map.get(item.serviceName)??0)+item.paidCents),new Map<string,number>()).entries()).sort((a,b)=>b[1]-a[1]);return <><section className="metric-grid three"><Metric icon={<CircleDollarSign/>} tone="olive" label="Cobros registrados" value={`$${(total/100).toFixed(2)}`} trend="Pagos persistentes"/><Metric icon={<CalendarDays/>} tone="terracotta" label="Citas completadas" value={String(completed.length)} trend={`${appointments.length} citas totales`}/><Metric icon={<UsersRound/>} tone="ink" label="Clientes únicos" value={String(unique)} trend="Según la agenda"/></section><div className="dashboard-grid"><div className="panel revenue-panel"><PanelTitle title="Distribución por servicio" subtitle="Cobros por servicio"/><div className="chart tall-chart">{byService.length?byService.map(([name,value],index)=><div className="bar-wrap" key={name} title={name}><div className={`bar ${index===0?"hot":""}`} style={{height:`${Math.max(8,value/Math.max(1,byService[0][1])*100)}%`}}/><span>{name.slice(0,1)}</span></div>):<EmptyState text="Registra cobros para ver el reporte."/>}</div></div><div className="panel"><PanelTitle title="Rendimiento" subtitle="Estados de la agenda"/>{["programada","confirmada","en_progreso","completada","cancelada","no_asistio"].map((state)=><div className="service-progress" key={state}><div><strong>{statusLabel(state)}</strong><span>{appointments.filter((item)=>item.status===state).length}</span></div><div><i style={{width:`${appointments.length?appointments.filter((item)=>item.status===state).length/appointments.length*100:0}%`}}/></div></div>)}</div></div></>}

function FeatureSection({section}:{section:string}){
  if (section === "usuarios") return <MembersPanel/>;
  if (section === "seguridad") return <><SecurityCenter/><BackupLink/></>;
  if (section === "plan") return <BillingPanel/>;
  const content:Record<string,[string,string,string[]]>= {
    estaciones:["Estaciones y recursos","Evita reservas dobles cuando compartes sillas o equipos",["Silla principal","Lavacabezas","Sala privada"]],
    marketing:["Automatiza tu comunicación","Confirma citas, recupera clientes y lanza promociones",["Recordatorio 24 horas antes","Confirmación por WhatsApp","Campaña de clientes inactivos"]],
    fidelizacion:["Programa de puntos","Premia a quienes vuelven y aumenta la recurrencia",["1 punto por cada $1","20 puntos de bienvenida","Recompensa a los 100 puntos"]],
    configuracion:["Preferencias del negocio","Todo lo que necesita tu operación diaria",["Datos e identidad","Reservas y cancelaciones","Pagos y facturación","WhatsApp e imágenes"]],
  };
  const [h,p,items]=content[section]??["Módulo","Configuración disponible",[]];
  return <div className="feature-layout"><div className="feature-hero"><span className="eyebrow">Configuración</span><h2>{h}</h2><p>{p}</p></div><div className="panel option-list">{items.map((x,i)=><div className="option-row" key={x}><span>{i+1}</span><strong>{x}</strong><ArrowUpRight/></div>)}</div></div>
}

type Member = { id:string; email:string; displayName:string; role:string; status:string; createdAt:string; lastSeenAt:string|null };

function BillingPanel(){
  const [data,setData]=useState<{plans:Record<string,unknown>[];subscription:Record<string,unknown>|null}>({plans:[],subscription:null}); const [error,setError]=useState(""); const [saving,setSaving]=useState(false); const [notice,setNotice]=useState("");
  const load=()=>fetch("/api/admin/billing").then(async response=>{const body=await readJsonObject(response);if(!response.ok)throw new Error(apiError(body,"No se pudo cargar el plan"));setData({plans:Array.isArray(body.plans)?body.plans:[],subscription:isJsonObject(body.subscription)?body.subscription:null})}).catch(reason=>setError(reason instanceof Error?reason.message:"No se pudo cargar el plan"));
  useEffect(()=>{void load()},[]);
  const choose=async(planId:string)=>{setSaving(true);setError("");try{const response=await fetch("/api/admin/billing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planId})});const body=await readJsonObject(response);if(!response.ok)throw new Error(apiError(body,"No se pudo actualizar el plan"));setNotice("Plan actualizado correctamente.");await load()}catch(reason){setError(reason instanceof Error?reason.message:"No se pudo actualizar el plan")}finally{setSaving(false)}};
  return <div className="feature-layout">{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-success">{notice}</p>}<section className="panel plan-summary"><div><span className="eyebrow">Suscripción actual</span><h2>{String(data.subscription?.planName??"Gratis")}</h2><p>Estado: {String(data.subscription?.status??"trialing")} · renovación {String(data.subscription?.currentPeriodEnd??"—").slice(0,10)}</p></div><WalletCards size={24}/></section><div className="plan-grid">{data.plans.map(plan=><article className={`panel plan-card ${String(plan.id)===String(data.subscription?.planId)?"selected":""}`} key={String(plan.id)}><span className="eyebrow">{String(plan.name)}</span><strong>{Number(plan.monthlyPriceCents)===0?"Gratis":moneyCents(Number(plan.monthlyPriceCents))}<small>/mes</small></strong><p>{String(plan.description)}</p><small>{String(plan.maxProfessionals)} miembros · {String(plan.maxAppointments)} citas/mes</small><button className="primary" disabled={saving||String(plan.id)===String(data.subscription?.planId)} onClick={()=>void choose(String(plan.id))}>{String(plan.id)===String(data.subscription?.planId)?"Plan actual":"Elegir plan"}</button></article>)}</div></div>;
}

function BackupLink(){return <section className="panel" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginTop:14}}><div><strong>Copias de seguridad</strong><p>Descarga un respaldo JSON de este negocio. No incluye contraseñas ni sesiones.</p></div><a className="secondary" href="/api/admin/backup" download>Descargar respaldo</a></section>}

function MembersPanel(){
  const [members,setMembers]=useState<Member[]>([]); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const load=()=>fetch("/api/admin/members").then(async r=>{const data=await readJsonObject(r);if(!r.ok)throw new Error(apiError(data,"No se pudo cargar el equipo"));const nextMembers=Array.isArray(data.members)?data.members.filter(isMember):[];setMembers(nextMembers)}).catch(err=>setError(err instanceof Error?err.message:"No se pudo cargar el equipo"));
  useEffect(()=>{void load()},[]);
  const invite=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setError("");const form=new FormData(e.currentTarget);const r=await fetch("/api/admin/members",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(form.entries()))});const data=await readJsonObject(r);if(!r.ok){setError(apiError(data,"No se pudo crear el acceso"));return}e.currentTarget.reset();setNotice("Acceso creado. Comparte la contraseña temporal de forma privada.");void load()};
  return <div className="security-layout"><section className="panel security-card"><PanelTitle title="Equipo con acceso" subtitle="Principio de mínimo privilegio"/>{members.map(member=><div className="member-row" key={member.id}><div className="person-initial">{initials(member.displayName||member.email)}</div><div><strong>{member.displayName||member.email}</strong><p>{member.email}</p></div><span className={`status ${member.status==="active"?"confirmada":"programada"}`}>{member.status}</span><b>{roleLabel(member.role)}</b></div>)}{!members.length&&!error&&<EmptyState text="No hay miembros para mostrar."/>}</section><section className="panel security-card"><PanelTitle title="Crear acceso" subtitle="Credenciales propias de Corteza"/><form className="invite-form" onSubmit={invite}><label>Nombre<input name="displayName" maxLength={100} required placeholder="Nombre del miembro"/></label><label>Email<input name="email" type="email" required maxLength={254} placeholder="persona@empresa.com"/></label><label>Contraseña temporal<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Mínimo 10 caracteres"/></label><label>Rol<select name="role" defaultValue="reception"><option value="reception">Recepción</option><option value="professional">Profesional</option><option value="admin">Administrador</option></select></label>{error&&<p className="form-error">{error}</p>}{notice&&<p className="form-success">{notice}</p>}<button className="primary">Crear acceso seguro</button></form></section></div>
}

function roleLabel(role:string){return ({owner:"Propietario",admin:"Administrador",reception:"Recepción",professional:"Profesional"} as Record<string,string>)[role]??role}
function moneyCents(cents:number){return new Intl.NumberFormat("es-VE",{style:"currency",currency:"USD"}).format(cents/100)}

function isMember(value:unknown):value is Member{return isJsonObject(value)&&typeof value.id==="string"&&typeof value.email==="string"&&typeof value.displayName==="string"&&typeof value.role==="string"&&typeof value.status==="string"&&typeof value.createdAt==="string"&&(typeof value.lastSeenAt==="string"||value.lastSeenAt===null)}

type SecurityData={posture:Record<string,string>;members:{total:number;active:number;pending:number;suspended:number};events:{id:string;actorEmail:string|null;action:string;entityType:string;createdAt:string}[]};

function SecurityCenter(){
  const [data,setData]=useState<SecurityData|null>(null); const [error,setError]=useState("");
  useEffect(()=>{fetch("/api/admin/security").then(async r=>{const body=await readJsonObject(r);if(!r.ok)throw new Error(apiError(body,"No se pudo cargar el estado"));if(!isSecurityData(body))throw new Error("El estado de seguridad recibido no es válido.");setData(body)}).catch(err=>setError(err instanceof Error?err.message:"No se pudo cargar el estado"))},[]);
  const controls=[["Credenciales propias","Contraseñas seguras y sesiones revocables"],["Aislamiento por negocio","Cada consulta queda limitada al negocio"],["Roles en servidor","Los permisos no dependen de botones ocultos"],["Protección CSRF","Las mutaciones exigen mismo origen"],["Rate limiting","Frena abuso en reservas y administración"],["Auditoría","Registra cambios sensibles"],["Cabeceras seguras","CSP, HSTS y bloqueo de iframes"],["Bloqueo atómico de agenda","Evita reservas simultáneas solapadas"]];
  return <div className="security-stack"><section className="security-summary"><div><ShieldCheck size={28}/><span>Postura actual</span><strong>{error?"Revisión requerida":"Protección activa"}</strong><p>Defensa en profundidad aplicada al panel, APIs y agenda.</p></div><div className="security-score"><strong>{error?"—":"8/8"}</strong><span>controles base</span></div></section><section className="security-controls">{controls.map(([title,description])=><div className="panel control-card" key={title}><CheckCircle2/><div><strong>{title}</strong><p>{description}</p></div><span>Activo</span></div>)}</section><section className="panel audit-panel"><PanelTitle title="Actividad de seguridad" subtitle="Eventos sensibles más recientes"/>{data?.events?.length?data.events.map(event=><div className="audit-row" key={event.id}><span className="activity-icon neutral"><ShieldCheck/></span><div><strong>{auditLabel(event.action)}</strong><p>{event.actorEmail??"Reserva pública"} · {event.entityType}</p></div><time>{new Date(event.createdAt).toLocaleString("es-VE")}</time></div>):<EmptyState text={error||"Todavía no hay eventos de auditoría."}/>}</section></div>
}

function auditLabel(action:string){return ({"auth.login":"Inicio de sesión","auth.logout":"Cierre de sesión","auth.password_changed":"Contraseña actualizada","appointment.created":"Cita creada","appointment.updated":"Cita editada o reprogramada","appointment.status_updated":"Estado de cita actualizado","recurring_series.created":"Serie recurrente creada","recurring_series.updated":"Serie recurrente actualizada","recurring_series.cancelled":"Serie recurrente cancelada","client.created":"Cliente creado","client.updated":"Cliente actualizado","client.deleted":"Cliente eliminado","service.created":"Servicio creado","service.updated":"Servicio actualizado","service.deleted":"Servicio eliminado","professional.created":"Profesional creado","professional.updated":"Profesional actualizado","professional.deleted":"Profesional eliminado","schedule.hours_updated":"Horario semanal actualizado","schedule.block_created":"Bloqueo de agenda creado","schedule.block_deleted":"Bloqueo de agenda eliminado","member.invited":"Acceso de miembro creado","cash.opened":"Caja abierta","cash.closed":"Caja cerrada","payment.recorded":"Cobro registrado","payment.voided":"Cobro anulado","member.access_updated":"Permisos actualizados"} as Record<string,string>)[action]??action}

function isSecurityData(value:unknown):value is SecurityData{if(!isJsonObject(value)||!isJsonObject(value.posture)||!isJsonObject(value.members)||!Array.isArray(value.events))return false;const members=value.members;return ["total","active","pending","suspended"].every((key)=>typeof members[key]==="number")&&value.events.every((event)=>isJsonObject(event)&&typeof event.id==="string"&&(typeof event.actorEmail==="string"||event.actorEmail===null)&&typeof event.action==="string"&&typeof event.entityType==="string"&&typeof event.createdAt==="string")}

function RecurringSeriesModal({series,catalog,onClose,onSaved}:{series:RecurringSeries|null;catalog:Catalog;onClose:()=>void;onSaved:(message:string)=>Promise<void>}){
  const today=dateInTimeZone(catalog.business.timezone);const initialStart=series?.nextDate&&series.nextDate>=today?series.nextDate:today;
  const initialServiceId=series?.serviceId??catalog.services[0]?.id??"";const initialProfessionals=professionalsForService(catalog,initialServiceId);
  const [serviceId,setServiceId]=useState(initialServiceId);const [professionalId,setProfessionalId]=useState(series?.professionalId??initialProfessionals[0]?.id??"");
  const [frequency,setFrequency]=useState(series?.frequency??"weekly");const [startDate,setStartDate]=useState(initialStart);
  const [endDate,setEndDate]=useState(series&&series.endDate>=initialStart?series.endDate:addDays(initialStart,56));const [time,setTime]=useState(series?.time??"09:00");
  const [saving,setSaving]=useState(false);const [error,setError]=useState("");const eligibleProfessionals=professionalsForService(catalog,serviceId);
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError("");const form=new FormData(event.currentTarget);const payload={...Object.fromEntries(form.entries()),id:series?.id,serviceId,professionalId,frequency,startDate,endDate,time};try{const response=await fetch("/api/admin/recurring-appointments",{method:series?"PUT":"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify(payload)});const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos guardar la serie"));const createdCount=typeof data.createdCount==="number"?data.createdCount:0;const skipped=Array.isArray(data.skipped)?data.skipped.length:0;await onSaved(`${series?"Serie actualizada":"Serie creada"} · ${createdCount} citas${skipped?` · ${skipped} fechas omitidas`:""}`)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos guardar la serie");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal recurring-modal" role="dialog" aria-modal="true" aria-labelledby="recurring-title"><div className="modal-head"><div><span className="eyebrow">Agenda automática</span><h2 id="recurring-title">{series?"Editar citas futuras":"Nueva cita recurrente"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Cliente<input name="name" required maxLength={100} autoComplete="name" defaultValue={series?.clientName??""} placeholder="Nombre completo"/></label><label>Teléfono<input name="phone" required maxLength={25} autoComplete="tel" defaultValue={series?.phone??""} placeholder="+58 412 000 0000"/></label><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={series?.email??""} placeholder="cliente@email.com"/></label><label>Servicio<select value={serviceId} onChange={(event)=>{const next=event.target.value;const professionals=professionalsForService(catalog,next);setServiceId(next);setProfessionalId(professionals[0]?.id??"")}}>{catalog.services.map((item)=><option value={item.id} key={item.id}>{item.name} · ${(item.priceCents/100).toFixed(2)}</option>)}</select></label><label>Profesional<select value={professionalId} onChange={(event)=>setProfessionalId(event.target.value)} required>{eligibleProfessionals.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Frecuencia<select value={frequency} onChange={(event)=>setFrequency(event.target.value)}><option value="weekly">Semanal</option><option value="biweekly">Cada 2 semanas</option><option value="monthly">Mensual</option></select></label><label>Hora<input type="time" step="900" value={time} onChange={(event)=>setTime(event.target.value)} required/></label><label>Fecha inicial<input type="date" min={today} value={startDate} onChange={(event)=>{const next=event.target.value;setStartDate(next);if(endDate<next)setEndDate(next)}} required/></label><label>Fecha final<input type="date" min={startDate} value={endDate} onChange={(event)=>setEndDate(event.target.value)} required/></label><label className="wide">Notas<textarea name="notes" maxLength={500} defaultValue={series?.notes??""} placeholder="Preferencias para todas las citas..."/></label></div><p className="recurring-form-note"><CalendarDays size={15}/>{series?"Se reemplazarán únicamente las citas programadas o confirmadas desde la fecha inicial.":"Las fechas cerradas, bloqueadas u ocupadas se omitirán y se informarán al terminar."}</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!professionalId}>{saving?"Guardando serie...":series?"Actualizar futuras":"Crear serie"}</button></div></form></div></div>;
}

function AppointmentEditModal({appointment,catalog,onClose,onSave}:{appointment:Appointment;catalog:Catalog;onClose:()=>void;onSave:(appointment:Appointment,changes:AppointmentChanges)=>Promise<Appointment>}){
  const today=dateInTimeZone(catalog.business.timezone);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const [serviceId,setServiceId]=useState(appointment.serviceId);const [professionalId,setProfessionalId]=useState(appointment.professionalId);const [date,setDate]=useState(appointment.date);const [time,setTime]=useState(appointment.time);const [times,setTimes]=useState<string[]>([appointment.time]);const [loadingTimes,setLoadingTimes]=useState(true);
  const eligibleProfessionals=professionalsForService(catalog,serviceId);const currentProfessional=catalog.professionals.find((item)=>item.id===appointment.professionalId);const professionalOptions=serviceId===appointment.serviceId&&currentProfessional&&!eligibleProfessionals.some((item)=>item.id===currentProfessional.id)?[currentProfessional,...eligibleProfessionals]:eligibleProfessionals;
  useEffect(()=>{
    if(!serviceId||!professionalId||!date)return;
    const controller=new AbortController();
    const query=new URLSearchParams({serviceId,professionalId,date,appointmentId:appointment.id});
    fetch(`/api/admin/availability?${query}`,{credentials:"same-origin",signal:controller.signal}).then(async(response)=>{const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos consultar la agenda"));const available=stringArray(data.times);setTimes(available);setTime((current)=>available.includes(current)?current:(available[0]??""))}).catch((reason)=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;setTimes([]);setTime("");setError(reason instanceof Error?reason.message:"No pudimos consultar la agenda")}).finally(()=>{if(!controller.signal.aborted)setLoadingTimes(false)});
    return()=>controller.abort();
  },[appointment.id,date,professionalId,serviceId]);
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!time)return;setSaving(true);setError("");const payload=Object.fromEntries(new FormData(event.currentTarget).entries());try{await onSave(appointment,{clientName:String(payload.name),phone:String(payload.phone),email:String(payload.email),notes:String(payload.notes??""),serviceId,professionalId,date,time});onClose()}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos actualizar la cita");setSaving(false)}};
  const refreshTimes=()=>{setLoadingTimes(true);setError("")};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-appointment-title"><div className="modal-head"><div><span className="eyebrow">{appointment.recurringSeriesId?"Cita recurrente · edición individual":"Edición protegida"}</span><h2 id="edit-appointment-title">Editar cita</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre del cliente<input name="name" required maxLength={100} autoComplete="name" defaultValue={appointment.clientName}/></label><label>Teléfono<input name="phone" required maxLength={25} autoComplete="tel" defaultValue={appointment.phone}/></label><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={appointment.email}/></label><label>Servicio<select value={serviceId} onChange={(event)=>{const nextService=event.target.value;const nextProfessionals=professionalsForService(catalog,nextService);refreshTimes();setServiceId(nextService);setProfessionalId(nextProfessionals[0]?.id??"")}}>{catalog.services.map((item)=><option value={item.id} key={item.id}>{item.name} · ${(item.priceCents/100).toFixed(2)}</option>)}</select></label><label>Profesional<select value={professionalId} onChange={(event)=>{refreshTimes();setProfessionalId(event.target.value)}}>{professionalOptions.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Fecha<input type="date" min={today} value={date} onChange={(event)=>{refreshTimes();setDate(event.target.value)}} required/></label><label>Hora<select value={time} onChange={(event)=>setTime(event.target.value)} required disabled={loadingTimes||!times.length}><option value="">{loadingTimes?"Consultando...":"Selecciona"}</option>{times.map((value)=><option value={value} key={value}>{value}</option>)}</select></label><label className="wide">Notas<textarea name="notes" maxLength={500} defaultValue={appointment.notes} placeholder="Preferencias, observaciones..."/></label></div>{appointment.recurringSeriesId&&<p className="recurring-form-note"><CalendarDays size={15}/>Este cambio afecta solo esta cita. Usa “Series recurrentes” para cambiar las futuras.</p>}{!loadingTimes&&!times.length&&<p className="availability-note">No quedan horarios disponibles para esta fecha.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Volver</button><button className="primary" disabled={saving||loadingTimes||!time}>{saving?"Guardando...":"Guardar cambios"}</button></div></form></div></div>;
}

function AppointmentModal({catalog,onClose,onCreated}:{catalog:Catalog;onClose:()=>void;onCreated:(a:Appointment)=>void}){
  const today=dateInTimeZone(catalog.business.timezone); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const initialServiceId=catalog.services[0]?.id??"";const [serviceId,setServiceId]=useState(initialServiceId);const [professionalId,setProfessionalId]=useState(professionalsForService(catalog,initialServiceId)[0]?.id??"");const [date,setDate]=useState(today);const [time,setTime]=useState("");const [times,setTimes]=useState<string[]>([]);const [loadingTimes,setLoadingTimes]=useState(true);
  useEffect(()=>{if(!serviceId||!professionalId||!date)return;fetch(`/api/public/availability?slug=${encodeURIComponent(catalog.business.slug)}&serviceId=${encodeURIComponent(serviceId)}&professionalId=${encodeURIComponent(professionalId)}&date=${date}`).then(async(response)=>{const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos consultar la agenda"));const available=stringArray(data.times);setTimes(available);setTime((current)=>available.includes(current)?current:(available[0]??""));}).catch((reason)=>{setTimes([]);setTime("");setError(reason instanceof Error?reason.message:"No pudimos consultar la agenda")}).finally(()=>setLoadingTimes(false))},[catalog.business.slug,date,professionalId,serviceId]);
  const service=catalog.services.find((item)=>item.id===serviceId);const eligibleProfessionals=professionalsForService(catalog,serviceId);const professional=eligibleProfessionals.find((item)=>item.id===professionalId);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!service||!professional||!time)return;setSaving(true);setError("");const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f.entries());try{const r=await fetch("/api/admin/appointments",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({...payload,serviceId,professionalId,date,time})});const data=await readJsonObject(r);if(!r.ok)throw new Error(apiError(data,"No se pudo guardar"));if(typeof data.id!=="string")throw new Error("La cita se guardó sin un identificador válido.");onCreated({id:data.id,clientId:typeof data.clientId==="string"?data.clientId:"",date,time,endTime:addMinutes(time,service.durationMinutes),status:"programada",source:"panel",totalCents:service.priceCents,paidCents:0,paymentStatus:"pendiente",clientName:String(payload.name),phone:String(payload.phone),email:String(payload.email),notes:String(payload.notes??""),cancellationReason:"",serviceId:service.id,serviceName:service.name,professionalId:professional.id,professionalName:professional.name,recurringSeriesId:null,occurrenceNumber:null});}catch(err){setError(err instanceof Error?err.message:"No se pudo guardar");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose()}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title"><div className="modal-head"><div><span className="eyebrow">Agenda en tiempo real</span><h2 id="appointment-title">Nueva cita</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre del cliente<input name="name" required maxLength={100} autoComplete="name" placeholder="Nombre completo"/></label><label>Teléfono<input name="phone" required maxLength={25} autoComplete="tel" placeholder="+58 412 000 0000"/></label><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="cliente@email.com"/></label><label>Servicio<select value={serviceId} onChange={(event)=>{const nextService=event.target.value;setLoadingTimes(true);setServiceId(nextService);setProfessionalId(professionalsForService(catalog,nextService)[0]?.id??"")}}>{catalog.services.map((item)=><option value={item.id} key={item.id}>{item.name} · ${(item.priceCents/100).toFixed(2)}</option>)}</select></label><label>Profesional<select value={professionalId} onChange={(event)=>{setLoadingTimes(true);setProfessionalId(event.target.value)}}>{eligibleProfessionals.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Fecha<input type="date" min={today} value={date} onChange={(event)=>{setLoadingTimes(true);setDate(event.target.value)}} required/></label><label>Hora<select value={time} onChange={(event)=>setTime(event.target.value)} required disabled={loadingTimes||!times.length}><option value="">{loadingTimes?"Consultando...":"Selecciona"}</option>{times.map((value)=><option key={value}>{value}</option>)}</select></label><label className="wide">Notas<textarea name="notes" maxLength={500} placeholder="Preferencias, observaciones..."/></label></div>{!loadingTimes&&!times.length&&<p className="availability-note">No quedan horarios disponibles para esta fecha.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!time}>{saving?"Guardando...":"Crear cita"}</button></div></form></div></div>
}

function formatShortDate(value:string){return new Intl.DateTimeFormat("es-VE",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`))}
function frequencyLabel(value:string){return ({weekly:"Semanal",biweekly:"Cada 2 semanas",monthly:"Mensual"} as Record<string,string>)[value]??value}
function addDays(value:string,days:number){const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function addMinutes(value:string,minutes:number){const [hours,currentMinutes]=value.split(":").map(Number);const total=hours*60+currentMinutes+minutes;return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`}
function statusLabel(value:string){return ({programada:"Programada",confirmada:"Confirmada",en_progreso:"En progreso",completada:"Completada",cancelada:"Cancelada",no_asistio:"No asistió"} as Record<string,string>)[value]??value}
function paymentStatusFor(totalCents:number,paidCents:number){return paidCents<=0?"pendiente":paidCents<totalCents?"parcial":"pagado"}
function statusOptions(value:string){const transitions:Record<string,string[]>={programada:["programada","confirmada","cancelada","no_asistio"],confirmada:["confirmada","en_progreso","cancelada","no_asistio"],en_progreso:["en_progreso","completada","cancelada"]};return transitions[value]??[value]}
