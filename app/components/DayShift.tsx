"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiError, isJsonObject, readJsonObject } from "./api-json";
import { ArrowDown, ArrowUp, CalendarClock, Check, Clock3, ListOrdered, Play, Plus, ReceiptText, Send, UserCheck, UserPlus, X } from "lucide-react";

type Service = { id:string; name:string; priceCents:number; active?:number|boolean };
type Professional = { id:string; name:string; serviceIds?:string[]; active?:number|boolean };
type Catalog = { business:{currency:string}; services:Service[]; professionals:Professional[] };
type QueueEntry = {
  id:string; date:string; kind:string; status:string; position:number; appointmentId:string|null; clientId:string;
  serviceId:string|null; professionalId:string|null; arrivedAt:string; startedAt:string|null; finishedAt:string|null;
  waitMinutes:number; saleId:string|null; saleAmountCents:number; notes:string; clientName:string; email:string; phone:string;
  serviceName:string|null; professionalName:string|null; totalCents:number; paidCents:number; appointmentStatus:string|null;
};
type ScheduledAppointment = {
  id:string; clientId:string; date:string; time:string; endTime:string; status:string; totalCents:number;
  clientName:string; email:string; phone:string; serviceName:string; serviceId:string; professionalId:string; professionalName:string;
  queueId:string|null; queueStatus:string|null;
};
type DayData = { date:string; queue:QueueEntry[]; appointments:ScheduledAppointment[]; summary:Record<string,number>; canWrite:boolean };

