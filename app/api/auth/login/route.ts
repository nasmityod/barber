import { authenticatePassword, createSession } from "../../../auth";
import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, clientAddress, cleanText, enforceRateLimit, errorResponse,
  HttpError, isEmail, normalizeEmail, readJson, sha256, writeAudit,
} from "../../../security";

type LoginPayload = { email?:unknown; password?:unknown };

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<LoginPayload>(request, 4096);
    const email = normalizeEmail(body.email);
    const password = cleanText(body.password, 128);
    if (!isEmail(email) || password.length < 8) throw new HttpError(400, "Revisa el correo y la contraseña.");
    const db = await ensureDatabase();
    const addressHash = await sha256(`${new Date().toISOString().slice(0,10)}:${clientAddress(request)}`);
    await enforceRateLimit(db, `login:${addressHash}`, 10, 15 * 60 * 1000);
    const user = await authenticatePassword(email, password);
    if (!user) throw new HttpError(401, "Correo o contraseña incorrectos.");
    const cookie = await createSession(user, request);
    await writeAudit(db, { businessId:user.businessId, user, action:"auth.login", entityType:"auth_session", metadata:{ method:"password" } });
    return Response.json({ ok:true, mustChangePassword:user.mustChangePassword }, { headers:{ "set-cookie":cookie, "cache-control":"no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
