import { headers } from "next/headers";
import { ensureDatabase } from "../db/init";

const SESSION_COOKIE = "corteza_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const PASSWORD_ITERATIONS = 210_000;

export type AuthUser = {
  userId: string;
  memberId: string;
  businessId: string;
  displayName: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
};

type CredentialRow = {
  userId: string;
  memberId: string;
  businessId: string;
  displayName: string;
  email: string;
  role: string;
  mustChangePassword: number;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  failedAttempts: number;
  lockedUntil: string | null;
};

export async function getSessionUser(): Promise<AuthUser | null> {
  const requestHeaders = await headers();
  return getSessionUserFromCookie(requestHeaders.get("cookie"));
}

export async function getSessionUserFromRequest(request: Request): Promise<AuthUser | null> {
  return getSessionUserFromCookie(request.headers.get("cookie"));
}

async function getSessionUserFromCookie(cookieHeader: string | null): Promise<AuthUser | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,80}$/u.test(token)) return null;
  const db = await ensureDatabase();
  const tokenHash = await sha256Hex(token);
  const session = await db.prepare(`SELECT m.user_id AS userId, m.id AS memberId,
      m.business_id AS businessId, m.display_name AS displayName, m.email, m.role,
      c.must_change_password AS mustChangePassword
    FROM auth_sessions s
    JOIN business_members m ON m.id = s.member_id AND m.business_id = s.business_id
    JOIN auth_credentials c ON c.member_id = m.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND m.status = 'active'
    LIMIT 1`).bind(tokenHash, new Date().toISOString()).first<{
      userId:string;memberId:string;businessId:string;displayName:string;email:string;role:string;mustChangePassword:number;
    }>();
  if (!session) return null;
  return { ...session, displayName: session.displayName || session.email, mustChangePassword: session.mustChangePassword === 1 };
}

export async function authenticatePassword(email: string, password: string) {
  const db = await ensureDatabase();
  const credential = await db.prepare(`SELECT m.user_id AS userId, m.id AS memberId,
      m.business_id AS businessId, m.display_name AS displayName, m.email, m.role,
      c.password_hash AS passwordHash, c.password_salt AS passwordSalt,
      c.password_iterations AS passwordIterations, c.must_change_password AS mustChangePassword,
      c.failed_attempts AS failedAttempts, c.locked_until AS lockedUntil
    FROM business_members m JOIN auth_credentials c ON c.member_id = m.id
    WHERE lower(m.email) = ? AND m.status = 'active' LIMIT 1`)
    .bind(email.trim().toLowerCase()).first<CredentialRow>();

  if (!credential) {
    await derivePasswordHash(password, "00000000000000000000000000000000", PASSWORD_ITERATIONS);
    return null;
  }
  if (credential.lockedUntil && credential.lockedUntil > new Date().toISOString()) return null;
  const candidate = await derivePasswordHash(password, credential.passwordSalt, credential.passwordIterations);
  if (!constantTimeHexEqual(candidate, credential.passwordHash)) {
    const failures = credential.failedAttempts + 1;
    const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await db.prepare("UPDATE auth_credentials SET failed_attempts = ?, locked_until = ? WHERE member_id = ?")
      .bind(failures >= 5 ? 0 : failures, lockedUntil, credential.memberId).run();
    return null;
  }
  await db.batch([
    db.prepare("UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL WHERE member_id = ?").bind(credential.memberId),
    db.prepare("UPDATE business_members SET last_seen_at = ? WHERE id = ?").bind(new Date().toISOString(), credential.memberId),
  ]);
  return {
    userId: credential.userId,
    memberId: credential.memberId,
    businessId: credential.businessId,
    displayName: credential.displayName || credential.email,
    email: credential.email,
    role: credential.role,
    mustChangePassword: credential.mustChangePassword === 1,
  } satisfies AuthUser;
}

