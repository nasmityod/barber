import { ensureDatabase } from "../../../../db/init";
import { errorResponse, getAdminContext, HttpError } from "../../../security";

export async function GET() {
  try {
    const context = await getAdminContext("audit.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const [members, events] = await Promise.all([
      db.prepare(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
        FROM business_members WHERE business_id = ?`).bind(context.businessId).first(),
      db.prepare(`SELECT id, actor_email AS actorEmail, action, entity_type AS entityType,
        entity_id AS entityId, metadata, created_at AS createdAt
        FROM audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT 30`)
        .bind(context.businessId).all(),
    ]);
    return Response.json({
      posture: {
        authentication: "active", tenantIsolation: "active", roleAuthorization: "active",
        csrfProtection: "active", rateLimiting: "active", auditTrail: "active",
        securityHeaders: "active", atomicBookingLocks: "active",
      },
      members: members ?? { total: 0, active: 0, pending: 0, suspended: 0 },
      events: events.results ?? [],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
