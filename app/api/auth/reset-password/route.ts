import { ensureDatabase } from "../../../../db/init";
import { resetPasswordWithToken } from "../../../auth";
import { assertSameOrigin, cleanText, errorResponse, HttpError, readJson, writeAudit } from "../../../security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const body = await readJson<{ token?: unknown; password?: unknown }>(request, 4_096);
    const token = cleanText(body.token, 100); const password = cleanText(body.password, 128);
    if (password.length < 10 || !/[A-Za-z]/u.test(password) || !/\d/u.test(password)) throw new HttpError(400, "Usa al menos 10 caracteres e incluye letras y números.");
    const db = await ensureDatabase(); const result = await resetPasswordWithToken(db, token, password);
    if (!result) throw new HttpError(400, "El enlace no es válido, ya fue usado o venció.");
    await writeAudit(db, { businessId: result.businessId, action: "auth.password_reset", entityType: "auth_credential", entityId: result.memberId });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
