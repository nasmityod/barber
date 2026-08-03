"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, Clock3, ReceiptText, Trash2, WalletCards, X } from "lucide-react";
import { apiError, isJsonObject, readJsonObject } from "./api-json";

export type CashAppointment = {
  id:string; date:string; time:string; status:string; totalCents:number; paidCents:number;
  paymentStatus:string; clientName:string; serviceName:string;
};

type CashSession = {
  id:string; openedAt:string; openingAmountCents:number; notes:string; openedByName?:string;
  totalPaymentsCents:number; cashPaymentsCents:number; paymentCount:number;
};
type CashSessionHistory = {
  id:string; openedAt:string; closedAt:string|null; openingAmountCents:number;
  expectedCashCents:number|null; countedCashCents:number|null; status:string; notes:string;
};
type PaymentRecord = {
  id:string; appointmentId:string; cashSessionId:string; amountCents:number; method:string;
  tipCents:number; status:string; reference:string; createdAt:string; voidReason:string; clientName:string; serviceName:string;
};
type CashData = { openSession:CashSession|null; payments:PaymentRecord[]; sessions:CashSessionHistory[]; canManage:boolean };

function isCashSession(value:unknown):value is CashSession {
  return isJsonObject(value) && ["id","openedAt","notes"].every((key)=>typeof value[key]==="string") &&
    ["openingAmountCents","totalPaymentsCents","cashPaymentsCents","paymentCount"].every((key)=>typeof value[key]==="number") &&
    (value.openedByName===undefined||typeof value.openedByName==="string");
}

function isCashSessionHistory(value:unknown):value is CashSessionHistory {
  return isJsonObject(value) && ["id","openedAt","status","notes"].every((key)=>typeof value[key]==="string") &&
    typeof value.openingAmountCents==="number" && (typeof value.closedAt==="string"||value.closedAt===null) &&
    (typeof value.expectedCashCents==="number"||value.expectedCashCents===null) &&
    (typeof value.countedCashCents==="number"||value.countedCashCents===null);
}

function isPaymentRecord(value:unknown):value is PaymentRecord {
  return isJsonObject(value) && ["id","appointmentId","cashSessionId","method","status","reference","createdAt","voidReason","clientName","serviceName"]
    .every((key)=>typeof value[key]==="string") && typeof value.amountCents==="number" && typeof value.tipCents==="number";
}

function parseCashData(value:unknown):CashData {
  if(!isJsonObject(value)||!(value.openSession===null||isCashSession(value.openSession))||
    !Array.isArray(value.payments)||!value.payments.every(isPaymentRecord)||
    !Array.isArray(value.sessions)||!value.sessions.every(isCashSessionHistory)||typeof value.canManage!=="boolean"){
    throw new Error("La información de caja no es válida.");
  }
  return {openSession:value.openSession,payments:value.payments,sessions:value.sessions,canManage:value.canManage};
}

