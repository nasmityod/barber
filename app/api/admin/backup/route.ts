import { ensureDatabase } from "../../../../db/init";
import { errorResponse, getAdminContext, HttpError } from "../../../security";

const TABLES = ["businesses", "business_settings", "services", "professionals", "professional_services", "clients", "appointments", "day_queue_entries", "business_hours", "time_blocks", "cash_sessions", "payments", "products", "product_sales", "product_sale_items", "inventory_movements", "expenses", "refunds", "commission_rules", "commission_batches", "commissions", "receipts", "promotions", "loyalty_accounts", "loyalty_transactions", "reviews", "gallery_items", "waitlist_entries", "message_logs", "payment_requests", "business_members", "audit_logs", "subscriptions", "terms_acceptances", "alerts"] as const;

export async function GET() {
  try {
    const context = await getAdminContext("audit.read"); if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase(); const data: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const query = table === "businesses" ? "SELECT * FROM businesses WHERE id=?" : `SELECT * FROM ${table} WHERE business_id=?`;
      const rows = await db.prepare(query).bind(context.businessId).all(); data[table] = rows.results ?? [];
    }
    /* Los respaldos anteriores a la marca 787 llevan format "corteza-backup";
       un futuro importador debe aceptar ambos. */
    const payload = JSON.stringify({ format: "787-backup", version: 1, exportedAt: new Date().toISOString(), businessId: context.businessId, data });
    return new Response(payload, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="787-${context.businessSlug}-backup.json"`, "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
