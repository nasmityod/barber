import { ensureDatabase } from "../db/init";
import { ADMIN_USER, type AdminUser } from "./admin-user";

export type AdminRole = "owner" | "admin" | "reception" | "professional";
export type Permission =
  | "appointments.read"
  | "appointments.write"
  | "clients.read"
  | "finance.read"
  | "settings.write"
  | "members.manage"
  | "audit.read";

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  owner: ["appointments.read", "appointments.write", "clients.read", "finance.read", "settings.write", "members.manage", "audit.read"],
  admin: ["appointments.read", "appointments.write", "clients.read", "finance.read", "settings.write", "members.manage", "audit.read"],
  reception: ["appointments.read", "appointments.write", "clients.read"],
  professional: ["appointments.read"],
};

export type AdminContext = {
  user: AdminUser;
  businessId: string;
  businessName: string;
  businessSlug: string;
  timezone: string;
  role: AdminRole;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function hasPermission(role: AdminRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function getAdminContext(permission?: Permission): Promise<AdminContext | null> {
  const user = ADMIN_USER;

  const db = await ensureDatabase();
  const now = new Date().toISOString();
  const email = normalizeEmail(user.email);

  // A pending invitation becomes active only when the signed identity's email matches.
  await db.prepare(`UPDATE business_members
    SET user_id = ?, status = 'active', display_name = ?, last_seen_at = ?
    WHERE lower(email) = ? AND user_id IS NULL AND status = 'pending'`)
    .bind(user.userId, cleanText(user.displayName, 100), now, email).run();

  let member = await findMembership(db, user.userId);

  // Secure one-time bootstrap for a new private installation. The conditional
  // INSERT is atomic: only the first authenticated visitor can become owner.
  if (!member) {
    const business = await db.prepare("SELECT id FROM businesses ORDER BY id LIMIT 1").first<{ id: string }>();
    if (business) {
      await db.prepare(`INSERT OR IGNORE INTO business_members
        (id,business_id,user_id,email,display_name,role,status,created_at,last_seen_at)
        SELECT ?,?,?,?,?, 'owner','active',?,?
        WHERE NOT EXISTS (SELECT 1 FROM business_members WHERE status = 'active')`)
        .bind(crypto.randomUUID(), business.id, user.userId, email, cleanText(user.displayName, 100), now, now).run();
      member = await findMembership(db, user.userId);
      if (member) {
        await writeAudit(db, {
          businessId: member.businessId,
          user,
          action: "security.owner_bootstrapped",
          entityType: "business_member",
          entityId: user.userId,
          metadata: { method: "first_authenticated_private_user" },
        });
      }
    }
  }

  if (!member) throw new HttpError(403, "Tu cuenta no tiene acceso a este negocio.");
  if (!isRole(member.role)) throw new HttpError(403, "El rol asignado no es válido.");
  if (permission && !hasPermission(member.role, permission)) {
    throw new HttpError(403, "No tienes permiso para realizar esta acción.");
  }

  await db.prepare("UPDATE business_members SET last_seen_at = ?, display_name = ? WHERE id = ?")
    .bind(now, cleanText(user.displayName, 100), member.id).run();

  return {
    user,
    businessId: member.businessId,
    businessName: member.businessName,
    businessSlug: member.businessSlug,
    timezone: member.timezone,
    role: member.role,
  };
}

type MembershipRow = {
  id: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  timezone: string;
  role: string;
};

async function findMembership(db: D1Database, userId: string) {
  return db.prepare(`SELECT m.id, m.business_id AS businessId, m.role,
      b.name AS businessName, b.slug AS businessSlug, b.timezone
    FROM business_members m
    JOIN businesses b ON b.id = m.business_id
    WHERE m.user_id = ? AND m.status = 'active'
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1`).bind(userId).first<MembershipRow>();
}

function isRole(value: string): value is AdminRole {
  return value === "owner" || value === "admin" || value === "reception" || value === "professional";
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "Solicitud rechazada por seguridad.");
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new HttpError(403, "Origen no válido.");
  }
  if (originUrl.host !== host) throw new HttpError(403, "Origen no autorizado.");
}

export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(415, "Se requiere contenido JSON.");
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new HttpError(413, "Solicitud demasiado grande.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) throw new HttpError(413, "Solicitud demasiado grande.");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "JSON no válido.");
  }
}

export function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

export function normalizeEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

export function isPhone(value: string) {
  return /^\+?[0-9][0-9 ()-]{6,24}$/u.test(value);
}

export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function weekdayForDate(date: string, timezone: string) {
  const noon = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(noon);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(db: D1Database, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs * 2;
  const row = await db.prepare(`INSERT INTO rate_limits (key,window_start,count,expires_at)
    VALUES (?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
      window_start = excluded.window_start,
      expires_at = excluded.expires_at
    RETURNING count`).bind(key, windowStart, expiresAt).first<{ count: number }>();
  if ((row?.count ?? limit + 1) > limit) {
    throw new HttpError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
  }
}

export function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "local";
}

export async function writeAudit(db: D1Database, input: {
  businessId: string;
  user?: AdminUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await db.prepare(`INSERT INTO audit_logs
    (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(), input.businessId, input.user?.userId ?? null,
      input.user?.email ?? null, input.action, input.entityType, input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}), new Date().toISOString(),
    ).run();
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  console.error("Unhandled route error", error instanceof Error ? error.message : error);
  return Response.json({ error: "No pudimos completar la solicitud." }, { status: 500, headers: { "cache-control": "no-store" } });
}