export async function createSession(user: AuthUser, request: Request) {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  const token = base64Url(bytes);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  const db = await ensureDatabase();
  await db.batch([
    db.prepare(`INSERT INTO auth_sessions
      (token_hash,member_id,business_id,created_at,expires_at,last_seen_at)
      VALUES (?,?,?,?,?,?)`).bind(await sha256Hex(token), user.memberId, user.businessId, now.toISOString(), expires.toISOString(), now.toISOString()),
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now.toISOString()),
  ]);
  return sessionCookie(token, request, SESSION_MAX_AGE_SECONDS);
}

export async function destroySession(request: Request) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    const db = await ensureDatabase();
    await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  }
  return sessionCookie("", request, 0);
}

export async function setMemberPassword(db: D1Database, memberId: string, password: string, mustChangePassword: boolean) {
  const saltBytes = new Uint8Array(16); crypto.getRandomValues(saltBytes);
  const salt = hex(saltBytes);
  const passwordHash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  await db.prepare(`INSERT INTO auth_credentials
    (member_id,password_hash,password_salt,password_iterations,must_change_password,password_updated_at,failed_attempts)
    VALUES (?,?,?,?,?,?,0)
    ON CONFLICT(member_id) DO UPDATE SET password_hash=excluded.password_hash,
      password_salt=excluded.password_salt,password_iterations=excluded.password_iterations,
      must_change_password=excluded.must_change_password,password_updated_at=excluded.password_updated_at,
      failed_attempts=0,locked_until=NULL`)
    .bind(memberId, passwordHash, salt, PASSWORD_ITERATIONS, mustChangePassword ? 1 : 0, new Date().toISOString()).run();
}

export async function createPasswordResetToken(db: D1Database, memberId: string, businessId: string) {
  const raw = new Uint8Array(32); crypto.getRandomValues(raw);
  const token = base64Url(raw);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM password_reset_tokens WHERE member_id = ? OR expires_at <= ?").bind(memberId, now.toISOString()),
    db.prepare("INSERT INTO password_reset_tokens (token_hash,member_id,business_id,expires_at,created_at) VALUES (?,?,?,?,?)")
      .bind(await sha256Hex(token), memberId, businessId, expires, now.toISOString()),
  ]);
  return { token, expiresAt: expires };
}

export async function resetPasswordWithToken(db: D1Database, token: string, newPassword: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/u.test(token)) return null;
  const row = await db.prepare(`SELECT token_hash AS tokenHash, member_id AS memberId, business_id AS businessId
    FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? LIMIT 1`)
    .bind(await sha256Hex(token), new Date().toISOString()).first<{ tokenHash:string;memberId:string;businessId:string }>();
  if (!row) return null;
  await setMemberPassword(db, row.memberId, newPassword, false);
  await db.batch([
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").bind(new Date().toISOString(), row.tokenHash),
    db.prepare("DELETE FROM auth_sessions WHERE member_id = ?").bind(row.memberId),
  ]);
  return { memberId: row.memberId, businessId: row.businessId };
}

export async function changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
  const verified = await authenticatePassword(user.email, currentPassword);
  if (!verified || verified.memberId !== user.memberId) return false;
  const db = await ensureDatabase();
  await setMemberPassword(db, user.memberId, newPassword, false);
  return true;
}

export async function derivePasswordHash(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:fromHex(saltHex), iterations }, key, 256);
  return hex(new Uint8Array(bits));
}

function readCookie(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function sessionCookie(value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function constantTimeHexEqual(left: string, right: string) {
  const leftBytes = fromHex(left.padEnd(64, "0").slice(0, 64));
  const rightBytes = fromHex(right.padEnd(64, "0").slice(0, 64));
  let difference = left.length === right.length ? 0 : 1;
  for (let index = 0; index < leftBytes.length; index++) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function hex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function fromHex(value: string) { return Uint8Array.from(value.match(/.{1,2}/gu) ?? [], (byte) => Number.parseInt(byte, 16)); }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, ""); }
