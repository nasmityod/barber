"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Clock3, Download, Printer, ReceiptText, Trash2, WalletCards, X } from "lucide-react";
import { apiError, isJsonObject, readJsonObject } from "./api-json";
import { promptText } from "./dialogs";

export type CashAppointment = {
  id:string; date:string; time:string; status:string; totalCents:number; paidCents:number;
  paymentStatus:string; clientName:string; serviceName:string;
};

type MethodSummary = { method:string; incomeCents:number; tipsCents:number; outflowCents:number; netCents:number; transactionCount:number };
type SessionSummary = {
  serviceIncomeCents:number; productIncomeCents:number; tipsCents:number; expensesCents:number; refundsCents:number;
  grossIncomeCents:number; netIncomeCents:number; paymentCount:number; saleCount:number; expenseCount:number;
  refundCount:number; cashInflowCents:number; cashOutflowCents:number; expectedCashCents:number; methods:MethodSummary[];
};
type CashSession = {
  id:string; openedAt:string; openingAmountCents:number; notes:string; openedByName?:string;
  totalPaymentsCents:number; cashPaymentsCents:number; paymentCount:number;
};
type CashSessionHistory = {
  id:string; openedAt:string; closedAt:string|null; openingAmountCents:number;
  expectedCashCents:number|null; countedCashCents:number|null; status:string; notes:string;
  closingSummary?:string;
};
type PaymentRecord = {
  id:string; appointmentId:string; cashSessionId:string; amountCents:number; method:string;
  tipCents:number; status:string; reference:string; createdAt:string; voidReason:string; clientName:string; serviceName:string;
};
type CashData = {
  openSession:CashSession|null; openSummary:SessionSummary|null; payments:PaymentRecord[];
  sessions:CashSessionHistory[]; currency:string; canManage:boolean;
};
type SessionDetail = {
  session:Record<string,unknown>; summary:SessionSummary; movements:{payments:unknown[];sales:unknown[];expenses:unknown[];refunds:unknown[]};
  currency:string;
};

const BILLS = [10000, 5000, 2000, 1000, 500, 100];

function isMethodSummary(value:unknown):value is MethodSummary {
  return isJsonObject(value) && typeof value.method==="string" &&
    ["incomeCents","tipsCents","outflowCents","netCents","transactionCount"].every((key)=>typeof value[key]==="number");
}
function isSessionSummary(value:unknown):value is SessionSummary {
  return isJsonObject(value) && ["serviceIncomeCents","productIncomeCents","tipsCents","expensesCents","refundsCents","grossIncomeCents","netIncomeCents","paymentCount","saleCount","expenseCount","refundCount","cashInflowCents","cashOutflowCents","expectedCashCents"].every((key)=>typeof value[key]==="number") &&
    Array.isArray(value.methods) && value.methods.every(isMethodSummary);
}
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
    !(value.openSummary===null||value.openSummary===undefined||isSessionSummary(value.openSummary))||
    !Array.isArray(value.payments)||!value.payments.every(isPaymentRecord)||
    !Array.isArray(value.sessions)||!value.sessions.every(isCashSessionHistory)||typeof value.canManage!=="boolean"){
    throw new Error("La información de caja no es válida.");
  }
  return {
    openSession:value.openSession, openSummary:isSessionSummary(value.openSummary)?value.openSummary:null,
    payments:value.payments, sessions:value.sessions,
    currency:typeof value.currency==="string"?value.currency:"USD", canManage:value.canManage,
  };
}