export function DayShift({ catalog, timezone, canWrite, canSell }: { catalog:Catalog|null; timezone:string; canWrite:boolean; canSell:boolean }) {
  const [date,setDate]=useState(()=>todayIn(timezone));
  const [data,setData]=useState<DayData|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [walkInOpen,setWalkInOpen]=useState(false);
  const [conversion,setConversion]=useState<QueueEntry|null>(null);
  const [saleEntry,setSaleEntry]=useState<QueueEntry|null>(null);
  const [walkInServiceId,setWalkInServiceId]=useState("");
  const [walkInProfessionalId,setWalkInProfessionalId]=useState("");
  const [conversionServiceId,setConversionServiceId]=useState("");
  const [conversionProfessionalId,setConversionProfessionalId]=useState("");

  const activeServices=useMemo(()=>catalog?.services.filter((item)=>item.active!==0&&item.active!==false)??[],[catalog]);
  const activeProfessionals=useMemo(()=>catalog?.professionals.filter((item)=>item.active!==0&&item.active!==false)??[],[catalog]);
  const professionalsFor=(serviceId:string)=>activeProfessionals.filter((item)=>!item.serviceIds||item.serviceIds.includes(serviceId));

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await fetch(`/api/admin/day?date=${encodeURIComponent(date)}`,{credentials:"same-origin"});
      const body=await readJsonObject(response);
      if(!response.ok) throw new Error(apiError(body,"No pudimos cargar el turno"));
      if(!isJsonObject(body)||!Array.isArray(body.queue)||!Array.isArray(body.appointments)) throw new Error("El turno recibido no es válido.");
      setData({date:typeof body.date==="string"?body.date:date,queue:body.queue as QueueEntry[],appointments:body.appointments as ScheduledAppointment[],summary:isJsonObject(body.summary)?body.summary as Record<string,number>:{},canWrite:body.canWrite!==false});
      setError("");
    } catch(reason) { setError(reason instanceof Error?reason.message:"No pudimos cargar el turno"); }
    finally { setLoading(false); }
  },[date]);

  useEffect(()=>{const initial=window.setTimeout(()=>void load(),0);const timer=window.setInterval(()=>void load(),30_000);return()=>{window.clearTimeout(initial);window.clearInterval(timer)}},[load]);

  const mutate=async(payload:Record<string,unknown>,message:string)=>{
    setSaving(true);setError("");
    try {
      const response=await fetch("/api/admin/day",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)});
      const body=await readJsonObject(response);if(!response.ok) throw new Error(apiError(body,"No pudimos guardar la operación"));
      await load();setNotice(message);window.setTimeout(()=>setNotice(""),2600);
      return body;
    } catch(reason) { setError(reason instanceof Error?reason.message:"No pudimos guardar la operación");throw reason; }
    finally { setSaving(false); }
  };

  const submitWalkIn=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    try { await mutate({action:"walk_in",date,name:form.get("name"),phone:form.get("phone"),email:form.get("email"),serviceId:walkInServiceId,professionalId:walkInProfessionalId,notes:form.get("notes")},"Cliente añadido a la cola");setWalkInOpen(false);event.currentTarget.reset(); }
    catch { /* error is rendered by the module */ }
  };

  const submitConversion=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!conversion)return;const form=new FormData(event.currentTarget);
    try { await mutate({action:"convert",id:conversion.id,date:form.get("date"),time:form.get("time"),serviceId:conversionServiceId,professionalId:conversionProfessionalId,name:form.get("name"),phone:form.get("phone"),email:form.get("email"),notes:form.get("notes")},"Walk-in convertido en cita");setConversion(null); }
    catch { /* error is rendered by the module */ }
  };

  const submitSale=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!saleEntry)return;const form=new FormData(event.currentTarget);
    try { await mutate({action:"sale",id:saleEntry.id,amountCents:Math.round(Number(form.get("amount"))*100),method:form.get("method")},"Venta rápida registrada en caja");setSaleEntry(null); }
    catch { /* error is rendered by the module */ }
  };

  const openConversion=(entry:QueueEntry)=>{
    setConversion(entry);setConversionServiceId(entry.serviceId??activeServices[0]?.id??"");setConversionProfessionalId(entry.professionalId??"");
  };
  const waitingAppointments=data?.appointments.filter((item)=>!item.queueId)??[];
  const queue=data?.queue??[];
  const summary=data?.summary??{};
  const currency=catalog?.business.currency??"USD";
  const money=(cents:number)=>new Intl.NumberFormat("es-VE",{style:"currency",currency}).format((Number(cents)||0)/100);
  const statusLabel=(status:string)=>({waiting:"Esperando",in_service:"En atención",finished:"Finalizado",no_show:"No llegó",cancelled:"Cancelado"} as Record<string,string>)[status]??status;

  return <div className="day-shift-stack">
    {loading&&<div className="loading-line"/>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {notice&&<p className="form-success">{notice}</p>}
    <section className="panel day-shift-toolbar"><div><span className="eyebrow">Operación en vivo</span><h2>Turno del día</h2><p>Registra llegadas, ordena la espera y cierra cada atención con trazabilidad.</p></div><div className="day-shift-actions"><label>Fecha<input type="date" value={date} onChange={(event)=>setDate(event.target.value)}/></label>{canWrite&&<><button className="secondary" onClick={()=>setWalkInOpen(true)}><UserPlus size={15}/> Walk-in</button><button className="secondary" disabled={saving} onClick={()=>void mutate({action:"reminders",date:addDays(date,1)},"Recordatorios de mañana preparados") }><Send size={15}/> Recordar mañana</button></>}</div></section>
    <section className="metric-grid four day-shift-metrics"><Metric icon={<ListOrdered/>} label="En el turno" value={String(Number(summary.total??queue.length))} detail="Entradas del día"/><Metric icon={<Clock3/>} label="Esperando" value={String(Number(summary.waiting??queue.filter((item)=>item.status==="waiting").length))} detail="Orden actual"/><Metric icon={<Play/>} label="En atención" value={String(Number(summary.inService??0))} detail="Trabajos activos"/><Metric icon={<Check/>} label="Espera media" value={`${Number(summary.averageWaitMinutes??0)} min`} detail={`${Number(summary.finished??0)} finalizados`}/></section>
    <div className="day-shift-grid">
      <section className="panel day-queue-panel"><div className="panel-title"><div><h2>Cola de atención</h2><p>{queue.length?"La posición se conserva entre actualizaciones.":"Aún no hay llegadas registradas."}</p></div><ListOrdered size={19}/></div>
        {queue.length?queue.map((entry,index)=><QueueRow key={entry.id} entry={entry} index={index} total={queue.length} canWrite={canWrite} canSell={canSell} saving={saving} money={money} statusLabel={statusLabel} onStatus={(status)=>void mutate({action:"status",id:entry.id,status},status==="in_service"?"Atención iniciada":status==="finished"?"Atención finalizada":"Estado actualizado")} onMove={(direction)=>void mutate({action:"move",id:entry.id,direction},"Cola reordenada")} onConvert={()=>openConversion(entry)} onSale={()=>{setSaleEntry(entry);}}/>):<div className="day-empty"><ListOrdered size={28}/><strong>La cola está vacía</strong><span>Añade un walk-in o registra la llegada de una cita.</span></div>}
      </section>
      <section className="panel day-scheduled-panel"><div className="panel-title"><div><h2>Citas de hoy</h2><p>{waitingAppointments.length?`${waitingAppointments.length} aún no han llegado`:"Todas las citas tienen llegada registrada"}</p></div><CalendarClock size={19}/></div>
        {waitingAppointments.length?waitingAppointments.map((appointment)=><div className="day-scheduled-row" key={appointment.id}><div className="day-time">{appointment.time}</div><div><strong>{appointment.clientName}</strong><p>{appointment.serviceName} · {appointment.professionalName}</p><small>{appointment.phone||appointment.email}</small></div>{canWrite&&<button className="primary compact" disabled={saving} onClick={()=>void mutate({action:"check_in",appointmentId:appointment.id},"Llegada registrada") }><UserCheck size={14}/> Llegó</button>}</div>):<div className="day-empty compact-empty"><Check size={26}/><strong>Sin llegadas pendientes</strong><span>El equipo puede concentrarse en la cola actual.</span></div>}
      </section>
    </div>
    {walkInOpen&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setWalkInOpen(false)}}><div className="modal day-shift-modal" role="dialog" aria-modal="true" aria-labelledby="walk-in-title"><div className="modal-head"><div><span className="eyebrow">Llegada sin reserva</span><h2 id="walk-in-title">Añadir walk-in</h2></div><button className="icon-button" onClick={()=>setWalkInOpen(false)} aria-label="Cerrar"><X/></button></div><form onSubmit={submitWalkIn}><div className="form-grid"><label className="wide">Nombre<input name="name" required maxLength={100} placeholder="Nombre del cliente"/></label><label>Teléfono<input name="phone" maxLength={25} placeholder="+58..."/></label><label>Email<input name="email" type="email" maxLength={254} placeholder="cliente@email.com"/></label><label>Servicio<select value={walkInServiceId} onChange={(event)=>{setWalkInServiceId(event.target.value);setWalkInProfessionalId("")}} required>{activeServices.map((item)=><option key={item.id} value={item.id}>{item.name} · {money(item.priceCents)}</option>)}</select></label><label>Profesional<select value={walkInProfessionalId} onChange={(event)=>setWalkInProfessionalId(event.target.value)}><option value="">Sin asignar</option>{professionalsFor(walkInServiceId).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="wide">Notas<textarea name="notes" maxLength={500} placeholder="Preferencias u observaciones..."/></label></div><p className="day-form-note">Necesitamos teléfono o email para poder dar seguimiento al cliente.</p><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setWalkInOpen(false)}>Cancelar</button><button className="primary" disabled={saving||!activeServices.length}><Plus size={15}/>{saving?"Guardando...":"Añadir a la cola"}</button></div></form></div></div>}
    {conversion&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setConversion(null)}}><div className="modal day-shift-modal" role="dialog" aria-modal="true" aria-labelledby="convert-title"><div className="modal-head"><div><span className="eyebrow">Conversión de llegada</span><h2 id="convert-title">Agendar a {conversion.clientName}</h2></div><button className="icon-button" onClick={()=>setConversion(null)} aria-label="Cerrar"><X/></button></div><form onSubmit={submitConversion}><div className="form-grid"><label className="wide">Nombre<input name="name" defaultValue={conversion.clientName} required maxLength={100}/></label><label>Teléfono<input name="phone" defaultValue={conversion.phone} required maxLength={25}/></label><label>Email<input name="email" type="email" defaultValue={conversion.email.includes("@local.invalid")?"":conversion.email} required maxLength={254}/></label><label>Servicio<select value={conversionServiceId} onChange={(event)=>{setConversionServiceId(event.target.value);setConversionProfessionalId("")}} required>{activeServices.map((item)=><option key={item.id} value={item.id}>{item.name} · {money(item.priceCents)}</option>)}</select></label><label>Profesional<select value={conversionProfessionalId} onChange={(event)=>setConversionProfessionalId(event.target.value)} required><option value="">Selecciona...</option>{professionalsFor(conversionServiceId).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Fecha<input name="date" type="date" defaultValue={conversion.date} required/></label><label>Hora<input name="time" type="time" step="900" defaultValue={conversion.startedAt?timeFrom(conversion.startedAt,timezone):new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())} required/></label><label className="wide">Notas<textarea name="notes" maxLength={500} defaultValue={conversion.notes}/></label></div><p className="day-form-note">La cita respeta la disponibilidad y los bloqueos existentes. Si el horario está ocupado, el sistema la rechazará.</p><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setConversion(null)}>Cancelar</button><button className="primary" disabled={saving||!conversionProfessionalId}>{saving?"Agendando...":"Convertir en cita"}</button></div></form></div></div>}
    {saleEntry&&<div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSaleEntry(null)}}><div className="modal day-shift-modal" role="dialog" aria-modal="true" aria-labelledby="sale-title"><div className="modal-head"><div><span className="eyebrow">Venta rápida</span><h2 id="sale-title">Registrar venta de {saleEntry.clientName}</h2></div><button className="icon-button" onClick={()=>setSaleEntry(null)} aria-label="Cerrar"><X/></button></div><form onSubmit={submitSale}><div className="form-grid"><label>Monto<input name="amount" type="number" min="0.01" step="0.01" defaultValue={((saleEntry.saleAmountCents||saleEntry.totalCents||0)/100).toFixed(2)} required/></label><label>Método<select name="method" defaultValue="efectivo"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="pago_movil">Pago móvil</option></select></label></div><p className="day-form-note"><ReceiptText size={14}/> Se guardará en caja, POS, reportes y recibos. La caja debe estar abierta.</p><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setSaleEntry(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Registrando...":"Registrar venta"}</button></div></form></div></div>}
  </div>;
}

