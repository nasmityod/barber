import { ensureDatabase } from "../../../db/init";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PublicPaymentForm } from "../../components/PublicPaymentForm";
import { BrandMark } from "../../components/Brand";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const db = await ensureDatabase();
  const request = await db.prepare(`SELECT p.amount_cents AS amountCents,p.deposit_cents AS depositCents,p.provider,p.checkout_url AS checkoutUrl,p.status,p.expires_at AS expiresAt,(julianday(p.expires_at) <= julianday('now')) AS expired,c.name AS clientName,b.name AS businessName
    FROM payment_requests p JOIN businesses b ON b.id=p.business_id LEFT JOIN clients c ON c.id=p.client_id AND c.business_id=p.business_id WHERE p.token=?`).bind(token).first<{ amountCents:number;depositCents:number;provider:string;checkoutUrl:string;status:string;expiresAt:string;clientName:string|null;businessName:string;expired?:number }>();
  if (!request) notFound();
  const expired = !["pending", "submitted"].includes(request.status) || Boolean(request.expired);
  return <main className="public-payment"><div className="public-payment-card">
    <header className="client-portal-head">
      <div className="booking-brand"><BrandMark /><div><strong>{request.businessName.toUpperCase()}</strong><small>Depósito de reserva</small></div></div>
      <ShieldCheck />
    </header>
    <h1>{expired ? "Solicitud no disponible" : "Confirma tu reserva"}</h1>
    {request.clientName && <p className="client-portal-intro">Hola, {request.clientName}. Para confirmar tu espacio registra el depósito solicitado.</p>}
    {expired ? <div className="payment-expired">Esta solicitud está {request.status === "pending" ? "vencida" : request.status === "paid" ? "confirmada" : "cerrada"}.</div> : <>
      <div className="payment-amount"><span>Depósito solicitado</span><strong>{money(request.depositCents)}</strong><small>Total de la reserva: {money(request.amountCents)}</small></div>
      {request.checkoutUrl ? <a className="primary payment-link" href={request.checkoutUrl} target="_blank" rel="noreferrer">Pagar con {providerLabel(request.provider)}</a> : <div className="payment-instructions"><strong>Depósito manual</strong><p>Contacta a la barbería para recibir los datos de transferencia o pago móvil y luego informa la referencia.</p><PublicPaymentForm token={token} /></div>}
      {request.status === "submitted" && <p className="payment-pending">Comprobante enviado; queda pendiente de verificación.</p>}
      <small className="payment-security"><ShieldCheck size={14} /> No compartas este enlace. Caduca automáticamente en 7 días.</small>
    </>}
  </div></main>;
}

function money(cents:number) { return new Intl.NumberFormat("es-VE", { style:"currency", currency:"USD" }).format(cents/100); }
function providerLabel(provider:string) { return ({ stripe:"Stripe", mercadopago:"Mercado Pago", paypal:"PayPal" } as Record<string,string>)[provider] ?? "tu proveedor"; }