export function CashManager({appointments,onPaymentChanged}:{appointments:CashAppointment[];onPaymentChanged:(appointmentId:string,paidCents:number)=>void}){
  const [data,setData]=useState<CashData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [collecting,setCollecting]=useState<CashAppointment|null>(null);
  const [closing,setClosing]=useState(false);

  const refresh=async()=>{
    const response=await fetch("/api/admin/cash",{credentials:"same-origin"});
    const body=await readJsonObject(response);
    if(!response.ok)throw new Error(apiError(body,"No pudimos cargar la caja"));
    setData(parseCashData(body));
  };
  useEffect(()=>{
    let active=true;
    fetch("/api/admin/cash",{credentials:"same-origin"}).then(async(response)=>{
      const body=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(body,"No pudimos cargar la caja"));
      if(active)setData(parseCashData(body));
    }).catch((reason)=>{if(active)setError(reason instanceof Error?reason.message:"No pudimos cargar la caja")})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);
  const request=async(method:"POST"|"PATCH",payload:Record<string,unknown>)=>{
    setSaving(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/cash",{method,headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const body=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(body,"No pudimos actualizar la caja"));
      return body;
    }finally{setSaving(false)}
  };
  const openCash=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const openingAmountCents=currencyInputToCents(form.get("openingAmount"));
    if(openingAmountCents===null){setError("Indica un fondo inicial válido.");return}
    try{await request("POST",{action:"open",openingAmountCents,notes:String(form.get("notes")??"")});await refresh();setMessage("Caja abierta correctamente.")}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos abrir la caja")}
  };
  const recordPayment=async(amountCents:number,tipCents:number,method:string,reference:string)=>{
    if(!collecting)return;
    try{
      const body=await request("POST",{action:"payment",appointmentId:collecting.id,amountCents,tipCents,method,reference});
      if(typeof body.paidCents!=="number")throw new Error("El cobro no devolvió un saldo válido.");
      onPaymentChanged(collecting.id,body.paidCents);setCollecting(null);await refresh();setMessage("Cobro registrado y vinculado a la cita.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos registrar el cobro");throw reason}
  };
  const closeCash=async(countedCashCents:number,notes:string)=>{
    try{await request("PATCH",{action:"close",countedCashCents,notes});setClosing(false);await refresh();setMessage("Caja cerrada con arqueo guardado.")}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cerrar la caja");throw reason}
  };
  const voidPayment=async(payment:PaymentRecord)=>{
    const reason=window.prompt("Indica el motivo de la anulación:","")?.trim();if(!reason)return;
    try{
      const body=await request("PATCH",{action:"void",paymentId:payment.id,reason});
      if(typeof body.appointmentId==="string"&&typeof body.paidCents==="number")onPaymentChanged(body.appointmentId,body.paidCents);
      await refresh();setMessage("Cobro anulado; el saldo de la cita fue actualizado.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos anular el cobro")}
  };

  const openSession=data?.openSession??null;
  const pending=appointments.filter((item)=>!["cancelada","no_asistio"].includes(item.status)&&item.paidCents<item.totalCents)
    .sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const pendingCents=pending.reduce((sum,item)=>sum+item.totalCents-item.paidCents,0);
  const currentPayments=data?.payments.filter((payment)=>payment.cashSessionId===openSession?.id&&payment.status==="completed")??[];
  const closedSessions=data?.sessions.filter((session)=>session.status==="closed")??[];
  const visiblePayments=(openSession?data?.payments.filter((payment)=>payment.cashSessionId===openSession.id):data?.payments)??[];

  return <div className="cash-stack">
    {loading&&<div className="loading-line"/>}{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success">{message}</p>}
    {openSession?<div className="cash-banner open"><div><span>Caja abierta</span><strong>{money(openSession.openingAmountCents)} de fondo · {openSession.paymentCount} movimientos</strong><small>Abierta {formatDateTime(openSession.openedAt)}{openSession.openedByName?` por ${openSession.openedByName}`:""}</small></div>{data?.canManage&&<button className="secondary" onClick={()=>setClosing(true)}>Cerrar y arquear</button>}</div>:
      !loading&&data?.canManage?<form className="panel cash-open-form" onSubmit={openCash}><div><span className="eyebrow">Inicio de jornada</span><h2>Abre la caja para comenzar a cobrar</h2><p>Registra el efectivo inicial. Corteza impedirá que dos cajas queden abiertas al mismo tiempo.</p></div><label>Fondo inicial<input name="openingAmount" type="number" min="0" max="1000000" step="0.01" defaultValue="0.00" required/></label><label>Nota opcional<input name="notes" maxLength={500} placeholder="Ej. Turno de la mañana"/></label><button className="primary" disabled={saving}><WalletCards size={16}/>{saving?"Abriendo...":"Abrir caja"}</button></form>:null}
    <section className="metric-grid three"><Metric icon={<CircleDollarSign/>} tone="olive" label="Cobrado en caja" value={money(openSession?.totalPaymentsCents??0)} trend={`${currentPayments.length} movimientos válidos`}/><Metric icon={<Clock3/>} tone="terracotta" label="Saldo por cobrar" value={money(pendingCents)} trend={`${pending.length} citas con saldo`}/><Metric icon={<ReceiptText/>} tone="sand" label="Efectivo esperado" value={money((openSession?.openingAmountCents??0)+(openSession?.cashPaymentsCents??0))} trend="Fondo más cobros en efectivo"/></section>
    <div className="cash-grid">
      <section className="panel cash-due"><PanelTitle title="Citas con saldo" subtitle="Cobros parciales y totales"/>{pending.length?pending.slice(0,12).map((item)=><div className="cash-due-row" key={item.id}><div><strong>{item.clientName}</strong><p>{item.serviceName} · {formatShortDate(item.date)} · {item.time}</p><span className={`payment-pill ${item.paymentStatus}`}>{paymentLabel(item.paymentStatus)} · {money(item.paidCents)} de {money(item.totalCents)}</span></div>{data?.canManage&&<button className="primary compact" disabled={!openSession} title={!openSession?"Abre la caja para cobrar":undefined} onClick={()=>setCollecting(item)}>Cobrar {money(item.totalCents-item.paidCents)}</button>}</div>):<EmptyState text="Todas las citas visibles están pagadas."/>}</section>
      <section className="panel cash-movements"><PanelTitle title="Movimientos recientes" subtitle={openSession?"Caja actual":"Historial de cobros"}/>{visiblePayments.slice(0,12).map((payment)=><div className={`cash-row ${payment.status}`} key={payment.id}><div className={`activity-icon ${payment.status==="completed"?"ok":"neutral"}`}><CircleDollarSign/></div><div><strong>{payment.serviceName} · {payment.clientName}</strong><p>{paymentMethodLabel(payment.method)} · {formatDateTime(payment.createdAt)}{payment.reference?` · ${payment.reference}`:""}</p>{payment.status==="voided"&&<small>Anulado: {payment.voidReason}</small>}</div><b className={payment.status==="completed"?"positive":"muted"}>{payment.status==="completed"?"+":""}{money(payment.amountCents)}</b>{data?.canManage&&openSession?.id===payment.cashSessionId&&payment.status==="completed"&&<button className="ghost-icon" aria-label={`Anular cobro de ${payment.clientName}`} onClick={()=>void voidPayment(payment)}><Trash2 size={15}/></button>}</div>)}{!visiblePayments.length&&!loading&&<EmptyState text="Aún no hay cobros registrados."/>}</section>
    </div>
    {!!closedSessions.length&&<section className="panel cash-history"><PanelTitle title="Cierres anteriores" subtitle="Arqueos persistentes"/><div className="cash-history-grid">{closedSessions.slice(0,6).map((session)=>{const difference=(session.countedCashCents??0)-(session.expectedCashCents??0);return <div key={session.id}><span>{formatDateTime(session.closedAt??session.openedAt)}</span><strong>{money(session.countedCashCents??0)}</strong><small className={difference===0?"positive":difference>0?"positive":"negative"}>{difference===0?"Sin diferencia":`${difference>0?"Sobrante":"Faltante"}: ${money(Math.abs(difference))}`}</small></div>})}</div></section>}
    {collecting&&<CashPaymentModal appointment={collecting} saving={saving} onClose={()=>setCollecting(null)} onSubmit={recordPayment}/>} 
    {closing&&openSession&&<CashCloseModal expectedCashCents={openSession.openingAmountCents+openSession.cashPaymentsCents} saving={saving} onClose={()=>setClosing(false)} onSubmit={closeCash}/>} 
  </div>;
}

