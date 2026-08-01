"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, CalendarDays, ChevronDown, CircleDollarSign, Clock3, Copy, CreditCard,
  LayoutDashboard, Menu, MessageCircle, Plus, Scissors, Search, Settings, Sparkles,
  Star, UserRound, UsersRound, WalletCards, X, CheckCircle2, CircleAlert, TrendingUp,
  Armchair, Megaphone, ShieldCheck, ReceiptText, ArrowUpRight, MoreHorizontal,
} from "lucide-react";

type Appointment = {
  id: string; date: string; time: string; status: string; source: string;
  totalCents: number; clientName: string; phone: string; serviceName: string; professionalName: string;
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
    ["configuracion", "Configuración", Settings], ["usuarios", "Usuarios y roles", ShieldCheck],
  ]},
] as const;

const titles: Record<string, [string, string]> = {
  dashboard: ["Tu barbería, bajo control", "Sábado, 1 de agosto · Actualizado ahora"],
  agenda: ["Agenda", "Organiza el día de todo tu equipo"], citas: ["Citas", "Gestiona reservas y estados"],
  clientes: ["Clientes", "Historial, preferencias y recurrencia"], caja: ["Caja", "Cobros, gastos y cierre del día"],
  servicios: ["Servicios", "Precios, duración y profesionales"], equipo: ["Equipo", "Profesionales y desempeño"],
  horarios: ["Horarios", "Disponibilidad semanal y bloqueos"], estaciones: ["Estaciones", "Sillas y recursos del local"],
  reportes: ["Reportes", "Entiende el rendimiento del negocio"], marketing: ["Marketing", "Mensajes y promociones"],
  fidelizacion: ["Fidelización", "Convierte visitas en clientes frecuentes"], configuracion: ["Configuración", "Preferencias del negocio y reservas"],
  usuarios: ["Usuarios y roles", "Accesos seguros para tu equipo"],
};

const seedAppointments: Appointment[] = [
  { id: "seed-1", date: "2026-08-01", time: "10:30", status: "confirmada", source: "online", totalCents: 2800, clientName: "Diego Rojas", phone: "+58 412 344 1098", serviceName: "Corte + Barba", professionalName: "Mateo Silva" },
  { id: "seed-2", date: "2026-08-01", time: "12:00", status: "programada", source: "panel", totalCents: 1800, clientName: "Andrés León", phone: "+58 424 870 4412", serviceName: "Corte Signature", professionalName: "Mateo Silva" },
  { id: "seed-3", date: "2026-08-01", time: "15:30", status: "programada", source: "online", totalCents: 1200, clientName: "Luis Mena", phone: "+58 414 322 6701", serviceName: "Barba Ritual", professionalName: "Mateo Silva" },
];

