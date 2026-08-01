import { ensureDatabase } from "../../../../db/init";
import { setMemberPassword } from "../../../auth";
import {
  assertSameOrigin, cleanText, errorResponse, getAdminContext, HttpError,
  isEmail, normalizeEmail, readJson, writeAudit, type AdminRole,
} from "../../../security";

type MemberPayload = { email?: unknown; displayName?: unknown; password?:unknown; role?: unknown; memberId?: unknown; status?: unknown };

export async function GET() {
  try {
    const context = await getAdminContext("members.manage");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const rows = await db.prepare(`SELECT id, email, display_name AS displayName, role, status,
      created_at AS createdAt, last_seen_at AS lastSeenAt
      FROM business_members WHERE business_id = ?
      ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, email`)
      .bind(context.businessId).all();
    return Response.json({ members: rows.results ?? [], currentRole: context.role }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("members.manage");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<MemberPayload>(request);
    const email = normalizeEmail(body.email);
    const role = cleanText(body.role, 20) as AdminRole;
    const password = cleanText(body.password, 128);
    if (!isEmail(email) || password.length < 10 || !/[A-Za-z]/u.test(password) || !/\d/u.test(password) || !["admin", "reception", "professional"].includes(role)) {
      throw new HttpError(400, "Email o rol no válido.");
    }
    if (role === "admin" && context.role !== "owner") throw new HttpError(403, "Solo el propietario puede invitar administradores.");
    const db = await ensureDatabase();
    const id = crypto.randomUUID();
    const userId = `local:${crypto.randomUUID()}`;
    try {
      await db.prepare(`INSERT INTO business_members
        (id,business_id,user_id,email,display_name,role,status,invited_by,created_at)
        VALUES (?,?,?,?,?,?,'active',?,?)`)
        .bind(id, context.businessId, userId, email, cleanText(body.displayName, 100), role, context.user.userId, new Date().toISOString()).run();
      await setMemberPassword(db, id, password, true);
    } catch (error) {
      await db.prepare("DELETE FROM business_members WHERE id = ? AND business_id = ? AND user_id = ?")
        .bind(id, context.businessId, userId).run();
      if ((error instanceof Error ? error.message : "").includes("UNIQUE")) throw new HttpError(409, "Ese email ya pertenece al equipo.");
      throw error;
    }
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "member.invited", entityType: "business_member", entityId: id, metadata: { role } });
    return Response.json({ id, message: "Acceso creado" }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("members.manage");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<MemberPayload>(request);
    const memberId = cleanText(body.memberId, 80);
    const role = cleanText(body.role, 20) as AdminRole;
    const status = cleanText(body.status, 20);
    if (!memberId || !["admin", "reception", "professional"].includes(role) || !["active", "suspended", "pending"].includes(status)) {
      throw new HttpError(400, "Cambio de acceso no válido.");
    }
    const db = await ensureDatabase();
    const target = await db.prepare("SELECT role, user_id AS userId FROM business_members WHERE id = ? AND business_id = ?")
      .bind(memberId, context.businessId).first<{ role: string; userId: string | null }>();
    if (!target) throw new HttpError(404, "Miembro no encontrado.");
    if (target.role === "owner") throw new HttpError(403, "La cuenta propietaria no se puede modificar aquí.");
    if ((role === "admin" || target.role === "admin") && context.role !== "owner") throw new HttpError(403, "Solo el propietario puede modificar administradores.");
    if (target.userId === context.user.userId) throw new HttpError(403, "No puedes cambiar tu propio acceso.");
    await db.prepare("UPDATE business_members SET role = ?, status = ? WHERE id = ? AND business_id = ?")
      .bind(role, status, memberId, context.businessId).run();
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "member.access_updated", entityType: "business_member", entityId: memberId, metadata: { role, status } });
    return Response.json({ message: "Acceso actualizado" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