export function CashManager({appointments,onPaymentChanged}:{appointments:CashAppointment[];onPaymentChanged:(appointmentId:string,paidCents:number,totalCents?:number)=>void}){
  const [data,setData]=useState<CashData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [collecting,setCollecting]=useState<CashAppointment|null>(null);
  const [closing,setClosing]=useState(false);
  const [closedReceipt,setClosedReceipt]=useState<{expected:number;counted:number;difference:number;summary:SessionSummary}|null>(null);
  const [inspecting,setInspecting]=useState<string|null>(null);

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
    try{await request("POST",{action:"open",openingAmountCents,notes:String(form.get("notes")??"")});await refresh();setMessage("Caja abierta. Ya puedes cobrar servicios y ventas.")}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos abrir la caja")}
  };
  const recordPayment=async(amountCents:number,tipCents:number,method:string,reference:string,promoCode:string)=>{
    if(!collecting)return;
    try{
      let chargeAmount=amountCents;
      let nextTotal=collecting.totalCents;
      if(promoCode.trim()){
        const promo=await request("POST",{action:"apply_promo",appointmentId:collecting.id,promoCode:promoCode.trim()});
        if(typeof promo.totalCents==="number") nextTotal=promo.totalCents;
        const paid=typeof promo.paidCents==="number"?promo.paidCents:collecting.paidCents;
        chargeAmount=Math.min(amountCents, Math.max(0, nextTotal-paid));
        if(chargeAmount<=0){
          onPaymentChanged(collecting.id,paid,nextTotal);setCollecting(null);await refresh();setMessage("Promoción aplicada. La cita quedó saldada.");
          return;
        }
      }
      const body=await request("POST",{action:"payment",appointmentId:collecting.id,amountCents:chargeAmount,tipCents,method,reference});
      if(typeof body.paidCents!=="number")throw new Error("El cobro no devolvió un saldo válido.");
      onPaymentChanged(collecting.id,body.paidCents,nextTotal);setCollecting(null);await refresh();setMessage("Cobro registrado y vinculado a la cita.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos registrar el cobro");throw reason}
  };
  const closeCash=async(countedCashCents:number,notes:string,countedBreakdown:Record<string,number>)=>{
    try{
      const body=await request("PATCH",{action:"close",countedCashCents,notes,countedBreakdown:Object.keys(countedBreakdown).length?countedBreakdown:undefined});
      const summary=isSessionSummary(body.summary)?body.summary:null;
      setClosing(false);
      await refresh();
      setClosedReceipt({
        expected:typeof body.expectedCashCents==="number"?body.expectedCashCents:countedCashCents,
        counted:countedCashCents,
        difference:typeof body.differenceCents==="number"?body.differenceCents:0,
        summary:summary??emptySummary(countedCashCents),
      });
      setMessage("Caja cerrada. El arqueo quedó guardado y se puede imprimir.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cerrar la caja");throw reason}
  };
  const voidPayment=async(payment:PaymentRecord)=>{
    const reason=await promptText({title:"Anular este cobro",message:"El cobro queda registrado como anulado y vuelve a contar como pendiente en la cita.",destructive:true,confirmLabel:"Anular cobro",prompt:{label:"Motivo de la anulación",placeholder:"Ej: se cobró el monto equivocado",multiline:true}});
    if(!reason)return;
    try{
      const body=await request("PATCH",{action:"void",paymentId:payment.id,reason});
      if(typeof body.appointmentId==="string"&&typeof body.paidCents==="number")onPaymentChanged(body.appointmentId,body.paidCents);
      await refresh();setMessage("Cobro anulado; el saldo de la cita fue actualizado.");
    }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos anular el cobro")}
  };

  const openSession=data?.openSession??null;
  const summary=data?.openSummary??null;
  const currency=data?.currency??"USD";
  const pending=appointments.filter((item)=>!["cancelada","no_asistio"].includes(item.status)&&item.paidCents<item.totalCents)
    .sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const pendingCents=pending.reduce((sum,item)=>sum+item.totalCents-item.paidCents,0);
  const currentPayments=data?.payments.filter((payment)=>payment.cashSessionId===openSession?.id&&payment.status==="completed")??[];
  const closedSessions=data?.sessions.filter((session)=>session.status==="closed")??[];
  const visiblePayments=(openSession?data?.payments.filter((payment)=>payment.cashSessionId===openSession.id):data?.payments)??[];
  const expectedCash=summary?.expectedCashCents??((openSession?.openingAmountCents??0)+(openSession?.cashPaymentsCents??0));
  const digitalCents=Math.max(0,(summary?.grossIncomeCents??0)+(summary?.tipsCents??0)-(summary?.cashInflowCents??0));
  const methodMax=Math.max(1, ...(summary?.methods.map((item)=>item.incomeCents+item.tipsCents)??[1]));
  const exportId=openSession?.id??closedSessions[0]?.id;

  return <div className="cash-stack">
    <div className="pole-line" aria-hidden="true" />
    {loading&&<div className="loading-line"/>}{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success">{message}</p>}
    {openSession?<div className="cash-banner open"><div><span>Caja abierta</span><strong>{money(openSession.openingAmountCents,currency)} de fondo · {summary?`${summary.paymentCount} cobros · ${summary.saleCount} ventas`:`${openSession.paymentCount} movimientos`}</strong><small>Abierta {formatDateTime(openSession.openedAt)}{openSession.openedByName?` por ${openSession.openedByName}`:""}{openSession.notes?` · ${openSession.notes}`:""}</small></div><div className="shop-actions">{exportId&&<a className="secondary" href={`/api/admin/cash?sessionId=${exportId}&format=csv`}><Download size={15}/> Exportar</a>}{data?.canManage&&<button className="primary" onClick={()=>setClosing(true)}>Cerrar y arquear</button>}</div></div>:
      !loading&&data?.canManage?<form className="panel cash-open-form" onSubmit={openCash}><div><span className="eyebrow">Inicio de jornada</span><h2>Abre la caja para cobrar</h2><p>Registra el efectivo inicial. El sistema impide dos cajas abiertas y deja el arqueo trazado al cerrar.</p></div><label>Fondo inicial<input name="openingAmount" type="number" min="0" max="1000000" step="0.01" defaultValue="0.00" required/></label><label>Nota del turno<input name="notes" maxLength={500} placeholder="Ej. Turno de la mañana · silla 1"/></label><button className="primary" disabled={saving}><WalletCards size={16}/>{saving?"Abriendo...":"Abrir caja"}</button></form>:null}
    <section className="metric-grid reports-kpis">
      <Metric icon={<CircleDollarSign/>} tone="ok" label="Cobrado en caja" value={money(summary?.grossIncomeCents??openSession?.totalPaymentsCents??0,currency)} trend={`${summary?.paymentCount??currentPayments.length} servicios · ${summary?.saleCount??0} POS`}/>
      <Metric icon={<WalletCards/>} tone="ink" label="Efectivo esperado" value={money(expectedCash,currency)} trend="Fondo + entradas − salidas"/>
      <Metric icon={<ReceiptText/>} tone="gold" label="Digital y tarjeta" value={money(digitalCents,currency)} trend="No sale del cajón"/>
      <Metric icon={<Clock3/>} tone="info" label="Por cobrar" value={money(pendingCents,currency)} trend={`${pending.length} citas con saldo`}/>
      <Metric icon={<CircleDollarSign/>} tone="ok" label="Neto del turno" value={money(summary?.netIncomeCents??0,currency)} trend={`${money(summary?.tipsCents??0,currency)} propinas · ${money(summary?.expensesCents??0,currency)} gastos`}/>
    </section>
    {summary&&summary.methods.length>0&&<section className="panel"><div className="panel-title"><div><h2>Mix de cobro</h2><p>Servicios, productos, propinas y salidas por método</p></div></div><div className="cash-methods">{summary.methods.map((item)=><div className="cash-method-row" key={item.method}><span>{paymentMethodLabel(item.method)}</span><div className="cash-method-track"><i style={{width:`${Math.max(6,((item.incomeCents+item.tipsCents)/methodMax)*100)}%`}}/></div><b>{money(item.netCents,currency)}</b></div>)}</div></section>}
    <div className="cash-grid">
      <section className="panel cash-due"><PanelTitle title="Sillas por cobrar" subtitle="Cobros parciales y totales"/>{pending.length?pending.slice(0,12).map((item)=><div className="cash-due-row" key={item.id}><div><strong>{item.clientName}</strong><p>{item.serviceName} · {formatShortDate(item.date)} · {item.time}</p><span className={`payment-pill ${item.paymentStatus}`}>{paymentLabel(item.paymentStatus)} · {money(item.paidCents,currency)} de {money(item.totalCents,currency)}</span></div>{data?.canManage&&<button className="primary compact" disabled={!openSession} title={!openSession?"Abre la caja para cobrar":undefined} onClick={()=>setCollecting(item)}>Cobrar {money(item.totalCents-item.paidCents,currency)}</button>}</div>):<EmptyState text="Todas las citas visibles están pagadas."/>}</section>
      <section className="panel cash-movements"><PanelTitle title="Movimientos" subtitle={openSession?"Turno actual":"Historial de cobros"}/>{visiblePayments.slice(0,14).map((payment)=><div className={`cash-row ${payment.status}`} key={payment.id}><div className={`activity-icon ${payment.status==="completed"?"ok":"neutral"}`}><CircleDollarSign/></div><div><strong>{payment.serviceName} · {payment.clientName}</strong><p>{paymentMethodLabel(payment.method)} · {formatDateTime(payment.createdAt)}{payment.reference?` · ${payment.reference}`:""}{payment.tipCents?` · propina ${money(payment.tipCents,currency)}`:""}</p>{payment.status==="voided"&&<small>Anulado: {payment.voidReason}</small>}</div><b className={payment.status==="completed"?"positive":"muted"}>{payment.status==="completed"?"+":""}{money(payment.amountCents,currency)}</b>{data?.canManage&&openSession?.id===payment.cashSessionId&&payment.status==="completed"&&<button className="ghost-icon" aria-label={`Anular cobro de ${payment.clientName}`} onClick={()=>void voidPayment(payment)}><Trash2 size={15}/></button>}</div>)}{!visiblePayments.length&&!loading&&<EmptyState text="Aún no hay cobros registrados."/>}</section>
    </div>
    {!!closedSessions.length&&<section className="panel cash-history"><div className="panel-title"><div><h2>Cierres anteriores</h2><p>Arqueos persistentes · pulsa para ver el desglose</p></div></div><div className="cash-history-grid">{closedSessions.slice(0,8).map((session)=>{const difference=(session.countedCashCents??0)-(session.expectedCashCents??0);return <div key={session.id} role="button" tabIndex={0} onClick={()=>setInspecting(session.id)} onKeyDown={(event)=>{if(event.key==="Enter")setInspecting(session.id)}}><span>{formatDateTime(session.closedAt??session.openedAt)}</span><strong>{money(session.countedCashCents??0,currency)}</strong><small className={difference===0?"positive":difference>0?"positive":"negative"}>{difference===0?"Cuadre exacto":`${difference>0?"Sobrante":"Faltante"}: ${money(Math.abs(difference),currency)}`}</small></div>})}</div></section>}
    {collecting&&<CashPaymentModal appointment={collecting} saving={saving} currency={currency} onClose={()=>setCollecting(null)} onSubmit={recordPayment}/>}
    {closing&&openSession&&<CashCloseModal expectedCashCents={expectedCash} summary={summary} openingAmountCents={openSession.openingAmountCents} saving={saving} currency={currency} onClose={()=>setClosing(false)} onSubmit={closeCash}/>}
    {closedReceipt&&<CashReceiptModal receipt={closedReceipt} currency={currency} onClose={()=>setClosedReceipt(null)}/>}
    {inspecting&&<CashSessionModal sessionId={inspecting} currency={currency} onClose={()=>setInspecting(null)}/>}
  </div>;
}

