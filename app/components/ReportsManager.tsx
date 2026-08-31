"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { apiError, isJsonObject, readJsonObject } from "./api-json";
import { BarChart3, CircleDollarSign, Download, RefreshCw, TrendingDown, TrendingUp, UsersRound } from "lucide-react";

type Filters = { from:string; to:string; professionalId:string; serviceId:string; method:string };
type ReportData = {
  filters:Filters; currency:string; summary:Record<string,number>; previous:Record<string,number>;
  daily:Record<string,unknown>[]; appointmentStats:Record<string,number>; clientStats:Record<string,number>;
  weekdays:Record<string,unknown>[]; hours:Record<string,unknown>[]; topClients:Record<string,unknown>[];
  services:Record<string,unknown>[]; professionals:Record<string,unknown>[]; methods:Record<string,unknown>[];
  products:Record<string,unknown>[]; commissions:Record<string,unknown>[];
  catalogs:{professionals:Record<string,unknown>[];services:Record<string,unknown>[]};
};

function isReport(value:unknown):value is ReportData {
  return isJsonObject(value) && isJsonObject(value.filters) && typeof value.currency === "string" && isJsonObject(value.summary) &&
    isJsonObject(value.previous) && isJsonObject(value.appointmentStats) && isJsonObject(value.clientStats) &&
    Array.isArray(value.daily) && Array.isArray(value.services) && Array.isArray(value.professionals) &&
    Array.isArray(value.methods) && Array.isArray(value.products) && Array.isArray(value.commissions) &&
    Array.isArray(value.weekdays) && Array.isArray(value.hours) && Array.isArray(value.topClients) && isJsonObject(value.catalogs);
}

