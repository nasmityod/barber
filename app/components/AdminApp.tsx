"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiError, isJsonObject, readJsonObject, stringArray } from "./api-json";
import {
  BarChart3, Bell, CalendarDays, ChevronDown, CircleDollarSign, Clock3, Copy,
  LayoutDashboard, Menu, Plus, Scissors, Search, Settings, Sparkles,
  Star, UserRound, UsersRound, WalletCards, X, CheckCircle2, TrendingUp,
  Armchair, Megaphone, ShieldCheck, ReceiptText, ArrowUpRight, MoreHorizontal, LogOut,
} from "lucide-react";

type Appointment = {
  id: string; date: string; time: string; endTime: string; status: string; source: string;
  totalCents: number; clientName: string; phone: string; email?: string; serviceName: string; professionalName: string;
};

type Service = { id:string; name:string; category:string; durationMinutes:number; priceCents:number; active?:number };
type Professional = { id:string; name:string; specialty:string; active?:number };
type Catalog = { business:{name:string;slug:string;timezone:string;currency:string};services:Service[];professionals:Professional[] };

function isAppointment(value: unknown): value is Appointment {
  if (!isJsonObject(value)) return false;
  return ["id", "date", "time", "endTime", "status", "source", "clientName", "phone", "serviceName", "professionalName"]
    .every((key) => typeof value[key] === "string") && typeof value.totalCents === "number";
}

function isService(value: unknown): value is Service {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.category === "string" && typeof value.durationMinutes === "number" && typeof value.priceCents === "number";
}

function isProfessional(value: unknown): value is Professional {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.specialty === "string";
}

function isCatalog(value: unknown): value is Catalog {
  if (!isJsonObject(value) || !isJsonObject(value.business)) return false;
  const { business } = value;
  return ["name", "slug", "timezone", "currency"].every((key) => typeof business[key] === "string") &&
    Array.isArray(value.services) && value.services.every(isService) &&
    Array.isArray(value.professionals) && value.professionals.every(isProfessional);
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
    ["fidelizacion", "Fidelización", Star],
  ]},
  { label: "Sistema", items: [
    ["configuracion", "Configuración", Settings], ["usuarios", "Usuarios y roles", UsersRound],
    ["seguridad", "Centro de seguridad", ShieldCheck],
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
  usuarios: ["Usuarios y roles", "Accesos seguros para tu equipo"],
  seguridad: ["Centro de seguridad", "Identidad, permisos, auditoría y protección activa"],
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

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/appointments", { credentials: "same-origin" }),
      fetch(`/api/public/catalog?slug=${encodeURIComponent(identity.businessSlug)}`),
    ]).then(async ([appointmentsResponse, catalogResponse]) => {
      const appointmentsData = await readJsonObject(appointmentsResponse);
      const catalogData = await readJsonObject(catalogResponse);
      if (!appointmentsResponse.ok) throw new Error(apiError(appointmentsData, "No pudimos cargar las citas"));
      if (!catalogResponse.ok) throw new Error(apiError(catalogData, "No pudimos cargar el catálogo"));
      const nextAppointments = Array.isArray(appointmentsData.appointments)
        ? appointmentsData.appointments.filter(isAppointment)
        : [];
      if (!isCatalog(catalogData)) throw new Error("El catálogo recibido no es válido.");
      setAppointments(nextAppointments);
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

  return (
    <div className="admin-shell">
      {mobileOpen && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Scissors size={20} /></div><div><strong>CORTEZA</strong><span>studio manager</span></div></div>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        <div className="workspace"><div className="avatar">{identity.businessName.slice(0, 2).toUpperCase()}</div><div><strong>{identity.businessName}</strong><span>Espacio protegido</span></div><ChevronDown size={16} /></div>
        <nav>
          {nav.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>
            {group.items.map(([slug, label, Icon]) => <a className={active === slug ? "active" : ""} href={`/${slug}`} key={slug} onClick={() => setMobileOpen(false)}><Icon size={18} /><span>{label}</span>{slug === "citas" && <em>3</em>}</a>)}
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
          <div className="page-heading"><div><p className="eyebrow">{identity.businessName}</p><h1>{title}</h1><p>{displaySubtitle}</p></div><div className="heading-actions"><button className="secondary" onClick={copyLink}><Copy size={16} /> Link de reservas</button><button className="primary" onClick={() => setModalOpen(true)} disabled={!catalog}><Plus size={17} /> Nueva cita</button></div></div>
          {loading && <div className="loading-line" />}
          {loadError && <p className="form-error" role="alert">{loadError}</p>}
          {active === "dashboard" ? <Dashboard appointments={appointments} timezone={identity.timezone} /> : <ModuleView section={active} appointments={appointments} catalog={catalog} onNew={() => setModalOpen(true)} onStatus={async(id,status)=>{
            const response=await fetch("/api/admin/appointments",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});
            const data=await readJsonObject(response); if(!response.ok){setNotice(apiError(data,"No pudimos actualizar la cita"));return}
            setAppointments((items)=>items.map((item)=>item.id===id?{...item,status}:item));setNotice("Estado actualizado");setTimeout(()=>setNotice(""),2200);
          }} />}
        </div>
      </main>
      {modalOpen && catalog && <AppointmentModal catalog={catalog} onClose={() => setModalOpen(false)} onCreated={(appointment) => { setAppointments((old) => [...old, appointment]); setModalOpen(false); setNotice("Cita creada correctamente"); setTimeout(() => setNotice(""), 2500); }} />}
      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}</div>}
    </div>
  );
}

