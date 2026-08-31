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
    const currency = business?.currency ?? "USD"; const netCents = totalCents + tipCents - refundedCents;
    const businessName = escapeHtml(business?.name ?? "787 Barber Studio");
    const issuedAt = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
    const rows = [
      ["Cliente", escapeHtml(clientName)],
      ["Concepto", escapeHtml(title)],
      ["Subtotal", formatMoney(totalCents, currency)],
      ["Propina", formatMoney(tipCents, currency)],
      ...(refundedCents ? [["Reembolsado", `-${formatMoney(refundedCents, currency)}`]] : []),
    ].map(([label, value]) => `<div class="row"><span>${label}</span><strong>${value}</strong></div>`).join("");
    /* Recibo sobrio: debe leerse igual en pantalla, en blanco y negro y en una
       impresora térmica. Sin imágenes: sólo tipografía, filete y cifras. */
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo ${escapeHtml(receiptNumber)} · ${businessName}</title><style>
:root{--ink:#101014;--muted:#6b6a72;--line:#d6d2c9;--gold:#c79a2b;--red:#d71e1e}
*{box-sizing:border-box}
body{margin:0;padding:40px 20px;background:#f3f2ef;color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{max-width:420px;margin:0 auto;padding:32px 28px;background:#fff;border:1px solid var(--line);border-radius:12px}
.rule{height:3px;margin-bottom:22px;background:repeating-linear-gradient(90deg,var(--gold) 0 28px,var(--ink) 28px 60px,var(--red) 60px 88px)}
h1{margin:0;font-size:19px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
.meta{margin-top:10px;display:flex;justify-content:space-between;gap:12px;font-family:ui-monospace,"SFMono-Regular",monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.detail{margin:18px 0 4px;font-size:13px;color:var(--muted)}
section{margin-top:22px;border-top:1px solid var(--line)}
.row{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px dashed var(--line);font-size:14px}
.row span{color:var(--muted)}
.row strong{font-family:ui-monospace,"SFMono-Regular",monospace;font-variant-numeric:tabular-nums;font-weight:600;text-align:right}
.total{border-bottom:0;padding-top:16px;margin-top:6px;border-top:2px solid var(--ink);font-size:17px}
.total span{color:var(--ink);font-weight:600}
.total strong{font-size:21px}
footer{margin-top:22px;padding-top:14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted);line-height:1.5}
button{margin:22px auto 0;display:block;width:100%;max-width:420px;height:44px;border:0;border-radius:9px;background:var(--ink);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
@media print{body{margin:0;padding:0;background:#fff}.sheet{max-width:none;border:0;border-radius:0;padding:0}button{display:none}}
</style></head><body><div class="sheet"><div class="rule"></div><header><h1>${businessName}</h1><div class="meta"><span>Recibo ${escapeHtml(receiptNumber)}</span><span>${escapeHtml(issuedAt)}</span></div></header><p class="detail">${escapeHtml(details)}</p><section>${rows}<div class="row total"><span>Total neto</span><strong>${formatMoney(netCents, currency)}</strong></div></section><footer>Documento generado por el sistema de 787 Barber Studio. Conserva este comprobante para cualquier aclaratoria.</footer></div><button type="button" onclick="window.print()">Imprimir recibo</button></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat("es-VE", { style: "currency", currency }).format(cents / 100); }