function isoDaysAgo(days:number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", { year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
}
function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
}
function yearStart() { return `${new Date().getFullYear()}-01-01`; }
function todayIso() { return isoDaysAgo(0); }
function initialFilters():Filters { return { from: isoDaysAgo(29), to: todayIso(), professionalId:"", serviceId:"", method:"" }; }
function num(value:unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function deltaPct(current:number, previous:number) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

const WEEKDAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const PRESETS:[string, () => Filters][] = [
  ["Hoy", () => ({ ...initialFilters(), from: todayIso(), to: todayIso() })],
  ["7 días", () => ({ ...initialFilters(), from: isoDaysAgo(6), to: todayIso() })],
  ["30 días", () => initialFilters()],
  ["Mes", () => ({ ...initialFilters(), from: monthStart(), to: todayIso() })],
  ["Año", () => ({ ...initialFilters(), from: yearStart(), to: todayIso() })],
];

export function ReportsManager() {
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [data,setData]=useState<ReportData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=async(next:Filters)=>{
    try {
      const query=new URLSearchParams(next);
      const response=await fetch(`/api/admin/reports?${query}`,{credentials:"same-origin"});
      const body=await readJsonObject(response);
      if(!response.ok) throw new Error(apiError(body,"No pudimos cargar el reporte"));
      if(!isReport(body)) throw new Error("El reporte recibido no es válido.");
      setData(body);
    } catch(reason) {
      setError(reason instanceof Error?reason.message:"No pudimos cargar el reporte");
    } finally { setLoading(false); }
  };
  useEffect(()=>{
    let mounted=true;
    const query=new URLSearchParams(initialFilters());
    fetch(`/api/admin/reports?${query}`,{credentials:"same-origin"}).then(async(response)=>{
      const body=await readJsonObject(response);
      if(!response.ok) throw new Error(apiError(body,"No pudimos cargar el reporte"));
      if(!isReport(body)) throw new Error("El reporte recibido no es válido.");
      if(mounted) setData(body);
    }).catch((reason)=>{ if(mounted) setError(reason instanceof Error?reason.message:"No pudimos cargar el reporte"); })
      .finally(()=>{ if(mounted) setLoading(false); });
    return()=>{ mounted=false; };
  },[]);
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const next={
      from:String(form.get("from")??""), to:String(form.get("to")??""),
      professionalId:String(form.get("professionalId")??""), serviceId:String(form.get("serviceId")??""),
      method:String(form.get("method")??""),
    };
    setFilters(next); setLoading(true); setError(""); void load(next);
  };
  const applyPreset=(preset:Filters)=>{
    setFilters(preset); setLoading(true); setError(""); void load(preset);
  };
  const money=(cents:number)=>new Intl.NumberFormat("es-VE",{style:"currency",currency:data?.currency??"USD"}).format(cents/100);
  const summary=data?.summary??{};
  const previous=data?.previous??{};
  const stats=data?.appointmentStats??{};
  const clients=data?.clientStats??{};
  const paid=num(summary.paidAppointments);
  const ticket=paid ? Math.round(num(summary.serviceRevenueCents)/paid) : 0;
  const exportUrl=`/api/admin/reports?${new URLSearchParams(filters)}&format=csv`;
  const dailyMax=Math.max(1, ...(data?.daily.map((row)=>num(row.serviceCents)+num(row.productCents))??[1]));
  const hourMax=Math.max(1, ...(data?.hours.map((row)=>num(row.count))??[1]));
  const weekdayMax=Math.max(1, ...(data?.weekdays.map((row)=>num(row.count))??[1]));
  const serviceMax=Math.max(1, ...(data?.services.map((row)=>num(row.revenueCents))??[1]));
  const methodTotal=Math.max(1, (data?.methods??[]).reduce((sum,row)=>sum+num(row.amountCents),0));
  const hoursBySlot=useMemo(()=>{
    const map=new Map<number,number>();
    for (const row of data?.hours??[]) map.set(num(row.hour), num(row.count));
    return Array.from({length:24},(_,hour)=>({hour,count:map.get(hour)??0}));
  },[data]);
  const weekdayRows=useMemo(()=>{
    const map=new Map<number,number>();
    for (const row of data?.weekdays??[]) map.set(num(row.weekday), num(row.count));
    return WEEKDAYS.map((label,index)=>({label,count:map.get(index)??0}));
  },[data]);
  const funnel=[
    ["Programadas", num(stats.scheduled)],
    ["Confirmadas", num(stats.confirmed)],
    ["En progreso", num(stats.inProgress)],
    ["Completadas", num(stats.completed)],
    ["Canceladas", num(stats.cancelled)],
    ["No asistió", num(stats.noShow)],
  ] as const;
  const funnelMax=Math.max(1, ...funnel.map(([,count])=>count));

  return <div className="reports-stack">
    <div className="pole-line" aria-hidden="true" />
    <form className="panel reports-filters" onSubmit={submit}>
      <div>
        <span className="eyebrow">Analítica de barbería</span>
        <h2>Rendimiento real del negocio</h2>
        <p>Ingresos, ocupación y clientes salen de citas cobradas, POS, gastos, reembolsos y comisiones persistidas. Compara contra el periodo anterior de la misma duración.</p>
      </div>
      <div className="reports-presets" role="group" aria-label="Periodos rápidos">
        {PRESETS.map(([label, make])=>{
          const preset=make();
          const active=filters.from===preset.from && filters.to===preset.to;
          return <button type="button" className={active?"active":""} key={label} onClick={()=>applyPreset({...filters, from:preset.from, to:preset.to})}>{label}</button>;
        })}
      </div>
      <div className="reports-filter-grid">
        <label>Desde<input name="from" type="date" key={filters.from} defaultValue={filters.from} required/></label>
        <label>Hasta<input name="to" type="date" key={filters.to} defaultValue={filters.to} required/></label>
        <label>Profesional<select name="professionalId" key={filters.professionalId} defaultValue={filters.professionalId}><option value="">Todos</option>{data?.catalogs.professionals.map((item)=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        <label>Servicio<select name="serviceId" key={filters.serviceId} defaultValue={filters.serviceId}><option value="">Todos</option>{data?.catalogs.services.map((item)=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        <label>Método<select name="method" key={filters.method} defaultValue={filters.method}><option value="">Todos</option>{["efectivo","tarjeta","transferencia","pago_movil"].map((item)=><option value={item} key={item}>{methodLabel(item)}</option>)}</select></label>
        <div className="reports-actions">
          <button className="primary" disabled={loading}><RefreshCw size={15}/>{loading?"Actualizando...":"Aplicar"}</button>
          <a className="secondary" href={exportUrl} download><Download size={15}/> Exportar CSV</a>
        </div>
      </div>
    </form>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <section className="metric-grid reports-kpis">
      <Kpi label="Ingresos brutos" value={money(num(summary.grossRevenueCents))} delta={deltaPct(num(summary.grossRevenueCents), num(previous.grossRevenueCents))} hint={`${paid} citas cobradas`} />
      <Kpi label="Ganancia neta" value={money(num(summary.netRevenueCents))} delta={deltaPct(num(summary.netRevenueCents), num(previous.netRevenueCents))} hint="Tras gastos, reembolsos y comisiones" />
      <Kpi label="Ticket promedio" value={money(ticket)} delta={deltaPct(ticket, num(previous.paidAppointments)?Math.round(num(previous.serviceRevenueCents)/Math.max(1,num(previous.paidAppointments))):0)} hint="Solo servicios cobrados" />
      <Kpi label="Propinas" value={money(num(summary.tipsCents))} delta={deltaPct(num(summary.tipsCents), num(previous.tipsCents))} hint="Citas y POS" />
      <Kpi label="Tasa de cierre" value={`${num(stats.completionRate)}%`} delta={num(stats.noShowRate)*-1} hint={`${num(stats.noShowRate)}% no-show · ${num(stats.cancelled)} canceladas`} />
    </section>
    <div className="reports-grid">
      <section className="panel revenue-panel">
        <div className="panel-title"><div><h2>Tendencia diaria</h2><p>{filters.from} → {filters.to}</p></div><BarChart3 size={18}/></div>
        <div className="big-number">{money(num(summary.grossRevenueCents))} <span>{num(summary.productRevenueCents)?`· ${money(num(summary.productRevenueCents))} en productos`: "Datos persistentes"}</span></div>
        <div className="reports-chart" role="img" aria-label="Ingresos diarios">
          {(data?.daily.length?data.daily:[{day:filters.to,serviceCents:0,productCents:0}]).map((row)=>{
            const total=num(row.serviceCents)+num(row.productCents);
            const label=String(row.day??"").slice(8);
            return <div className="bar-wrap" key={String(row.day)} title={`${row.day}: ${money(total)}`}>
              <div className="bar" style={{height:`${Math.max(6,(total/dailyMax)*100)}%`}} />
              <span>{label}</span>
            </div>;
          })}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>Embudo de citas</h2><p>{num(stats.total)} en el periodo · {num(stats.onlineCount)} online / {num(stats.panelCount)} panel</p></div></div>
        <div className="funnel-list">
          {funnel.map(([label,count])=>(
            <div className="funnel-item" key={label}>
              <span>{label}</span>
              <div className="share-track"><i style={{width:`${Math.max(4,(count/funnelMax)*100)}%`}} /></div>
              <b>{count}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
    <div className="reports-grid">
      <section className="panel">
        <div className="panel-title"><div><h2>Ocupación por día</h2><p>Qué días llena la silla</p></div></div>
        <div className="reports-chart" style={{height:140}}>
          {weekdayRows.map((row)=>(
            <div className="bar-wrap" key={row.label} title={`${row.label}: ${row.count}`}>
              <div className="bar" style={{height:`${Math.max(6,(row.count/weekdayMax)*100)}%`}} />
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>Horas pico</h2><p>Demanda por hora de inicio</p></div></div>
        <div className="hour-heat">
          {hoursBySlot.map((slot)=>{
            const intensity=slot.count/hourMax;
            return <b key={slot.hour} title={`${String(slot.hour).padStart(2,"0")}:00 · ${slot.count}`} style={{"--heat":intensity} as CSSProperties}>{String(slot.hour).padStart(2,"0")}</b>;
          })}
        </div>
      </section>
    </div>
    <div className="reports-grid">
      <section className="panel reports-table">
        <div className="panel-title"><div><h2>Servicios que más venden</h2><p>{paid} cobros de servicio</p></div></div>
        {data?.services.length?data.services.map((row)=>(
          <div className="share-row" key={String(row.id)}>
            <div>
              <strong>{String(row.name)}</strong>
              <div className="share-track"><i style={{width:`${Math.max(6,(num(row.revenueCents)/serviceMax)*100)}%`}} /></div>
              <small>{String(row.appointmentCount)} cobro(s)</small>
            </div>
            <b>{money(num(row.revenueCents))}</b>
          </div>
        )):<div className="reports-empty">No hay cobros de servicios con estos filtros.</div>}
      </section>
      <section className="panel reports-table">
        <div className="panel-title"><div><h2>Equipo</h2><p>{num(clients.activeClients)} clientes activos · {num(clients.returningClients)} recurrentes · {num(clients.newClients)} nuevos</p></div><UsersRound size={18}/></div>
        {data?.professionals.length?data.professionals.map((row)=>(
          <div className="report-row" key={String(row.id)}>
            <div><strong>{String(row.name)}</strong><small>{String(row.appointmentCount)} citas · {money(num(row.tipCents))} propinas</small></div>
            <b>{money(num(row.revenueCents))}</b>
          </div>
        )):<div className="reports-empty">No hay datos de profesionales en este periodo.</div>}
      </section>
    </div>
    <div className="reports-grid">
      <section className="panel reports-table">
        <div className="panel-title"><div><h2>Medios de pago</h2><p>{num(summary.productSalesCount)} ventas POS · {num(summary.expenseCount)} gastos · {num(summary.refundCount)} reembolsos</p></div></div>
        {data?.methods.length?data.methods.map((row)=>(
          <div className="share-row" key={String(row.method)}>
            <div>
              <strong>{methodLabel(String(row.method))}</strong>
              <div className="share-track"><i style={{width:`${Math.max(6,(num(row.amountCents)/methodTotal)*100)}%`}} /></div>
              <small>{String(row.transactionCount)} transacción(es) · {money(num(row.tipCents))} propinas</small>
            </div>
            <b>{money(num(row.amountCents))}</b>
          </div>
        )):<div className="reports-empty">No hay cobros por método en este periodo.</div>}
      </section>
      <section className="panel reports-table">
        <div className="panel-title"><div><h2>Clientes top</h2><p>Mayor gasto cobrado en el periodo</p></div></div>
        {data?.topClients.length?data.topClients.map((row)=>(
          <div className="report-row" key={String(row.id)}>
            <div><strong>{String(row.name)}</strong><small>{String(row.visitCount)} visita(s)</small></div>
            <b>{money(num(row.revenueCents))}</b>
          </div>
        )):<div className="reports-empty">Todavía no hay ranking de clientes.</div>}
      </section>
    </div>
    <section className="panel reports-table">
      <div className="panel-title"><div><h2>Comisiones</h2><p>{num(summary.commissionCount)} generada(s) · {money(num(summary.pendingCommissionsCents))} pendientes · {money(num(summary.expensesCents))} en gastos</p></div><CircleDollarSign size={18}/></div>
      {data?.commissions.length?data.commissions.slice(0,12).map((row)=>(
        <div className="report-row" key={String(row.id)}>
          <div><strong>{String(row.professionalName)} · {String(row.serviceName)}</strong><small>{String(row.status)} · {String(row.ruleName)}</small></div>
          <b>{money(num(row.amountCents))}</b>
        </div>
      )):<div className="reports-empty">No hay comisiones generadas en este periodo.</div>}
    </section>
  </div>;
}

function Kpi({label,value,delta,hint}:{label:string;value:string;delta:number;hint:string}) {
  const up=delta>=0;
  return <div className="metric-card">
    <div className={`metric-icon ${up?"ok":"danger"}`}>{up?<TrendingUp/>:<TrendingDown/>}</div>
    <span>{label}</span>
    <strong>{value}</strong>
    <small className={`metric-delta ${up?"up":"down"}`}>{up?"▲":"▼"} {Math.abs(delta)}% vs periodo anterior</small>
    <small>{hint}</small>
  </div>;
}
function methodLabel(value:string){
  return ({efectivo:"Efectivo",tarjeta:"Tarjeta",transferencia:"Transferencia",pago_movil:"Pago móvil",cash:"Efectivo",card:"Tarjeta",transfer:"Transferencia",mobile:"Pago móvil",other:"Otro"} as Record<string,string>)[value]??value;
}
