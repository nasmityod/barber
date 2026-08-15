import { ensureDatabase } from "../../../../db/init";
import { errorResponse, getAdminContext, HttpError, cleanText } from "../../../security";

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("finance.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase(); const params = new URL(request.url).searchParams;
    const appointmentId = cleanText(params.get("appointmentId"), 80); const saleId = cleanText(params.get("saleId"), 80);
    if ((!appointmentId && !saleId) || (appointmentId && saleId)) throw new HttpError(400, "Recibo no válido.");
    const business = await db.prepare("SELECT name,currency FROM businesses WHERE id=?").bind(context.businessId).first<{name:string;currency:string}>();
    let receiptNumber = ""; let title = ""; let clientName = ""; let details = ""; let totalCents = 0; let tipCents = 0; let refundedCents = 0;
    if (appointmentId) {
      const row = await db.prepare(`SELECT a.id, a.total_cents AS totalCents, c.name AS clientName, s.name AS serviceName,
        p.name AS professionalName FROM appointments a JOIN clients c ON c.id=a.client_id AND c.business_id=a.business_id
        JOIN services s ON s.id=a.service_id AND s.business_id=a.business_id JOIN professionals p ON p.id=a.professional_id AND p.business_id=a.business_id
        WHERE a.id=? AND a.business_id=?`).bind(appointmentId, context.businessId).first<{id:string;totalCents:number;clientName:string;serviceName:string;professionalName:string}>();
      if (!row) throw new HttpError(404, "Cita no encontrada.");
      const payments = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS total, COALESCE(SUM(tip_cents),0) AS tips FROM payments WHERE appointment_id=? AND business_id=? AND status='completed'").bind(appointmentId, context.businessId).first<{total:number;tips:number}>();
      const refunds = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS total FROM refunds WHERE payment_id IN (SELECT id FROM payments WHERE appointment_id=? AND business_id=?) AND status='completed'").bind(appointmentId, context.businessId).first<{total:number}>();
      receiptNumber = `C-${appointmentId.slice(0,8).toUpperCase()}`; title = row.serviceName; clientName = row.clientName; details = `${row.serviceName} · ${row.professionalName}`; totalCents = payments?.total ?? row.totalCents; tipCents = payments?.tips ?? 0; refundedCents = refunds?.total ?? 0;
      await db.prepare(`INSERT OR IGNORE INTO receipts (id,business_id,receipt_number,appointment_id,snapshot,created_at) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.businessId, receiptNumber, appointmentId, JSON.stringify({ appointmentId, totalCents, tipCents }), new Date().toISOString()).run();
    } else {
      const row = await db.prepare("SELECT id,receipt_number AS receiptNumber,total_cents AS totalCents,tip_cents AS tipCents,client_id AS clientId FROM product_sales WHERE id=? AND business_id=?").bind(saleId, context.businessId).first<{id:string;receiptNumber:string;totalCents:number;tipCents:number;clientId:string|null}>();
      if (!row) throw new HttpError(404, "Venta POS no encontrada.");
      const client = row.clientId ? await db.prepare("SELECT name FROM clients WHERE id=? AND business_id=?").bind(row.clientId, context.businessId).first<{name:string}>() : null;
      const items = await db.prepare("SELECT product_name AS name,quantity,line_total_cents AS lineTotalCents FROM product_sale_items WHERE sale_id=? AND business_id=?").bind(saleId, context.businessId).all<{name:string;quantity:number;lineTotalCents:number}>();
      const refunds = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS total FROM refunds WHERE sale_id=? AND business_id=? AND status='completed'").bind(saleId, context.businessId).first<{total:number}>();
      receiptNumber = row.receiptNumber; title = "Venta de productos"; clientName = client?.name ?? "Cliente mostrador"; details = (items.results ?? []).map((item) => `${item.quantity}× ${item.name}`).join(" · "); totalCents = row.totalCents; tipCents = row.tipCents; refundedCents = refunds?.total ?? 0;
    }
    const currency = business?.currency ?? "USD"; const netCents = totalCents + tipCents - refundedCents; const businessName = escapeHtml(business?.name ?? "Corteza");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(receiptNumber)} · ${businessName}</title><style>body{font:15px Georgia,serif;color:#111;max-width:420px;margin:40px auto;padding:24px;background:#fff}header{border-bottom:3px solid #c6a15b;padding-bottom:18px}h1{margin:0 0 6px;font-size:22px;letter-spacing:.12em}p{color:#5c5c62;margin:5px 0}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #e4e4e7}.total{font-size:20px;font-weight:800;border:0}button{margin-top:24px;width:100%;padding:12px;border:0;border-radius:8px;background:#111;color:#c6a15b;font-weight:700}@media print{button{display:none}body{margin:0}}</style></head><body><header><h1>${businessName}</h1><p>Recibo ${escapeHtml(receiptNumber)}</p><p>${new Date().toLocaleString("es-VE")}</p></header><section><div class="row"><span>Cliente</span><strong>${escapeHtml(clientName)}</strong></div><div class="row"><span>Concepto</span><strong>${escapeHtml(title)}</strong></div><p>${escapeHtml(details)}</p><div class="row"><span>Subtotal</span><strong>${formatMoney(totalCents, currency)}</strong></div><div class="row"><span>Propina</span><strong>${formatMoney(tipCents, currency)}</strong></div>${refundedCents ? `<div class="row"><span>Reembolsado</span><strong>-${formatMoney(refundedCents, currency)}</strong></div>` : ""}<div class="row total"><span>Total neto</span><strong>${formatMoney(netCents, currency)}</strong></div></section><button onclick="window.print()">Imprimir recibo</button></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat("es-VE", { style: "currency", currency }).format(cents / 100); }