function Dashboard({ appointments, timezone }: { appointments: Appointment[]; timezone: string }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayAppointments = appointments.filter((appointment) => appointment.date === today);
  const todayRevenue = todayAppointments.filter((appointment) => appointment.status === "completada").reduce((sum, appointment) => sum + appointment.totalCents, 0);
  const clientCount = new Set(appointments.map((appointment) => appointment.email ?? appointment.phone)).size;
  const days = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(); value.setDate(value.getDate() - (6 - index));
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  });
  const revenue = days.map((date) => appointments.filter((item) => item.date === date && item.status === "completada").reduce((sum, item) => sum + item.totalCents, 0));
  const revenueMax = Math.max(...revenue, 1);
  const popular = Array.from(appointments.reduce((map, item) => map.set(item.serviceName, (map.get(item.serviceName) ?? 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const future = appointments.filter((item) => item.date >= today && !["cancelada", "no_asistio"].includes(item.status)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return <>
    <section className="metric-grid">
      <Metric icon={<CalendarDays />} tone="terracotta" label="Citas de hoy" value={String(todayAppointments.length)} trend="Datos reales de agenda" />
      <Metric icon={<CircleDollarSign />} tone="olive" label="Ingresos completados" value={`$${(todayRevenue / 100).toFixed(2)}`} trend="Solo citas completadas" />
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

function ModuleView({ section, appointments, catalog, onNew, onStatus }: { section: string; appointments: Appointment[]; catalog: Catalog|null; onNew: () => void; onStatus:(id:string,status:string)=>Promise<void> }) {
  if (section === "agenda") return <Agenda appointments={appointments} />;
  if (section === "citas") return <Appointments appointments={appointments} onNew={onNew} onStatus={onStatus} />;
  if (section === "clientes") return <Clients appointments={appointments} />;
  if (section === "caja") return <Cash appointments={appointments} />;
  if (section === "servicios") return <Services services={catalog?.services??[]} />;
  if (section === "equipo") return <Team professionals={catalog?.professionals??[]} appointments={appointments} />;
  if (section === "horarios") return <Schedules professionals={catalog?.professionals??[]} />;
  if (section === "reportes") return <Reports appointments={appointments} />;
  return <FeatureSection section={section} />;
}

function Agenda({appointments}:{appointments:Appointment[]}) {
  const now=new Date(); const monday=new Date(now); const weekday=(now.getDay()+6)%7; monday.setDate(now.getDate()-weekday);
  const days=Array.from({length:7},(_,index)=>{const value=new Date(monday);value.setDate(monday.getDate()+index);return{iso:value.toISOString().slice(0,10),label:new Intl.DateTimeFormat("es-VE",{weekday:"short",day:"numeric"}).format(value)}});
  const hours=["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
  const today=new Date().toISOString().slice(0,10);
  return <div className="panel agenda-panel"><div className="agenda-toolbar"><div><button className="secondary compact">Semana actual</button></div><strong>{formatShortDate(days[0].iso)} — {formatShortDate(days[6].iso)}</strong><div className="segmented"><button className="selected">Semana</button></div></div><div className="calendar-grid"><div className="calendar-head empty" />{days.map(day=><div className={day.iso===today?"calendar-head today":"calendar-head"} key={day.iso}>{day.label}</div>)}{hours.map((hour)=><div className="calendar-row" key={hour}><div className="hour">{hour}</div>{days.map((day,index)=>{const matches=appointments.filter((item)=>item.date===day.iso&&item.time.slice(0,2)===hour.slice(0,2));return <div className="calendar-cell" key={day.iso}>{matches.map((item)=><div className={`event ${["terracotta","olive","sand"][index%3]}`} key={item.id}>{item.time} {item.clientName}<br/><b>{item.serviceName}</b></div>)}</div>})}</div>)}</div></div>;
}

function Appointments({ appointments, onNew, onStatus }: { appointments: Appointment[]; onNew: () => void; onStatus:(id:string,status:string)=>Promise<void> }) {
  const [query,setQuery]=useState(""); const [status,setStatus]=useState("todos");
  const filtered=appointments.filter((item)=>(status==="todos"||item.status===status)&&`${item.clientName} ${item.serviceName} ${item.professionalName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return <div className="panel table-panel"><div className="table-tools"><div className="search-box"><Search size={16}/><input aria-label="Buscar cita" placeholder="Buscar cita..." value={query} onChange={(event)=>setQuery(event.target.value)}/></div><select aria-label="Filtrar por estado" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="todos">Todos los estados</option>{["programada","confirmada","en_progreso","completada","cancelada","no_asistio"].map((value)=><option value={value} key={value}>{statusLabel(value)}</option>)}</select><button className="primary" onClick={onNew}><Plus size={16}/> Nueva cita</button></div><div className="data-table"><div className="table-header"><span>Fecha</span><span>Cliente</span><span>Servicio</span><span>Profesional</span><span>Estado</span><span>Total</span></div>{filtered.map(a=><div className="table-row" key={a.id}><span><b>{a.time} — {a.endTime}</b><small>{formatShortDate(a.date)}</small></span><span><b>{a.clientName}</b><small>{a.phone}</small></span><span>{a.serviceName}</span><span>{a.professionalName}</span><span><select className="status-select" aria-label={`Estado de ${a.clientName}`} value={a.status} onChange={(event)=>void onStatus(a.id,event.target.value)} disabled={["cancelada","completada","no_asistio"].includes(a.status)}>{statusOptions(a.status).map((value)=><option value={value} key={value}>{statusLabel(value)}</option>)}</select></span><span><b>${(a.totalCents/100).toFixed(2)}</b></span></div>)}{!filtered.length&&<EmptyState text="No encontramos citas con esos filtros."/>}</div></div>;
}

function Clients({appointments}:{appointments:Appointment[]}){const [query,setQuery]=useState("");const clients=Array.from(appointments.reduce((map,item)=>{const key=item.email??item.phone;const current=map.get(key)??{name:item.clientName,email:item.email??"",phone:item.phone,visits:0,total:0};current.visits+=1;if(item.status==="completada")current.total+=item.totalCents;map.set(key,current);return map},new Map<string,{name:string;email:string;phone:string;visits:number;total:number}>()).values()).filter((item)=>`${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query.toLowerCase()));const recurrent=clients.filter((item)=>item.visits>1).length;const revenue=clients.reduce((sum,item)=>sum+item.total,0);const completed=appointments.filter((item)=>item.status==="completada").length;return <><section className="metric-grid three"><Metric icon={<UsersRound/>} tone="terracotta" label="Total clientes" value={String(clients.length)} trend="Con citas registradas"/><Metric icon={<Star/>} tone="olive" label="Recurrentes" value={clients.length?`${Math.round(recurrent/clients.length*100)}%`:"0%"} trend={`${recurrent} con más de una visita`}/><Metric icon={<TrendingUp/>} tone="sand" label="Ticket promedio" value={`$${(revenue/Math.max(1,completed)/100).toFixed(2)}`} trend="Sobre citas completadas"/></section><div className="panel table-panel"><div className="table-tools"><div className="search-box"><Search size={16}/><input aria-label="Buscar cliente" placeholder="Nombre, email o teléfono..." value={query} onChange={(event)=>setQuery(event.target.value)}/></div></div>{clients.map((client)=><div className="client-row" key={client.email||client.phone}><div className="person-initial">{initials(client.name)}</div><div><strong>{client.name}</strong><p>{client.phone} · {client.email}</p></div><span>{client.visits} {client.visits===1?"visita":"visitas"} · ${(client.total/100).toFixed(2)}</span><button className="ghost-icon" aria-label={`Más opciones de ${client.name}`}><MoreHorizontal/></button></div>)}{!clients.length&&<EmptyState text="Aún no hay clientes registrados."/>}</div></>}

function Cash({appointments}:{appointments:Appointment[]}){const completed=appointments.filter((item)=>item.status==="completada");const pending=appointments.filter((item)=>!["completada","cancelada","no_asistio"].includes(item.status));const total=completed.reduce((sum,item)=>sum+item.totalCents,0);return <><div className="cash-banner"><div><span>Resumen operativo</span><strong>Los ingresos aparecen al completar una cita</strong></div><Link className="secondary" href="/citas">Gestionar citas</Link></div><section className="metric-grid three"><Metric icon={<CircleDollarSign/>} tone="olive" label="Ingresos completados" value={`$${(total/100).toFixed(2)}`} trend={`${completed.length} citas`}/><Metric icon={<Clock3/>} tone="terracotta" label="Por cobrar" value={String(pending.length)} trend="Citas abiertas"/><Metric icon={<ReceiptText/>} tone="sand" label="Movimientos" value={String(completed.length)} trend="Basado en datos reales"/></section><div className="panel"><PanelTitle title="Actividad completada" subtitle="Citas que ya generan ingreso"/>{completed.length?completed.slice().reverse().map((item)=><div className="cash-row" key={item.id}><div className="activity-icon ok"><CircleDollarSign/></div><div><strong>{item.serviceName} · {item.clientName}</strong><p>{formatShortDate(item.date)} · {item.time}</p></div><b className="positive">+${(item.totalCents/100).toFixed(2)}</b></div>):<EmptyState text="Aún no hay citas completadas."/>}</div></>}

function Services({services}:{services:Service[]}){return <div className="cards-grid">{services.map((service,index)=><div className="service-card" key={service.id}><div className={`service-art art-${index%3}`}><Scissors/></div><div><span className="category">{service.category}</span><h3>{service.name}</h3><p><Clock3 size={15}/>{service.durationMinutes} min<b>${(service.priceCents/100).toFixed(2)}</b></p></div><span className="status confirmada">activo</span></div>)}{!services.length&&<div className="panel"><EmptyState text="Aún no hay servicios activos."/></div>}</div>}

function Team({professionals,appointments}:{professionals:Professional[];appointments:Appointment[]}){return <div className="team-grid">{professionals.map((professional)=><div className="team-card" key={professional.id}><div className="team-photo">{initials(professional.name)}</div><div><span className="status confirmada">activo</span><h2>{professional.name}</h2><p>{professional.specialty}</p></div><div className="team-stats"><span><b>{appointments.filter((item)=>item.professionalName===professional.name).length}</b> citas</span><span><b>{appointments.filter((item)=>item.professionalName===professional.name&&item.status==="completada").length}</b> completadas</span><span><b>${(appointments.filter((item)=>item.professionalName===professional.name&&item.status==="completada").reduce((sum,item)=>sum+item.totalCents,0)/100).toFixed(0)}</b> ingresos</span></div></div>)}{!professionals.length&&<div className="panel"><EmptyState text="Aún no hay profesionales activos."/></div>}</div>}

function Schedules({professionals}:{professionals:Professional[]}){const professional=professionals[0];return <div className="panel">{professional?<><div className="schedule-person"><div className="person-initial">{initials(professional.name)}</div><div><strong>{professional.name}</strong><p>Horario semanal configurado</p></div></div>{["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map((day,index)=><div className="schedule-row" key={day}><strong>{day}</strong><span className={`status ${index<6?"confirmada":"programada"}`}>{index<6?"Disponible":"Descanso"}</span><div className={index===6?"hours disabled":"hours"}>{index===6?"No trabaja":"09:00 — 19:00"}</div></div>)}</>:<EmptyState text="Agrega un profesional para configurar horarios."/>}</div>}

function Reports({appointments}:{appointments:Appointment[]}){const completed=appointments.filter((item)=>item.status==="completada");const total=completed.reduce((sum,item)=>sum+item.totalCents,0);const unique=new Set(appointments.map((item)=>item.email??item.phone)).size;const byService=Array.from(completed.reduce((map,item)=>map.set(item.serviceName,(map.get(item.serviceName)??0)+item.totalCents),new Map<string,number>()).entries()).sort((a,b)=>b[1]-a[1]);return <><section className="metric-grid three"><Metric icon={<CircleDollarSign/>} tone="olive" label="Ingresos registrados" value={`$${(total/100).toFixed(2)}`} trend="Citas completadas"/><Metric icon={<CalendarDays/>} tone="terracotta" label="Citas completadas" value={String(completed.length)} trend={`${appointments.length} citas totales`}/><Metric icon={<UsersRound/>} tone="ink" label="Clientes únicos" value={String(unique)} trend="Según la agenda"/></section><div className="dashboard-grid"><div className="panel revenue-panel"><PanelTitle title="Distribución por servicio" subtitle="Ingresos completados"/><div className="chart tall-chart">{byService.length?byService.map(([name,value],index)=><div className="bar-wrap" key={name} title={name}><div className={`bar ${index===0?"hot":""}`} style={{height:`${Math.max(8,value/Math.max(1,byService[0][1])*100)}%`}}/><span>{name.slice(0,1)}</span></div>):<EmptyState text="Completa citas para ver el reporte."/>}</div></div><div className="panel"><PanelTitle title="Rendimiento" subtitle="Estados de la agenda"/>{["programada","confirmada","en_progreso","completada","cancelada","no_asistio"].map((state)=><div className="service-progress" key={state}><div><strong>{statusLabel(state)}</strong><span>{appointments.filter((item)=>item.status===state).length}</span></div><div><i style={{width:`${appointments.length?appointments.filter((item)=>item.status===state).length/appointments.length*100:0}%`}}/></div></div>)}</div></div></>}

function FeatureSection({section}:{section:string}){
  if (section === "usuarios") return <MembersPanel/>;
  if (section === "seguridad") return <SecurityCenter/>;
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

function MembersPanel(){
  const [members,setMembers]=useState<Member[]>([]); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const load=()=>fetch("/api/admin/members").then(async r=>{const data=await readJsonObject(r);if(!r.ok)throw new Error(apiError(data,"No se pudo cargar el equipo"));const nextMembers=Array.isArray(data.members)?data.members.filter(isMember):[];setMembers(nextMembers)}).catch(err=>setError(err instanceof Error?err.message:"No se pudo cargar el equipo"));
  useEffect(()=>{void load()},[]);
  const invite=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setError("");const form=new FormData(e.currentTarget);const r=await fetch("/api/admin/members",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(form.entries()))});const data=await readJsonObject(r);if(!r.ok){setError(apiError(data,"No se pudo crear el acceso"));return}e.currentTarget.reset();setNotice("Acceso creado. Comparte la contraseña temporal de forma privada.");void load()};
  return <div className="security-layout"><section className="panel security-card"><PanelTitle title="Equipo con acceso" subtitle="Principio de mínimo privilegio"/>{members.map(member=><div className="member-row" key={member.id}><div className="person-initial">{initials(member.displayName||member.email)}</div><div><strong>{member.displayName||member.email}</strong><p>{member.email}</p></div><span className={`status ${member.status==="active"?"confirmada":"programada"}`}>{member.status}</span><b>{roleLabel(member.role)}</b></div>)}{!members.length&&!error&&<EmptyState text="No hay miembros para mostrar."/>}</section><section className="panel security-card"><PanelTitle title="Crear acceso" subtitle="Credenciales propias de Corteza"/><form className="invite-form" onSubmit={invite}><label>Nombre<input name="displayName" maxLength={100} required placeholder="Nombre del miembro"/></label><label>Email<input name="email" type="email" required maxLength={254} placeholder="persona@empresa.com"/></label><label>Contraseña temporal<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Mínimo 10 caracteres"/></label><label>Rol<select name="role" defaultValue="reception"><option value="reception">Recepción</option><option value="professional">Profesional</option><option value="admin">Administrador</option></select></label>{error&&<p className="form-error">{error}</p>}{notice&&<p className="form-success">{notice}</p>}<button className="primary">Crear acceso seguro</button></form></section></div>
}

function roleLabel(role:string){return ({owner:"Propietario",admin:"Administrador",reception:"Recepción",professional:"Profesional"} as Record<string,string>)[role]??role}

function isMember(value:unknown):value is Member{return isJsonObject(value)&&typeof value.id==="string"&&typeof value.email==="string"&&typeof value.displayName==="string"&&typeof value.role==="string"&&typeof value.status==="string"&&typeof value.createdAt==="string"&&(typeof value.lastSeenAt==="string"||value.lastSeenAt===null)}

type SecurityData={posture:Record<string,string>;members:{total:number;active:number;pending:number;suspended:number};events:{id:string;actorEmail:string|null;action:string;entityType:string;createdAt:string}[]};

function SecurityCenter(){
  const [data,setData]=useState<SecurityData|null>(null); const [error,setError]=useState("");
  useEffect(()=>{fetch("/api/admin/security").then(async r=>{const body=await readJsonObject(r);if(!r.ok)throw new Error(apiError(body,"No se pudo cargar el estado"));if(!isSecurityData(body))throw new Error("El estado de seguridad recibido no es válido.");setData(body)}).catch(err=>setError(err instanceof Error?err.message:"No se pudo cargar el estado"))},[]);
  const controls=[["Credenciales propias","Contraseñas seguras y sesiones revocables"],["Aislamiento por negocio","Cada consulta queda limitada al negocio"],["Roles en servidor","Los permisos no dependen de botones ocultos"],["Protección CSRF","Las mutaciones exigen mismo origen"],["Rate limiting","Frena abuso en reservas y administración"],["Auditoría","Registra cambios sensibles"],["Cabeceras seguras","CSP, HSTS y bloqueo de iframes"],["Bloqueo atómico de agenda","Evita reservas simultáneas solapadas"]];
  return <div className="security-stack"><section className="security-summary"><div><ShieldCheck size={28}/><span>Postura actual</span><strong>{error?"Revisión requerida":"Protección activa"}</strong><p>Defensa en profundidad aplicada al panel, APIs y agenda.</p></div><div className="security-score"><strong>{error?"—":"8/8"}</strong><span>controles base</span></div></section><section className="security-controls">{controls.map(([title,description])=><div className="panel control-card" key={title}><CheckCircle2/><div><strong>{title}</strong><p>{description}</p></div><span>Activo</span></div>)}</section><section className="panel audit-panel"><PanelTitle title="Actividad de seguridad" subtitle="Eventos sensibles más recientes"/>{data?.events?.length?data.events.map(event=><div className="audit-row" key={event.id}><span className="activity-icon neutral"><ShieldCheck/></span><div><strong>{auditLabel(event.action)}</strong><p>{event.actorEmail??"Reserva pública"} · {event.entityType}</p></div><time>{new Date(event.createdAt).toLocaleString("es-VE")}</time></div>):<EmptyState text={error||"Todavía no hay eventos de auditoría."}/>}</section></div>
}

function auditLabel(action:string){return ({"auth.login":"Inicio de sesión","auth.logout":"Cierre de sesión","auth.password_changed":"Contraseña actualizada","appointment.created":"Cita creada","appointment.status_updated":"Estado de cita actualizado","member.invited":"Acceso de miembro creado","member.access_updated":"Permisos actualizados"} as Record<string,string>)[action]??action}

function isSecurityData(value:unknown):value is SecurityData{if(!isJsonObject(value)||!isJsonObject(value.posture)||!isJsonObject(value.members)||!Array.isArray(value.events))return false;const members=value.members;return ["total","active","pending","suspended"].every((key)=>typeof members[key]==="number")&&value.events.every((event)=>isJsonObject(event)&&typeof event.id==="string"&&(typeof event.actorEmail==="string"||event.actorEmail===null)&&typeof event.action==="string"&&typeof event.entityType==="string"&&typeof event.createdAt==="string")}

function AppointmentModal({catalog,onClose,onCreated}:{catalog:Catalog;onClose:()=>void;onCreated:(a:Appointment)=>void}){
  const today=new Date().toISOString().slice(0,10); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const [serviceId,setServiceId]=useState(catalog.services[0]?.id??"");const [professionalId,setProfessionalId]=useState(catalog.professionals[0]?.id??"");const [date,setDate]=useState(today);const [time,setTime]=useState("");const [times,setTimes]=useState<string[]>([]);const [loadingTimes,setLoadingTimes]=useState(true);
  useEffect(()=>{if(!serviceId||!professionalId||!date)return;fetch(`/api/public/availability?slug=${encodeURIComponent(catalog.business.slug)}&serviceId=${encodeURIComponent(serviceId)}&professionalId=${encodeURIComponent(professionalId)}&date=${date}`).then(async(response)=>{const data=await readJsonObject(response);if(!response.ok)throw new Error(apiError(data,"No pudimos consultar la agenda"));const available=stringArray(data.times);setTimes(available);setTime((current)=>available.includes(current)?current:(available[0]??""));}).catch((reason)=>{setTimes([]);setTime("");setError(reason instanceof Error?reason.message:"No pudimos consultar la agenda")}).finally(()=>setLoadingTimes(false))},[catalog.business.slug,date,professionalId,serviceId]);
  const service=catalog.services.find((item)=>item.id===serviceId);const professional=catalog.professionals.find((item)=>item.id===professionalId);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!service||!professional||!time)return;setSaving(true);setError("");const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f.entries());try{const r=await fetch("/api/admin/appointments",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({...payload,serviceId,professionalId,date,time})});const data=await readJsonObject(r);if(!r.ok)throw new Error(apiError(data,"No se pudo guardar"));if(typeof data.id!=="string")throw new Error("La cita se guardó sin un identificador válido.");onCreated({id:data.id,date,time,endTime:addMinutes(time,service.durationMinutes),status:"programada",source:"panel",totalCents:service.priceCents,clientName:String(payload.name),phone:String(payload.phone),email:String(payload.email),serviceName:service.name,professionalName:professional.name});}catch(err){setError(err instanceof Error?err.message:"No se pudo guardar");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose()}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title"><div className="modal-head"><div><span className="eyebrow">Agenda en tiempo real</span><h2 id="appointment-title">Nueva cita</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre del cliente<input name="name" required maxLength={100} autoComplete="name" placeholder="Nombre completo"/></label><label>Teléfono<input name="phone" required maxLength={25} autoComplete="tel" placeholder="+58 412 000 0000"/></label><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="cliente@email.com"/></label><label>Servicio<select value={serviceId} onChange={(event)=>{setLoadingTimes(true);setServiceId(event.target.value)}}>{catalog.services.map((item)=><option value={item.id} key={item.id}>{item.name} · ${(item.priceCents/100).toFixed(2)}</option>)}</select></label><label>Profesional<select value={professionalId} onChange={(event)=>{setLoadingTimes(true);setProfessionalId(event.target.value)}}>{catalog.professionals.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Fecha<input type="date" min={today} value={date} onChange={(event)=>{setLoadingTimes(true);setDate(event.target.value)}} required/></label><label>Hora<select value={time} onChange={(event)=>setTime(event.target.value)} required disabled={loadingTimes||!times.length}><option value="">{loadingTimes?"Consultando...":"Selecciona"}</option>{times.map((value)=><option key={value}>{value}</option>)}</select></label><label className="wide">Notas<textarea name="notes" maxLength={500} placeholder="Preferencias, observaciones..."/></label></div>{!loadingTimes&&!times.length&&<p className="availability-note">No quedan horarios disponibles para esta fecha.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!time}>{saving?"Guardando...":"Crear cita"}</button></div></form></div></div>
}

function formatShortDate(value:string){return new Intl.DateTimeFormat("es-VE",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`))}
function addMinutes(value:string,minutes:number){const [hours,currentMinutes]=value.split(":").map(Number);const total=hours*60+currentMinutes+minutes;return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`}
function statusLabel(value:string){return ({programada:"Programada",confirmada:"Confirmada",en_progreso:"En progreso",completada:"Completada",cancelada:"Cancelada",no_asistio:"No asistió"} as Record<string,string>)[value]??value}
function statusOptions(value:string){const transitions:Record<string,string[]>={programada:["programada","confirmada","cancelada","no_asistio"],confirmada:["confirmada","en_progreso","cancelada","no_asistio"],en_progreso:["en_progreso","completada","cancelada"]};return transitions[value]??[value]}
