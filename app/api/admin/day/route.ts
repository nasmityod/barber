import { ensureDatabase } from "../../../../db/init";
import { createAppointment } from "../../../appointments";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext, HttpError,
  isDate, isEmail, isPhone, localDate, normalizeEmail, readJson, sha256, writeAudit,
} from "../../../security";

type DayInput = {
  action?: unknown; date?: unknown; id?: unknown; appointmentId?: unknown; serviceId?: unknown;
  professionalId?: unknown; name?: unknown; email?: unknown; phone?: unknown; notes?: unknown;
  status?: unknown; reason?: unknown; direction?: unknown; time?: unknown; method?: unknown; amountCents?: unknown;
};

const QUEUE_STATUSES = ["waiting", "in_service", "finished", "no_show", "cancelled"] as const;
const SALE_METHODS = ["efectivo", "tarjeta", "transferencia", "pago_movil"] as const;

export async function GET(request: Request) {
  try {
    const context = await getAdminContext("appointments.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const url = new URL(request.url);
    const date = cleanText(url.searchParams.get("date"), 10) || localDate(context.timezone);
    if (!isDate(date)) throw new HttpError(400, "La fecha del turno no es válida.");
    const db = await ensureDatabase();
    const [queue, appointments, summary] = await Promise.all([
      db.prepare(`SELECT q.id,q.queue_date AS date,q.kind,q.status,q.position,q.appointment_id AS appointmentId,
          q.client_id AS clientId,q.service_id AS serviceId,q.professional_id AS professionalId,
          q.arrived_at AS arrivedAt,q.started_at AS startedAt,q.finished_at AS finishedAt,
          ROUND((julianday(COALESCE(q.started_at,datetime('now')))-julianday(q.arrived_at))*1440) AS waitMinutes,
          q.sale_id AS saleId,q.sale_amount_cents AS saleAmountCents,q.notes,q.created_at AS createdAt,q.updated_at AS updatedAt,
          c.name AS clientName,c.email,c.phone,s.name AS serviceName,p.name AS professionalName,
          COALESCE(a.total_cents,0) AS totalCents,COALESCE(payment.paid_cents,0) AS paidCents,
          a.status AS appointmentStatus
        FROM day_queue_entries q
        JOIN clients c ON c.id=q.client_id AND c.business_id=q.business_id
        LEFT JOIN services s ON s.id=q.service_id AND s.business_id=q.business_id
        LEFT JOIN professionals p ON p.id=q.professional_id AND p.business_id=q.business_id
        LEFT JOIN appointments a ON a.id=q.appointment_id AND a.business_id=q.business_id
        LEFT JOIN (SELECT business_id,appointment_id,SUM(amount_cents) AS paid_cents FROM payments WHERE status='completed' GROUP BY business_id,appointment_id) payment
          ON payment.business_id=q.business_id AND payment.appointment_id=q.appointment_id
        WHERE q.business_id=? AND q.queue_date=?
        ORDER BY q.position ASC,q.arrived_at ASC`).bind(context.businessId, date).all(),
      db.prepare(`SELECT a.id,a.client_id AS clientId,a.appointment_date AS date,a.start_time AS time,a.end_time AS endTime,
          a.status,a.total_cents AS totalCents,c.name AS clientName,c.email,c.phone,s.name AS serviceName,
          a.service_id AS serviceId,a.professional_id AS professionalId,p.name AS professionalName,
          q.id AS queueId,q.status AS queueStatus
        FROM appointments a
        JOIN clients c ON c.id=a.client_id AND c.business_id=a.business_id
        JOIN services s ON s.id=a.service_id AND s.business_id=a.business_id
        JOIN professionals p ON p.id=a.professional_id AND p.business_id=a.business_id
        LEFT JOIN day_queue_entries q ON q.appointment_id=a.id AND q.business_id=a.business_id
        WHERE a.business_id=? AND a.appointment_date=? AND a.status NOT IN ('cancelada','no_asistio')
        ORDER BY a.start_time ASC`).bind(context.businessId, date).all(),
      db.prepare(`SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) AS waiting,
          SUM(CASE WHEN status='in_service' THEN 1 ELSE 0 END) AS inService,
          SUM(CASE WHEN status='finished' THEN 1 ELSE 0 END) AS finished,
          COALESCE(ROUND(AVG(CASE WHEN started_at IS NOT NULL THEN (julianday(started_at)-julianday(arrived_at))*1440 END)),0) AS averageWaitMinutes
        FROM day_queue_entries WHERE business_id=? AND queue_date=?`).bind(context.businessId, date).first(),
    ]);
    return Response.json({ date, queue: queue.results ?? [], appointments: appointments.results ?? [], summary: summary ?? {}, canWrite: ["owner", "admin", "reception"].includes(context.role) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJson<DayInput>(request, 24_576);
    const action = cleanText(input.action, 32);
    const context = await getAdminContext(action === "sale" ? "finance.write" : "appointments.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `day-write:${context.user.userId}`, 120, 60_000);
    if (action === "walk_in") return await createWalkIn(db, context, input);
    if (action === "check_in") return await checkIn(db, context, input);
    if (action === "status") return await updateQueueStatus(db, context, input);
    if (action === "move") return await moveQueueEntry(db, context, input);
    if (action === "convert") return await convertToAppointment(db, context, input);
    if (action === "sale") return await registerQuickSale(db, context, input);
    if (action === "reminders") return await queueTomorrowReminders(db, context, input);
    throw new HttpError(400, "Operación del turno no válida.");
  } catch (error) {
    return errorResponse(error);
  }
}

async function createWalkIn(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const date = cleanText(input.date, 10) || localDate(context.timezone);
  const name = cleanText(input.name, 100);
  const email = normalizeEmail(input.email);
  const phone = cleanText(input.phone, 25);
  let serviceId = cleanText(input.serviceId, 80);
  const professionalId = cleanText(input.professionalId, 80) || null;
  if (!serviceId) {
    const firstService = await db.prepare("SELECT id FROM services WHERE business_id=? AND active=1 ORDER BY name COLLATE NOCASE LIMIT 1").bind(context.businessId).first<{id:string}>();
    serviceId = firstService?.id ?? "";
  }
  if (!isDate(date) || !name || (!email && !phone) || (email && !isEmail(email)) || (phone && !isPhone(phone))) {
    throw new HttpError(400, "Revisa la fecha, nombre y al menos un medio de contacto.");
  }
  await validateAssignment(db, context.businessId, serviceId, professionalId);
  const clientId = await findOrCreateClient(db, context.businessId, name, email, phone);
  const position = await nextPosition(db, context.businessId, date);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO day_queue_entries
      (id,business_id,queue_date,kind,status,position,client_id,service_id,professional_id,arrived_at,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?)`).bind(id, context.businessId, date, "walk_in", "waiting", position, clientId, serviceId, professionalId, now, cleanText(input.notes, 500), now, now),
  ]);
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "day_queue.created", entityType: "day_queue_entry", entityId: id, metadata: { kind: "walk_in", date, serviceId, professionalId } });
  return Response.json({ id, message: "Cliente añadido al turno." }, { status: 201, headers: { "cache-control": "no-store" } });
}

async function checkIn(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const appointmentId = cleanText(input.appointmentId, 80);
  const appointment = await db.prepare(`SELECT a.id,a.appointment_date AS date,a.client_id AS clientId,a.service_id AS serviceId,a.professional_id AS professionalId,a.status
    FROM appointments a WHERE a.id=? AND a.business_id=?`).bind(appointmentId, context.businessId).first<{id:string;date:string;clientId:string;serviceId:string;professionalId:string;status:string}>();
  if (!appointment) throw new HttpError(404, "Cita no encontrada.");
  if (["cancelada", "no_asistio", "completada"].includes(appointment.status)) throw new HttpError(409, "Esta cita ya no puede entrar al turno.");
  const existing = await db.prepare("SELECT id FROM day_queue_entries WHERE appointment_id=? AND business_id=?").bind(appointmentId, context.businessId).first<{id:string}>();
  if (existing) return Response.json({ id: existing.id, duplicate: true });
  const position = await nextPosition(db, context.businessId, appointment.date);
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare(`INSERT INTO day_queue_entries
    (id,business_id,queue_date,kind,status,position,appointment_id,client_id,service_id,professional_id,arrived_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?)`).bind(id, context.businessId, appointment.date, "appointment", "waiting", position, appointment.id, appointment.clientId, appointment.serviceId, appointment.professionalId, now, now, now).run();
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "day_queue.check_in", entityType: "appointment", entityId: appointmentId, metadata: { date: appointment.date } });
  return Response.json({ id, appointmentId }, { status: 201, headers: { "cache-control": "no-store" } });
}

async function updateQueueStatus(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const id = cleanText(input.id, 80);
  const status = cleanText(input.status, 20);
  const reason = cleanText(input.reason, 180);
  if (!QUEUE_STATUSES.includes(status as typeof QUEUE_STATUSES[number])) throw new HttpError(400, "Estado de cola no válido.");
  const entry = await db.prepare("SELECT id,queue_date AS date,status,appointment_id AS appointmentId,started_at AS startedAt,finished_at AS finishedAt FROM day_queue_entries WHERE id=? AND business_id=?")
    .bind(id, context.businessId).first<{id:string;date:string;status:string;appointmentId:string|null;startedAt:string|null;finishedAt:string|null}>();
  if (!entry) throw new HttpError(404, "Entrada de turno no encontrada.");
  const allowed: Record<string, readonly string[]> = {
    waiting: ["waiting", "in_service", "finished", "no_show", "cancelled"],
    in_service: ["in_service", "finished", "cancelled"],
    finished: ["finished"], no_show: ["no_show"], cancelled: ["cancelled"],
  };
  if (!(allowed[entry.status] ?? []).includes(status)) throw new HttpError(409, "Ese cambio de estado no está permitido.");
  if (status === "cancelled" && !reason) throw new HttpError(400, "Indica el motivo de la cancelación.");
  if (entry.status === status) return Response.json({ id, status });
  const now = new Date().toISOString();
  const startedAt = status === "in_service" ? (entry.startedAt ?? now) : entry.startedAt;
  const finishedAt = status === "finished" ? (entry.finishedAt ?? now) : entry.finishedAt;
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE day_queue_entries SET status=?,started_at=?,finished_at=?,updated_at=? WHERE id=? AND business_id=?")
      .bind(status, startedAt, finishedAt, now, id, context.businessId),
  ];
  const appointmentStatus = status === "in_service" ? "en_progreso" : status === "finished" ? "completada" : status === "no_show" ? "no_asistio" : status === "cancelled" ? "cancelada" : null;
  if (entry.appointmentId && appointmentStatus) {
    statements.push(db.prepare("UPDATE appointments SET status=?,cancellation_reason=? WHERE id=? AND business_id=?")
      .bind(appointmentStatus, status === "cancelled" ? reason : "", entry.appointmentId, context.businessId));
    if (["no_show", "cancelled"].includes(status)) statements.push(db.prepare("DELETE FROM appointment_slots WHERE appointment_id=? AND business_id=?").bind(entry.appointmentId, context.businessId));
  }
  await db.batch(statements);
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "day_queue.status_updated", entityType: "day_queue_entry", entityId: id, metadata: { from: entry.status, to: status, appointmentId: entry.appointmentId, reason: reason || null } });
  return Response.json({ id, status, appointmentId: entry.appointmentId });
}

async function moveQueueEntry(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const id = cleanText(input.id, 80);
  const direction = input.direction === "down" ? "down" : input.direction === "up" ? "up" : "";
  if (!id || !direction) throw new HttpError(400, "Movimiento de cola no válido.");
  const entry = await db.prepare("SELECT id,queue_date AS date,status,position FROM day_queue_entries WHERE id=? AND business_id=?")
    .bind(id, context.businessId).first<{id:string;date:string;status:string;position:number}>();
  if (!entry) throw new HttpError(404, "Entrada de turno no encontrada.");
  if (entry.status !== "waiting") throw new HttpError(409, "Solo puedes reordenar personas que están esperando.");
  const rows = await db.prepare(`SELECT id,position FROM day_queue_entries
    WHERE business_id=? AND queue_date=? AND status='waiting' ORDER BY position ASC,arrived_at ASC`).bind(context.businessId, entry.date).all<{id:string;position:number}>();
  const index = (rows.results ?? []).findIndex((row) => row.id === id);
  const neighborIndex = index + (direction === "up" ? -1 : 1);
  const neighbor = (rows.results ?? [])[neighborIndex];
  if (index < 0 || !neighbor) return Response.json({ id, moved: false });
  await db.batch([
    db.prepare("UPDATE day_queue_entries SET position=?,updated_at=? WHERE id=? AND business_id=?").bind(neighbor.position, new Date().toISOString(), id, context.businessId),
    db.prepare("UPDATE day_queue_entries SET position=?,updated_at=? WHERE id=? AND business_id=?").bind(entry.position, new Date().toISOString(), neighbor.id, context.businessId),
  ]);
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "day_queue.reordered", entityType: "day_queue_entry", entityId: id, metadata: { direction } });
  return Response.json({ id, moved: true });
}

async function convertToAppointment(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const id = cleanText(input.id, 80);
  const entry = await db.prepare(`SELECT q.id,q.queue_date AS queueDate,q.appointment_id AS appointmentId,q.client_id AS clientId,
      q.service_id AS serviceId,q.professional_id AS professionalId,c.name,c.email,c.phone
    FROM day_queue_entries q JOIN clients c ON c.id=q.client_id AND c.business_id=q.business_id
    WHERE q.id=? AND q.business_id=?`).bind(id, context.businessId).first<{id:string;queueDate:string;appointmentId:string|null;clientId:string;serviceId:string|null;professionalId:string|null;name:string;email:string;phone:string}>();
  if (!entry) throw new HttpError(404, "Entrada de turno no encontrada.");
  if (entry.appointmentId) return Response.json({ id, appointmentId: entry.appointmentId, duplicate: true });
  const serviceId = cleanText(input.serviceId, 80) || entry.serviceId || "";
  const professionalId = cleanText(input.professionalId, 80) || entry.professionalId || "";
  const date = cleanText(input.date, 10) || entry.queueDate;
  const time = cleanText(input.time, 5);
  const email = normalizeEmail(input.email || entry.email);
  const phone = cleanText(input.phone || entry.phone, 25);
  if (!isDate(date) || !time || !isEmail(email) || !isPhone(phone)) throw new HttpError(400, "Para agendar, indica fecha, hora, email y teléfono válidos.");
  await validateAssignment(db, context.businessId, serviceId, professionalId);
  const result = await createAppointment(db, {
    businessId: context.businessId, timezone: context.timezone, clientId: entry.clientId, name: entry.name, email, phone,
    serviceId, professionalId, date, time, notes: cleanText(input.notes, 500) || "Convertido desde Turno del día", source: "panel",
    idempotencyHash: await sha256(`${context.businessId}:day-queue-convert:${id}`), actor: context.user,
  });
  const now = new Date().toISOString();
  await db.prepare("UPDATE day_queue_entries SET kind='converted',appointment_id=?,service_id=?,professional_id=?,updated_at=? WHERE id=? AND business_id=?")
    .bind(result.id, serviceId, professionalId, now, id, context.businessId).run();
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "day_queue.converted", entityType: "day_queue_entry", entityId: id, metadata: { appointmentId: result.id, date, time } });
  return Response.json({ id, appointmentId: result.id }, { status: result.duplicate ? 200 : 201, headers: { "cache-control": "no-store" } });
}

async function registerQuickSale(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const id = cleanText(input.id, 80);
  const amountCents = integer(input.amountCents);
  const method = cleanText(input.method, 24);
  if (!amountCents || amountCents <= 0 || !SALE_METHODS.includes(method as typeof SALE_METHODS[number])) throw new HttpError(400, "Indica un monto y método de pago válidos.");
  const entry = await db.prepare("SELECT id,client_id AS clientId,sale_id AS saleId FROM day_queue_entries WHERE id=? AND business_id=?")
    .bind(id, context.businessId).first<{id:string;clientId:string;saleId:string|null}>();
  if (!entry) throw new HttpError(404, "Entrada de turno no encontrada.");
  if (entry.saleId) throw new HttpError(409, "Esta entrada ya tiene una venta registrada.");
  const session = await db.prepare("SELECT id FROM cash_sessions WHERE business_id=? AND status='open'").bind(context.businessId).first<{id:string}>();
  if (!session) throw new HttpError(409, "Abre la caja antes de registrar una venta.");
  const now = new Date().toISOString(); const saleId = crypto.randomUUID();
  const receiptNumber = `T-${now.slice(0, 10).replaceAll("-", "")}-${saleId.slice(0, 6).toUpperCase()}`;
  await db.batch([
    db.prepare(`INSERT INTO product_sales
      (id,business_id,cash_session_id,client_id,subtotal_cents,discount_cents,total_cents,tip_cents,method,status,receipt_number,created_by,created_at)
      VALUES (?,?,?,?,?,0,?,0,?,'completed',?,?,?)`).bind(saleId, context.businessId, session.id, entry.clientId, amountCents, amountCents, method, receiptNumber, context.user.userId, now),
    db.prepare("INSERT INTO receipts (id,business_id,receipt_number,sale_id,snapshot,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), context.businessId, receiptNumber, saleId, JSON.stringify({ saleId, receiptNumber, kind: "day_queue" }), now),
    db.prepare("UPDATE day_queue_entries SET sale_id=?,sale_amount_cents=?,updated_at=? WHERE id=? AND business_id=?")
      .bind(saleId, amountCents, now, id, context.businessId),
  ]);
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "day_queue.sale_recorded", entityType: "product_sale", entityId: saleId, metadata: { queueId: id, amountCents, method } });
  return Response.json({ id, saleId, receiptNumber, amountCents }, { status: 201, headers: { "cache-control": "no-store" } });
}

async function queueTomorrowReminders(db: D1Database, context: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>, input: DayInput) {
  const requested = cleanText(input.date, 10);
  const date = requested || addDays(localDate(context.timezone), 1);
  if (!isDate(date)) throw new HttpError(400, "Fecha de recordatorio no válida.");
  const appointments = await db.prepare(`SELECT a.id,a.client_id AS clientId,a.appointment_date AS date,a.start_time AS time,c.name,c.email,c.phone,s.name AS serviceName
    FROM appointments a JOIN clients c ON c.id=a.client_id AND c.business_id=a.business_id JOIN services s ON s.id=a.service_id AND s.business_id=a.business_id
    WHERE a.business_id=? AND a.appointment_date=? AND a.status IN ('programada','confirmada')`).bind(context.businessId, date).all<{id:string;clientId:string;date:string;time:string;name:string;email:string;phone:string;serviceName:string}>();
  const now = new Date().toISOString(); let queued = 0;
  for (const appointment of appointments.results ?? []) {
    const body = `Hola ${appointment.name}, te recordamos tu cita de ${appointment.serviceName} el ${appointment.date} a las ${appointment.time}.`;
    for (const [channel, recipient] of [["whatsapp", appointment.phone], ["email", appointment.email]] as const) {
      if (!recipient || recipient.includes("@local.invalid")) continue;
      const exists = await db.prepare("SELECT id FROM message_logs WHERE business_id=? AND appointment_id=? AND kind='appointment_reminder' AND channel=? AND scheduled_at=?")
        .bind(context.businessId, appointment.id, channel, date).first();
      if (exists) continue;
      await db.prepare(`INSERT INTO message_logs (id,business_id,client_id,appointment_id,channel,kind,recipient,body,status,scheduled_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.businessId, appointment.clientId, appointment.id, channel, "appointment_reminder", recipient, body, "queued", date, now).run();
      queued++;
    }
  }
  return Response.json({ date, queued }, { headers: { "cache-control": "no-store" } });
}

async function validateAssignment(db: D1Database, businessId: string, serviceId: string, professionalId: string | null) {
  if (!serviceId) throw new HttpError(400, "Selecciona un servicio.");
  const service = await db.prepare("SELECT id FROM services WHERE id=? AND business_id=? AND active=1").bind(serviceId, businessId).first();
  if (!service) throw new HttpError(404, "Servicio no disponible.");
  if (professionalId) {
    const professional = await db.prepare(`SELECT p.id FROM professionals p WHERE p.id=? AND p.business_id=? AND p.active=1
      AND EXISTS (SELECT 1 FROM professional_services ps WHERE ps.business_id=p.business_id AND ps.professional_id=p.id AND ps.service_id=?)`)
      .bind(professionalId, businessId, serviceId).first();
    if (!professional) throw new HttpError(404, "Profesional no disponible para ese servicio.");
  }
}

async function findOrCreateClient(db: D1Database, businessId: string, name: string, email: string, phone: string) {
  const existing = email
    ? await db.prepare("SELECT id FROM clients WHERE business_id=? AND email=?").bind(businessId, email).first<{id:string}>()
    : phone ? await db.prepare("SELECT id FROM clients WHERE business_id=? AND phone=? LIMIT 1").bind(businessId, phone).first<{id:string}>() : null;
  if (existing) {
    await db.prepare("UPDATE clients SET name=?,phone=? WHERE id=? AND business_id=?").bind(name, phone, existing.id, businessId).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO clients (id,business_id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,'',?)")
    .bind(id, businessId, name, email || `${id}@local.invalid`, phone, new Date().toISOString()).run();
  return id;
}

async function nextPosition(db: D1Database, businessId: string, date: string) {
  const row = await db.prepare("SELECT COALESCE(MAX(position),0)+1 AS next FROM day_queue_entries WHERE business_id=? AND queue_date=?")
    .bind(businessId, date).first<{next:number}>();
  return Number(row?.next ?? 1);
}

function integer(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(cleanText(value, 20));
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100_000_000 ? parsed : null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