function Metric({icon,tone,label,value,trend}:{icon:React.ReactNode;tone:string;label:string;value:string;trend:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>}
function PanelTitle({title,subtitle}:{title:string;subtitle:string}){return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function EmptyState({text}:{text:string}){return <div className="empty"><p>{text}</p></div>}

function CashPaymentModal({appointment,saving,currency,onClose,onSubmit}:{appointment:CashAppointment;saving:boolean;currency:string;onClose:()=>void;onSubmit:(amountCents:number,tipCents:number,method:string,reference:string,promoCode:string)=>Promise<void>}){
  const [method,setMethod]=useState("efectivo");const [error,setError]=useState("");const remaining=appointment.totalCents-appointment.paidCents;
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    const amount=currencyInputToCents(form.get("amount"));const tip=currencyInputToCents(form.get("tip"));
    if(amount===null||amount<=0||amount>remaining||tip===null){setError("Revisa el monto y la propina.");return}
    setError("");try{await onSubmit(amount,tip,method,String(form.get("reference")??""),String(form.get("promoCode")??""))}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos registrar el cobro")}
  };
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-payment-title"><div className="modal-head"><div><span className="eyebrow">Cobro en silla</span><h2 id="cash-payment-title">Cobrar a {appointment.clientName}</h2><p>{appointment.serviceName} · saldo {money(remaining,currency)}</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}><div className="form-grid"><label>Monto<input name="amount" type="number" min="0.01" max={(remaining/100).toFixed(2)} step="0.01" defaultValue={(remaining/100).toFixed(2)} required/></label><label>Propina<input name="tip" type="number" min="0" step="0.01" defaultValue="0.00"/></label><label>Método<select value={method} onChange={(event)=>setMethod(event.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="pago_movil">Pago móvil</option></select></label><label>Código promo<input name="promoCode" maxLength={32} placeholder="Opcional"/></label><label className="wide">Referencia<input name="reference" maxLength={120} placeholder={method==="efectivo"?"No necesaria para efectivo":"Número o referencia del pago"}/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Registrando...":"Registrar cobro"}</button></div></form></div></div>;
}

