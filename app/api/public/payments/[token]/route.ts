import { ensureDatabase } from "../../../../../db/init";
import { assertSameOrigin, cleanText, clientAddress, enforceRateLimit, errorResponse, HttpError, readJson, sha256 } from "../../../../security";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request); const { token } = await params; const body = await readJson<{ reference?: unknown }>(request, 4_096); const reference = cleanText(body.reference, 120);
    if (reference.length < 3) throw new HttpError(400, "Escribe la referencia del depósito.");
    const db = await ensureDatabase(); await enforceRateLimit(db, `public-payment:${await sha256(`${clientAddress(request)}:${token}`)}`, 10, 15 * 60 * 1000);
    const row = await db.prepare("SELECT id,business_id AS businessId,status,expires_at AS expiresAt FROM payment_requests WHERE token=? LIMIT 1").bind(token).first<{ id:string;businessId:string;status:string;expiresAt:string }>();
    if (!row || row.expiresAt <= new Date().toISOString() || !["pending", "submitted"].includes(row.status)) throw new HttpError(400, "Esta solicitud ya no está disponible.");
    await db.batch([
      db.prepare("UPDATE payment_requests SET status='submitted',reference=? WHERE id=? AND status IN ('pending','submitted')").bind(reference, row.id),
      db.prepare("INSERT INTO alerts (id,business_id,kind,title,message,severity,created_at) VALUES (?,?, 'payment_submitted','Depósito por verificar',?,'warning',?)").bind(crypto.randomUUID(), row.businessId, `Se recibió el comprobante ${reference}. Verifica el pago antes de confirmarlo.`, new Date().toISOString()),
    ]);
    return Response.json({ ok: true, status: "submitted" }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
