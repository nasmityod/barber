import { changePassword, getSessionUserFromRequest } from "../../../auth";
import { assertSameOrigin, cleanText, errorResponse, HttpError, readJson, writeAudit } from "../../../security";
import { ensureDatabase } from "../../../../db/init";

type PasswordPayload = { currentPassword?:unknown; newPassword?:unknown };

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUserFromRequest(request);
    if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<PasswordPayload>(request, 4096);
    const currentPassword = cleanText(body.currentPassword, 128);
    const newPassword = cleanText(body.newPassword, 128);
    if (newPassword.length < 10 || !/[A-Za-z]/u.test(newPassword) || !/\d/u.test(newPassword)) {
      throw new HttpError(400, "Usa al menos 10 caracteres e incluye letras y números.");
    }
    if (!(await changePassword(user, currentPassword, newPassword))) throw new HttpError(401, "La contraseña actual no es correcta.");
    const db = await ensureDatabase();
    await writeAudit(db, { businessId:user.businessId, user, action:"auth.password_changed", entityType:"business_member", entityId:user.memberId });
    return Response.json({ ok:true }, { headers:{ "cache-control":"no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