function CashCloseModal({expectedCashCents,summary,openingAmountCents,saving,currency,onClose,onSubmit}:{expectedCashCents:number;summary:SessionSummary|null;openingAmountCents:number;saving:boolean;currency:string;onClose:()=>void;onSubmit:(countedCashCents:number,notes:string,countedBreakdown:Record<string,number>)=>Promise<void>}){
  const [error,setError]=useState("");
  const [counts,setCounts]=useState<Record<string,string>>({});
  const breakdownTotal=useMemo(()=>BILLS.reduce((sum,bill)=>sum+bill*(Number(counts[String(bill)])||0),0),[counts]);
  const [countedInput,setCountedInput]=useState((expectedCashCents/100).toFixed(2));
  const counted=Math.round(Number(countedInput||0)*100);
  const difference=counted-expectedCashCents;
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!Number.isFinite(counted)||counted<0){setError("Indica el efectivo contado.");return}
    const breakdown:Record<string,number>={};
    for (const bill of BILLS) { const qty=Number(counts[String(bill)]||0); if(qty>0) breakdown[String(bill)]=qty; }
    if(Object.keys(breakdown).length && breakdownTotal!==counted){setError("El conteo por billete no coincide con el efectivo contado.");return}
    setError("");
    try{await onSubmit(counted,String(new FormData(event.currentTarget).get("notes")??""),breakdown)}catch(reason){setError(reason instanceof Error?reason.message:"No pudimos cerrar la caja")}
  };
  const tone=difference===0?"even":difference>0?"over":"short";
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-close-title" style={{width:"min(720px,100%)"}}><div className="modal-head"><div><span className="eyebrow">Arqueo de cierre</span><h2 id="cash-close-title">Cerrar caja del turno</h2><p>Cuadra el cajón contra lo que el sistema espera en efectivo.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div><form onSubmit={submit}>
    <div className="cash-close-hero">
      <div><span>Fondo</span><strong>{money(openingAmountCents,currency)}</strong><small>Apertura</small></div>
      <div><span>Esperado</span><strong>{money(expectedCashCents,currency)}</strong><small>Fondo + efectivo − salidas</small></div>
      <div><span>Neto</span><strong>{money(summary?.netIncomeCents??0,currency)}</strong><small>{summary?`${summary.paymentCount} cobros · ${summary.saleCount} POS`: "Turno"}</small></div>
    </div>
    {summary&&<div className="cash-print-row"><span>Servicios {money(summary.serviceIncomeCents,currency)}</span><span>Productos {money(summary.productIncomeCents,currency)}</span><span>Propinas {money(summary.tipsCents,currency)}</span><span>Gastos {money(summary.expensesCents,currency)}</span><span>Reembolsos {money(summary.refundsCents,currency)}</span></div>}
    <div className="form-grid">
      <label className="wide">Efectivo contado en el cajón<input name="countedCash" type="number" min="0" max="1000000" step="0.01" value={countedInput} onChange={(event)=>setCountedInput(event.target.value)} required/></label>
    </div>
    <p className="eyebrow" style={{marginTop:12}}>Conteo opcional por billete</p>
    <div className="cash-denoms">{BILLS.map((bill)=><label key={bill}>{money(bill,currency)}<input type="number" min="0" step="1" value={counts[String(bill)]??""} onChange={(event)=>{const next={...counts,[String(bill)]:event.target.value};setCounts(next);const total=BILLS.reduce((sum,item)=>sum+item*(Number((item===bill?event.target.value:counts[String(item)])||0)),0);setCountedInput((total/100).toFixed(2))}}/></label>)}</div>
    <div className={`cash-difference ${tone}`}><span>{difference===0?"Cuadre exacto":difference>0?"Sobrante":"Faltante"}</span><strong>{money(Math.abs(difference),currency)}</strong></div>
    <label className="wide">Nota de cierre<textarea name="notes" maxLength={500} placeholder="Quién contó, incidencias, cambio dejado para mañana..."/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Volver</button><button className="primary" disabled={saving}>{saving?"Cerrando...":"Confirmar cierre"}</button></div>
  </form></div></div>;
}

