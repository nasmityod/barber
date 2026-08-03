import { ensureDatabase } from "../../../../db/init";
import { createPasswordResetToken } from "../../../auth";
import { assertSameOrigin, clientAddress, enforceRateLimit, errorResponse, isEmail, normalizeEmail, readJson, sha256 } from "../../../security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ email?: unknown }>(request, 2_048); const email = normalizeEmail(body.email);
    const db = await ensureDatabase(); await enforceRateLimit(db, `forgot:${await sha256(clientAddress(request))}`, 5, 15 * 60 * 1000);
    let resetUrl: string | undefined;
    if (isEmail(email)) {
      const member = await db.prepare("SELECT id,business_id AS businessId FROM business_members WHERE lower(email)=? AND status='active' LIMIT 1").bind(email).first<{ id:string;businessId:string }>();
      if (member) { const reset = await createPasswordResetToken(db, member.id, member.businessId); const hostname = new URL(request.url).hostname; if ((hostname === "localhost" || hostname === "127.0.0.1") && request.headers.get("x-corteza-local-recovery") === "1") resetUrl = `/restablecer-clave?token=${encodeURIComponent(reset.token)}`; }
    }
    const payload: { ok:boolean; resetUrl?:string } = { ok: true }; if (resetUrl) payload.resetUrl = resetUrl;
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
