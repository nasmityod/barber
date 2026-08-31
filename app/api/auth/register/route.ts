import { ensureDatabase } from "../../../../db/init";
import { createSession, setMemberPassword } from "../../../auth";
import {
  assertSameOrigin, cleanText, clientAddress, enforceRateLimit, errorResponse, HttpError,
  isEmail, normalizeEmail, readJson, sha256,
} from "../../../security";

type RegisterPayload = { businessName?: unknown; slug?: unknown; displayName?: unknown; email?: unknown; password?: unknown; planId?: unknown; acceptedTerms?: unknown };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<RegisterPayload>(request, 8_192);
    const email = normalizeEmail(body.email); const password = cleanText(body.password, 128);
    const businessName = cleanText(body.businessName, 100); const displayName = cleanText(body.displayName, 100);
    const requestedSlug = cleanText(body.slug, 50).toLowerCase().replace(/[^a-z0-9-]/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
    const planId = ["free", "pro", "business"].includes(String(body.planId)) ? String(body.planId) : "free";
    if (businessName.length < 2 || displayName.length < 2 || !isEmail(email) || password.length < 10 || !/[A-Za-z]/u.test(password) || !/\d/u.test(password)) {
      throw new HttpError(400, "Revisa el negocio, el correo y la contraseña. Usa al menos 10 caracteres con letras y números.");
    }
    if (body.acceptedTerms !== true && body.acceptedTerms !== "true" && body.acceptedTerms !== "on") throw new HttpError(400, "Debes aceptar los términos y la política de privacidad.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `register:${await sha256(clientAddress(request))}`, 5, 60 * 60 * 1000);
    const slug = requestedSlug || slugFromName(businessName);
    const existing = await db.prepare("SELECT id FROM businesses WHERE slug = ?").bind(slug).first();
    if (existing) throw new HttpError(409, "Ese enlace de negocio ya está ocupado. Elige otro.");
    const plan = await db.prepare("SELECT id FROM plans WHERE id = ? AND active = 1").bind(planId).first<{ id:string }>();
    if (!plan) throw new HttpError(400, "El plan seleccionado no está disponible.");
    const now = new Date(); const nowIso = now.toISOString(); const businessId = crypto.randomUUID(); const memberId = crypto.randomUUID();
    const userId = `local:${crypto.randomUUID()}`; const serviceId = crypto.randomUUID(); const professionalId = crypto.randomUUID();
    const subscriptionId = crypto.randomUUID(); const trialEnd = new Date(now.getTime() + 14 * 86_400_000).toISOString();
    const ipHash = await sha256(clientAddress(request));
    try {
      await db.batch([
        db.prepare("INSERT INTO businesses (id,name,slug,timezone,currency,owner_email,created_at) VALUES (?,?,?,'America/Caracas','USD',?,?)").bind(businessId, businessName, slug, email, nowIso),
        db.prepare("INSERT INTO business_members (id,business_id,user_id,email,display_name,role,status,created_at) VALUES (?,?,?,?,?,'owner','active',?)").bind(memberId, businessId, userId, email, displayName, nowIso),
        db.prepare("INSERT INTO subscriptions (id,business_id,plan_id,status,provider,current_period_start,current_period_end,created_at) VALUES (?,?,?,'trialing','manual',?,?,?)").bind(subscriptionId, businessId, planId, nowIso, trialEnd, nowIso),
        db.prepare("INSERT INTO services (id,business_id,name,category,duration_minutes,price_cents,active) VALUES (?,?,?,'Cortes',30,1500,1)").bind(serviceId, businessId, "Corte clásico"),
        db.prepare("INSERT INTO professionals (id,business_id,name,specialty,email,phone,active) VALUES (?,?,?,'Corte y barbería',?, '',1)").bind(professionalId, businessId, displayName, email),
        db.prepare("INSERT INTO professional_services (business_id,professional_id,service_id) VALUES (?,?,?)").bind(businessId, professionalId, serviceId),
        db.prepare("INSERT INTO terms_acceptances (id,member_id,business_id,version,ip_hash,accepted_at) VALUES (?,?,?,'2026-08-01',?,?)").bind(crypto.randomUUID(), memberId, businessId, ipHash, nowIso),
        db.prepare("INSERT INTO alerts (id,business_id,kind,title,message,severity,created_at) VALUES (?,?, 'welcome','Bienvenido a 787 Barber Studio','Configura tus horarios y comparte tu enlace de reservas.','info',?)").bind(crypto.randomUUID(), businessId, nowIso),
        db.prepare("INSERT INTO business_hours (id,business_id,professional_id,weekday,start_time,end_time,active) VALUES (?,?,?,1,'09:00','18:00',1)").bind(crypto.randomUUID(), businessId, professionalId),
        db.prepare("INSERT INTO business_hours (id,business_id,professional_id,weekday,start_time,end_time,active) VALUES (?,?,?,2,'09:00','18:00',1)").bind(crypto.randomUUID(), businessId, professionalId),
        db.prepare("INSERT INTO business_hours (id,business_id,professional_id,weekday,start_time,end_time,active) VALUES (?,?,?,3,'09:00','18:00',1)").bind(crypto.randomUUID(), businessId, professionalId),
        db.prepare("INSERT INTO business_hours (id,business_id,professional_id,weekday,start_time,end_time,active) VALUES (?,?,?,4,'09:00','18:00',1)").bind(crypto.randomUUID(), businessId, professionalId),
        db.prepare("INSERT INTO business_hours (id,business_id,professional_id,weekday,start_time,end_time,active) VALUES (?,?,?,5,'09:00','18:00',1)").bind(crypto.randomUUID(), businessId, professionalId),
      ]);
      await setMemberPassword(db, memberId, password, false);
    } catch (error) {
      await db.batch([
        db.prepare("DELETE FROM businesses WHERE id = ?").bind(businessId),
        db.prepare("DELETE FROM business_members WHERE id = ?").bind(memberId),
      ]);
      if ((error instanceof Error ? error.message : "").includes("UNIQUE")) throw new HttpError(409, "El correo o enlace de negocio ya está registrado.");
      throw error;
    }
    const user = { userId, memberId, businessId, displayName, email, role: "owner", mustChangePassword: false } as const;
    const cookie = await createSession(user, request);
    return Response.json({ ok: true, businessSlug: slug }, { status: 201, headers: { "set-cookie": cookie, "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

function slugFromName(value: string) {
  const slug = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 42);
  return slug || `negocio-${crypto.randomUUID().slice(0, 8)}`;
}