function CashReceiptModal({receipt,currency,onClose}:{receipt:{expected:number;counted:number;difference:number;summary:SessionSummary};currency:string;onClose:()=>void}){
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal cash-session-print" role="dialog" aria-modal="true" aria-labelledby="cash-receipt-title"><div className="modal-head"><div><span className="eyebrow">Arqueo guardado</span><h2 id="cash-receipt-title">Cierre de caja</h2><p>Imprime o guarda este resumen con el turno.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div>
    <div className="cash-close-hero"><div><span>Esperado</span><strong>{money(receipt.expected,currency)}</strong></div><div><span>Contado</span><strong>{money(receipt.counted,currency)}</strong></div><div><span>{receipt.difference===0?"Cuadre":receipt.difference>0?"Sobrante":"Faltante"}</span><strong>{money(Math.abs(receipt.difference),currency)}</strong></div></div>
    <div className="cash-print-row"><span>Servicios</span><b>{money(receipt.summary.serviceIncomeCents,currency)}</b></div>
    <div className="cash-print-row"><span>Productos</span><b>{money(receipt.summary.productIncomeCents,currency)}</b></div>
    <div className="cash-print-row"><span>Propinas</span><b>{money(receipt.summary.tipsCents,currency)}</b></div>
    <div className="cash-print-row"><span>Gastos</span><b>{money(receipt.summary.expensesCents,currency)}</b></div>
    <div className="cash-print-row"><span>Reembolsos</span><b>{money(receipt.summary.refundsCents,currency)}</b></div>
    <div className="cash-print-row"><span>Neto</span><b>{money(receipt.summary.netIncomeCents,currency)}</b></div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Listo</button><button type="button" className="primary" onClick={()=>window.print()}><Printer size={15}/> Imprimir arqueo</button></div>
  </div></div>;
}