function QueueRow({entry,index,total,canWrite,canSell,saving,money,statusLabel,onStatus,onMove,onConvert,onSale}:{entry:QueueEntry;index:number;total:number;canWrite:boolean;canSell:boolean;saving:boolean;money:(value:number)=>string;statusLabel:(value:string)=>string;onStatus:(status:string)=>void;onMove:(direction:string)=>void;onConvert:()=>void;onSale:()=>void}){
  const wait=Number(entry.waitMinutes)||0;
  return <article className={`day-queue-row ${entry.status}`}><div className="queue-position"><strong>{index+1}</strong><div>{canWrite&&entry.status==="waiting"&&<><button className="ghost-icon" disabled={saving||index===0} onClick={()=>onMove("up")} aria-label={`Subir a ${entry.clientName}`}><ArrowUp size={14}/></button><button className="ghost-icon" disabled={saving||index===total-1} onClick={()=>onMove("down")} aria-label={`Bajar a ${entry.clientName}`}><ArrowDown size={14}/></button></>}</div></div><div className="day-client-avatar">{initials(entry.clientName)}</div><div className="day-queue-copy"><div className="day-queue-title"><strong>{entry.clientName}</strong><span className={`status ${entry.status}`}>{statusLabel(entry.status)}</span></div><p>{entry.serviceName||"Servicio por definir"}{entry.professionalName?` · ${entry.professionalName}`:" · Sin profesional"}</p><small>{entry.kind==="appointment"?"Cita":entry.kind==="converted"?"Convertido desde walk-in":"Walk-in"} · Espera {wait} min{entry.saleId?` · Venta ${money(entry.saleAmountCents)}`:""}</small></div><div className="day-queue-actions">{canWrite&&entry.status==="waiting"&&<button className="secondary compact" disabled={saving} onClick={()=>onStatus("in_service")}><Play size={13}/> Atender</button>}{canWrite&&entry.status==="in_service"&&<button className="primary compact" disabled={saving} onClick={()=>onStatus("finished")}><Check size={13}/> Finalizar</button>}{canWrite&&entry.status==="waiting"&&<button className="ghost-action" disabled={saving} onClick={()=>onStatus("no_show")}>No llegó</button>}{canWrite&&!entry.appointmentId&&<button className="ghost-action" disabled={saving} onClick={onConvert}>Agendar</button>}{canSell&&!entry.saleId&&<button className="ghost-action" disabled={saving} onClick={onSale}>Venta</button>}</div></article>;
}

function Metric({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <div className="metric-card"><div className="metric-icon olive">{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}
function initials(value:string){return value.split(/\s+/u).filter(Boolean).map((part)=>part[0]).slice(0,2).join("").toUpperCase()||"C";}
function todayIn(timezone:string){return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function addDays(value:string,days:number){const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function timeFrom(value:string,timezone:string){return new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));}