function Metric({icon,tone,label,value,trend}:{icon:React.ReactNode;tone:string;label:string;value:string;trend:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>}
function PanelTitle({title,subtitle}:{title:string;subtitle:string}){return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function EmptyState({text}:{text:string}){return <div className="empty"><p>{text}</p></div>}

function CashPaymentModal({appointment,saving,onClose,onSubmit}:{appointment:CashAppointment;saving:boolean;onClose:()=>void;onSubmit:(amountCents:number,tipCents:number,method:string,reference:string)=>Promise<void>}){
  const [method,setMethod]=useState("efectivo");const [error,setError]=useState("");const remaining=appointment.totalCents-appointment.paidCents;
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const amount=currencyInputToCents(form.get("amount"));const tip=currencyInputToCents(form.get("tip"));if(amount===null||amount<=0||amount>remaining||tip===null){setError("Revisa el monto y la propina.");return}setError("");try{await onSubmit(amount,tip,method,String(form.get("reference")??""))}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos registrar el cobro")}};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-payment-title"><div className="modal-head"><div><span className="eyebrow">Cobro vinculado</span><h2 id="cash-payment-title">Cobrar a {appointment.clientName}</h2><p>{appointment.serviceName} · saldo {money(remaining)}</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label>Monto<input name="amount" type="number" min="0.01" max={(remaining/100).toFixed(2)} step="0.01" defaultValue={(remaining/100).toFixed(2)} required/></label><label>Propina<input name="tip" type="number" min="0" step="0.01" defaultValue="0.00"/></label><label>Método<select value={method} onChange={(event)=>setMethod(event.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="pago_movil">Pago móvil</option></select></label><label className="wide">Referencia opcional<input name="reference" maxLength={120} placeholder={method==="efectivo"?"No necesaria para efectivo":"Número o referencia del pago"}/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Registrando...":"Registrar cobro"}</button></div></form></div></div>;
}

function CashCloseModal({expectedCashCents,saving,onClose,onSubmit}:{expectedCashCents:number;saving:boolean;onClose:()=>void;onSubmit:(countedCashCents:number,notes:string)=>Promise<void>}){
  const [error,setError]=useState("");const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const counted=currencyInputToCents(form.get("countedCash"));if(counted===null){setError("Indica el efectivo contado.");return}setError("");try{await onSubmit(counted,String(form.get("notes")??""))}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cerrar la caja")}};
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-close-title"><div className="modal-head"><div><span className="eyebrow">Arqueo final</span><h2 id="cash-close-title">Cerrar caja</h2><p>El sistema espera {money(expectedCashCents)} en efectivo.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label className="wide">Efectivo contado<input name="countedCash" type="number" min="0" max="1000000" step="0.01" defaultValue={(expectedCashCents/100).toFixed(2)} required/></label><label className="wide">Nota de cierre<textarea name="notes" maxLength={500} placeholder="Observaciones del arqueo..."/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Volver</button><button className="primary" disabled={saving}>{saving?"Cerrando...":"Cerrar caja"}</button></div></form></div></div>;
}

function currencyInputToCents(value:FormDataEntryValue|null){if(typeof value!=="string"||value.trim()==="")return null;const amount=Number(value);if(!Number.isFinite(amount)||amount<0)return null;const cents=Math.round(amount*100);return Number.isSafeInteger(cents)?cents:null}
function money(value:number){return new Intl.NumberFormat("es-VE",{style:"currency",currency:"USD"}).format(value/100)}
function formatShortDate(value:string){return new Intl.DateTimeFormat("es-VE",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`))}
function formatDateTime(value:string){return new Intl.DateTimeFormat("es-VE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}
function paymentLabel(value:string){return ({pendiente:"Pendiente",parcial:"Pago parcial",pagado:"Pagada"} as Record<string,string>)[value]??value}
function paymentMethodLabel(value:string){return ({efectivo:"Efectivo",tarjeta:"Tarjeta",transferencia:"Transferencia",pago_movil:"Pago móvil"} as Record<string,string>)[value]??value}