function CashSessionModal({sessionId,currency,onClose}:{sessionId:string;currency:string;onClose:()=>void}){
  const [detail,setDetail]=useState<SessionDetail|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    fetch(`/api/admin/cash?sessionId=${encodeURIComponent(sessionId)}`,{credentials:"same-origin"}).then(async(response)=>{
      const body=await readJsonObject(response);
      if(!response.ok)throw new Error(apiError(body,"No pudimos abrir el cierre"));
      if(!isJsonObject(body)||!isSessionSummary(body.summary)||!isJsonObject(body.movements)||!isJsonObject(body.session)) throw new Error("El cierre no es válido.");
      if(active) setDetail({session:body.session, summary:body.summary, movements:body.movements as SessionDetail["movements"], currency:typeof body.currency==="string"?body.currency:currency});
    }).catch((reason)=>{if(active)setError(reason instanceof Error?reason.message:"No pudimos abrir el cierre")});
    return()=>{active=false};
  },[sessionId,currency]);
  const counted=Number(detail?.session.countedCashCents??0);
  const expected=Number(detail?.session.expectedCashCents??0);
  const difference=counted-expected;
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className="modal cash-session-print" role="dialog" aria-modal="true" aria-labelledby="cash-session-title"><div className="modal-head"><div><span className="eyebrow">Historial de caja</span><h2 id="cash-session-title">Detalle del cierre</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {detail&&<>
      <div className="cash-close-hero"><div><span>Esperado</span><strong>{money(expected,detail.currency)}</strong></div><div><span>Contado</span><strong>{money(counted,detail.currency)}</strong></div><div><span>{difference===0?"Cuadre":difference>0?"Sobrante":"Faltante"}</span><strong>{money(Math.abs(difference),detail.currency)}</strong></div></div>
      <div className="cash-print-row"><span>Servicios</span><b>{money(detail.summary.serviceIncomeCents,detail.currency)}</b></div>
      <div className="cash-print-row"><span>Productos</span><b>{money(detail.summary.productIncomeCents,detail.currency)}</b></div>
      <div className="cash-print-row"><span>Propinas</span><b>{money(detail.summary.tipsCents,detail.currency)}</b></div>
      <div className="cash-print-row"><span>Gastos / reembolsos</span><b>{money(detail.summary.expensesCents+detail.summary.refundsCents,detail.currency)}</b></div>
      <div className="modal-actions"><a className="secondary" href={`/api/admin/cash?sessionId=${sessionId}&format=csv`}><Download size={15}/> CSV</a><button type="button" className="primary" onClick={()=>window.print()}><Printer size={15}/> Imprimir</button></div>
    </>}
  </div></div>;
}