export function AdminApp({ section }: { section: string }) {
  const active = titles[section] ? section : "dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>(seedAppointments);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/appointments").then((r) => r.json()).then((data) => {
      if (Array.isArray(data.appointments) && data.appointments.length) {
        setAppointments([...seedAppointments, ...data.appointments.filter((a: Appointment) => !seedAppointments.some((s) => s.id === a.id))]);
      }
    }).catch(() => undefined);
  }, []);

  const [title, subtitle] = titles[active];
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/reservar/demo`);
    setNotice("Link de reservas copiado"); setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div className="admin-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Scissors size={20} /></div><div><strong>CORTEZA</strong><span>studio manager</span></div></div>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        <div className="workspace"><div className="avatar">CS</div><div><strong>Corteza Studio</strong><span>Plan Pro</span></div><ChevronDown size={16} /></div>
        <nav>
          {nav.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>
            {group.items.map(([slug, label, Icon]) => <a className={active === slug ? "active" : ""} href={`/${slug}`} key={slug} onClick={() => setMobileOpen(false)}><Icon size={18} /><span>{label}</span>{slug === "citas" && <em>3</em>}</a>)}
          </div>)}
        </nav>
        <div className="sidebar-footer"><div className="plan-line"><span>Plan Pro</span><strong>72%</strong></div><div className="plan-progress"><i /></div><small>38 de 50 citas este mes</small></div>
      </aside>

      <main className="admin-main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="topbar-search"><Search size={17} /><input aria-label="Buscar" placeholder="Buscar cliente, cita o servicio..." /></div>
          <a className="public-link" href="/reservar/demo" target="_blank"><Sparkles size={16} /> Ver página pública</a>
          <button className="icon-button"><MessageCircle size={19} /><i className="notify-dot" /></button>
          <div className="user-avatar">NM</div>
        </header>

        <div className="page-content">
          <div className="page-heading"><div><p className="eyebrow">Corteza Studio</p><h1>{title}</h1><p>{subtitle}</p></div><div className="heading-actions"><button className="secondary" onClick={copyLink}><Copy size={16} /> Link de reservas</button><button className="primary" onClick={() => setModalOpen(true)}><Plus size={17} /> Nueva cita</button></div></div>
          {active === "dashboard" ? <Dashboard appointments={appointments} /> : <ModuleView section={active} appointments={appointments} onNew={() => setModalOpen(true)} />}
        </div>
      </main>
      {modalOpen && <AppointmentModal onClose={() => setModalOpen(false)} onCreated={(appointment) => { setAppointments((old) => [...old, appointment]); setModalOpen(false); setNotice("Cita creada correctamente"); setTimeout(() => setNotice(""), 2500); }} />}
      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}</div>}
    </div>
  );
}

function Dashboard({ appointments }: { appointments: Appointment[] }) {
  return <>
    <section className="metric-grid">
      <Metric icon={<CalendarDays />} tone="terracotta" label="Citas de hoy" value={String(appointments.filter((a) => a.date === "2026-08-01").length)} trend="+18% vs. sábado anterior" />
      <Metric icon={<CircleDollarSign />} tone="olive" label="Ingresos del día" value="$58.00" trend="3 servicios cobrados" />
      <Metric icon={<UsersRound />} tone="ink" label="Clientes activos" value="148" trend="12 nuevos este mes" />
      <Metric icon={<Clock3 />} tone="sand" label="Ocupación" value="76%" trend="5.3 h reservadas" />
    </section>
    <section className="dashboard-grid">
      <div className="panel revenue-panel"><PanelTitle title="Ingresos" subtitle="Últimos 7 días" action="Esta semana" /><div className="big-number">$412.00 <span><TrendingUp size={15} /> 12.4%</span></div><div className="chart">
        {[42,58,48,74,66,90,78].map((v,i)=><div className="bar-wrap" key={i}><div className={`bar ${i===5?"hot":""}`} style={{height:`${v}%`}} /><span>{["L","M","X","J","V","S","D"][i]}</span></div>)}
      </div></div>
      <div className="panel"><PanelTitle title="Próximas citas" subtitle={`${appointments.length} en agenda`} action="Ver agenda" />
        <div className="appointment-list">{appointments.slice(0,4).map((a)=><AppointmentRow key={a.id} appointment={a} />)}</div>
      </div>
    </section>
    <section className="lower-grid"><div className="panel"><PanelTitle title="Servicios más pedidos" subtitle="Este mes" action="Ver todos" />
      {[['Corte Signature',68,'24 citas'],['Corte + Barba',47,'17 citas'],['Barba Ritual',29,'11 citas']].map(([name,value,count])=><div className="service-progress" key={String(name)}><div><strong>{name}</strong><span>{count}</span></div><div><i style={{width:`${value}%`}} /></div></div>)}
    </div><div className="panel"><PanelTitle title="Actividad reciente" subtitle="Hoy" />
      <div className="activity"><span className="activity-icon ok"><CheckCircle2 /></span><div><strong>Cobro registrado</strong><p>Diego Rojas · Corte + Barba</p></div><time>Hace 12 min</time></div>
      <div className="activity"><span className="activity-icon warn"><CircleAlert /></span><div><strong>Nueva reserva online</strong><p>Luis Mena · Barba Ritual</p></div><time>Hace 34 min</time></div>
      <div className="activity"><span className="activity-icon neutral"><UserRound /></span><div><strong>Cliente actualizado</strong><p>Preferencias y teléfono</p></div><time>Hace 1 h</time></div>
    </div></section>
  </>;
}

function Metric({ icon, tone, label, value, trend }: { icon: React.ReactNode; tone: string; label: string; value: string; trend: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>;
}

function PanelTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button>{action}<ArrowUpRight size={14} /></button>}</div>;
}

function AppointmentRow({ appointment: a }: { appointment: Appointment }) {
  return <div className="appointment-row"><time>{a.time}</time><div className="person-initial">{a.clientName.split(" ").map((n)=>n[0]).slice(0,2).join("")}</div><div><strong>{a.clientName}</strong><p>{a.serviceName} · {a.professionalName}</p></div><span className={`status ${a.status}`}>{a.status}</span><button className="ghost-icon" aria-label="Más opciones"><MoreHorizontal size={18}/></button></div>;
}

function ModuleView({ section, appointments, onNew }: { section: string; appointments: Appointment[]; onNew: () => void }) {
  if (section === "agenda") return <Agenda appointments={appointments} />;
  if (section === "citas") return <Appointments appointments={appointments} onNew={onNew} />;
  if (section === "clientes") return <Clients />;
  if (section === "caja") return <Cash />;
  if (section === "servicios") return <Services />;
  if (section === "equipo") return <Team />;
  if (section === "horarios") return <Schedules />;
  if (section === "reportes") return <Reports />;
  return <FeatureSection section={section} />;
}

function Agenda({ appointments }: { appointments: Appointment[] }) {
  const hours=["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
  return <div className="panel agenda-panel"><div className="agenda-toolbar"><div><button className="icon-button">‹</button><button className="icon-button">›</button><button className="secondary compact">Hoy</button></div><strong>27 jul — 2 ago 2026</strong><div className="segmented"><button>Día</button><button className="selected">Semana</button><button>Mes</button></div></div><div className="calendar-grid"><div className="calendar-head empty" />{["Lun 27","Mar 28","Mié 29","Jue 30","Vie 31","Sáb 1","Dom 2"].map(d=><div className={d.includes("Sáb")?"calendar-head today":"calendar-head"} key={d}>{d}</div>)}{hours.map((h)=><div className="calendar-row" key={h}><div className="hour">{h}</div>{[0,1,2,3,4,5,6].map(d=><div className="calendar-cell" key={d}>{d===5 && h==="10:00"&&<div className="event terracotta">10:30 Diego<br/><b>Corte + Barba</b></div>}{d===5&&h==="12:00"&&<div className="event olive">12:00 Andrés<br/><b>Corte Signature</b></div>}{d===5&&h==="15:00"&&<div className="event sand">15:30 Luis<br/><b>Barba Ritual</b></div>}</div>)}</div>)}</div></div>;
}

function Appointments({ appointments, onNew }: { appointments: Appointment[]; onNew: () => void }) {
  return <div className="panel table-panel"><div className="table-tools"><div className="search-box"><Search size={16}/><input placeholder="Buscar cita..."/></div><select><option>Todos los estados</option></select><select><option>Todos los servicios</option></select><button className="primary" onClick={onNew}><Plus size={16}/> Nueva cita</button></div><div className="data-table"><div className="table-header"><span>Hora</span><span>Cliente</span><span>Servicio</span><span>Profesional</span><span>Estado</span><span>Total</span></div>{appointments.map(a=><div className="table-row" key={a.id}><span><b>{a.time}</b><small>{a.date}</small></span><span><b>{a.clientName}</b><small>{a.phone}</small></span><span>{a.serviceName}</span><span>{a.professionalName}</span><span><i className={`status ${a.status}`}>{a.status}</i></span><span><b>${(a.totalCents/100).toFixed(2)}</b></span></div>)}</div></div>;
}

function Clients(){return <><section className="metric-grid three"><Metric icon={<UsersRound/>} tone="terracotta" label="Total clientes" value="148" trend="+12 este mes"/><Metric icon={<Star/>} tone="olive" label="Recurrentes" value="64%" trend="95 clientes"/><Metric icon={<TrendingUp/>} tone="sand" label="Ticket promedio" value="$19.40" trend="+8% este mes"/></section><div className="panel table-panel"><div className="table-tools"><div className="search-box"><Search size={16}/><input placeholder="Nombre, email o teléfono..."/></div><button className="secondary">Importar CSV</button><button className="primary"><Plus size={16}/> Nuevo cliente</button></div>{["Diego Rojas","Andrés León","Luis Mena","Samuel Ortiz"].map((name,i)=><div className="client-row" key={name}><div className="person-initial">{name.split(" ").map(n=>n[0]).join("")}</div><div><strong>{name}</strong><p>+58 412 555 0{180+i} · {6-i} visitas</p></div><span>${[128,94,71,62][i]}.00 gastados</span><button className="ghost-icon"><MoreHorizontal/></button></div>)}</div></>}

function Cash(){return <><div className="cash-banner"><div><span>Caja abierta</span><strong>Turno iniciado a las 08:42</strong></div><button className="secondary">Cerrar caja</button></div><section className="metric-grid"><Metric icon={<CircleDollarSign/>} tone="olive" label="Ingresos" value="$58.00" trend="3 cobros"/><Metric icon={<WalletCards/>} tone="terracotta" label="Efectivo" value="$30.00" trend="2 transacciones"/><Metric icon={<CreditCard/>} tone="ink" label="Digital" value="$28.00" trend="1 transacción"/><Metric icon={<ReceiptText/>} tone="sand" label="Gastos" value="$6.50" trend="1 movimiento"/></section><div className="panel"><PanelTitle title="Movimientos del día" subtitle="Balance neto $51.50" action="Exportar"/>{["Corte + Barba · Diego Rojas","Corte Signature · Andrés León","Compra de insumos"].map((x,i)=><div className="cash-row" key={x}><div className={`activity-icon ${i===2?"warn":"ok"}`}>{i===2?<ReceiptText/>:<CircleDollarSign/>}</div><div><strong>{x}</strong><p>{["Efectivo","Tarjeta","Efectivo"][i]} · {["10:54","12:38","13:05"][i]}</p></div><b className={i===2?"negative":"positive"}>{i===2?"-$6.50":"+$"+[28,18][i]+".00"}</b></div>)}</div></>}

function Services(){const data=[["Corte Signature","Cortes","35 min","$18"],["Barba Ritual","Barba","25 min","$12"],["Corte + Barba","Combos","55 min","$28"]];return <div className="cards-grid"><button className="add-card"><Plus/><strong>Nuevo servicio</strong><span>Agrega precio y duración</span></button>{data.map(([n,c,d,p],i)=><div className="service-card" key={n}><div className={`service-art art-${i}`}><Scissors/></div><div><span className="category">{c}</span><h3>{n}</h3><p><Clock3 size={15}/>{d}<b>{p}</b></p></div><button className="ghost-icon"><MoreHorizontal/></button></div>)}</div>}

function Team(){return <div className="team-grid"><div className="team-card"><div className="team-photo">MS</div><div><span className="status confirmada">activo</span><h2>Mateo Silva</h2><p>Fades · Barba · Clásicos</p></div><div className="team-stats"><span><b>31</b> citas</span><span><b>4.9</b> valoración</span><span><b>$412</b> ingresos</span></div><button className="secondary">Editar perfil</button></div><button className="add-card tall"><Plus/><strong>Agregar profesional</strong><span>Invita a otro miembro del equipo</span></button></div>}

function Schedules(){return <div className="panel"><div className="schedule-person"><div className="person-initial">MS</div><div><strong>Mateo Silva</strong><p>Horario semanal</p></div><button className="secondary">Agregar bloqueo</button></div>{["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map((d,i)=><div className="schedule-row" key={d}><strong>{d}</strong><label><input type="checkbox" defaultChecked={i<6}/><span/></label><div className={i===6?"hours disabled":"hours"}>{i===6?"No trabaja":"09:00 — 19:00"}</div><button className="ghost-icon"><MoreHorizontal/></button></div>)}</div>}

function Reports(){return <><section className="metric-grid three"><Metric icon={<CircleDollarSign/>} tone="olive" label="Ingresos del mes" value="$1,842" trend="+12.4%"/><Metric icon={<CalendarDays/>} tone="terracotta" label="Citas completadas" value="86" trend="91% efectividad"/><Metric icon={<UsersRound/>} tone="ink" label="Clientes nuevos" value="18" trend="+5 vs. julio"/></section><div className="dashboard-grid"><div className="panel revenue-panel"><PanelTitle title="Ingresos mensuales" subtitle="Enero — Agosto" action="Exportar"/><div className="chart tall-chart">{[30,42,38,55,61,68,79,92].map((v,i)=><div className="bar-wrap" key={i}><div className={`bar ${i===7?"hot":""}`} style={{height:`${v}%`}}/><span>{["E","F","M","A","M","J","J","A"][i]}</span></div>)}</div></div><div className="panel"><PanelTitle title="Mix de servicios" subtitle="Por ingresos"/><div className="donut"><div><b>86</b><span>servicios</span></div></div><div className="legend"><span><i className="dot terra"/>Cortes 48%</span><span><i className="dot olive"/>Combos 34%</span><span><i className="dot sand"/>Barba 18%</span></div></div></div></>}

function FeatureSection({section}:{section:string}){const content:Record<string,[string,string,string[]]>= {estaciones:["Estaciones y recursos","Evita reservas dobles cuando compartes sillas o equipos",["Silla principal","Lavacabezas","Sala privada"]],marketing:["Automatiza tu comunicación","Confirma citas, recupera clientes y lanza promociones",["Recordatorio 24 horas antes","Confirmación por WhatsApp","Campaña de clientes inactivos"]],fidelizacion:["Programa de puntos","Premia a quienes vuelven y aumenta la recurrencia",["1 punto por cada $1","20 puntos de bienvenida","Recompensa a los 100 puntos"]],configuracion:["Preferencias del negocio","Todo lo que necesita tu operación diaria",["Datos e identidad","Reservas y cancelaciones","Pagos y facturación","WhatsApp e imágenes"]],usuarios:["Accesos y permisos","Define qué puede ver y modificar cada persona",["Administrador · acceso total","Profesional · agenda propia","Recepción · citas y caja"]]};const [h,p,items]=content[section]??["Módulo","Configuración disponible",[]];return <div className="feature-layout"><div className="feature-hero"><span className="eyebrow">Configuración</span><h2>{h}</h2><p>{p}</p><button className="primary">Configurar ahora</button></div><div className="panel option-list">{items.map((x,i)=><div className="option-row" key={x}><span>{i+1}</span><strong>{x}</strong><ArrowUpRight/></div>)}</div></div>}

function AppointmentModal({onClose,onCreated}:{onClose:()=>void;onCreated:(a:Appointment)=>void}){
  const today=new Date().toISOString().slice(0,10); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setSaving(true);setError("");const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f.entries());try{const r=await fetch("/api/appointments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,professionalId:"pro_mateo",source:"panel"})});const data=await r.json();if(!r.ok)throw new Error(data.error);const service=payload.serviceId==="svc_combo"?["Corte + Barba",2800]:payload.serviceId==="svc_barba"?["Barba Ritual",1200]:["Corte Signature",1800];onCreated({id:data.id,date:String(payload.date),time:String(payload.time),status:"programada",source:"panel",totalCents:Number(service[1]),clientName:String(payload.name),phone:String(payload.phone),serviceName:String(service[0]),professionalName:"Mateo Silva"});}catch(err){setError(err instanceof Error?err.message:"No se pudo guardar");setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><div><span className="eyebrow">Agenda</span><h2>Nueva cita</h2></div><button className="icon-button" onClick={onClose}><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Nombre del cliente<input name="name" required placeholder="Nombre completo"/></label><label>Teléfono<input name="phone" required placeholder="+58 412 000 0000"/></label><label>Email<input name="email" type="email" required placeholder="cliente@email.com"/></label><label>Servicio<select name="serviceId" defaultValue="svc_corte"><option value="svc_corte">Corte Signature · $18</option><option value="svc_barba">Barba Ritual · $12</option><option value="svc_combo">Corte + Barba · $28</option></select></label><label>Profesional<select disabled><option>Mateo Silva</option></select></label><label>Fecha<input name="date" type="date" min={today} defaultValue={today} required/></label><label>Hora<select name="time" defaultValue="09:00">{["09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","15:00","16:00","17:00","18:00"].map(t=><option key={t}>{t}</option>)}</select></label><label className="wide">Notas<textarea name="notes" placeholder="Preferencias, observaciones..."/></label></div>{error&&<p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando...":"Crear cita"}</button></div></form></div></div>
}