function emptySummary(expectedCashCents:number):SessionSummary {
  return { serviceIncomeCents:0, productIncomeCents:0, tipsCents:0, expensesCents:0, refundsCents:0, grossIncomeCents:0, netIncomeCents:0, paymentCount:0, saleCount:0, expenseCount:0, refundCount:0, cashInflowCents:0, cashOutflowCents:0, expectedCashCents, methods:[] };
}
function currencyInputToCents(value:FormDataEntryValue|null){if(typeof value!=="string"||value.trim()==="")return null;const amount=Number(value);if(!Number.isFinite(amount)||amount<0)return null;const cents=Math.round(amount*100);return Number.isSafeInteger(cents)?cents:null}
function money(value:number,currency="USD"){return new Intl.NumberFormat("es-VE",{style:"currency",currency}).format(value/100)}
function formatShortDate(value:string){return new Intl.DateTimeFormat("es-VE",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`))}
function formatDateTime(value:string){return new Intl.DateTimeFormat("es-VE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}
function paymentLabel(value:string){return ({pendiente:"Pendiente",parcial:"Pago parcial",pagado:"Pagada"} as Record<string,string>)[value]??value}
function paymentMethodLabel(value:string){return ({efectivo:"Efectivo",tarjeta:"Tarjeta",transferencia:"Transferencia",pago_movil:"Pago móvil"} as Record<string,string>)[value]??value}
