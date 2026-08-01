import type { ChatGPTUser } from "./chatgpt-auth";
import {
  HttpError, cleanText, isDate, isEmail, isPhone, isTime, localDate,
  minutesToTime, normalizeEmail, timeToMinutes, weekdayForDate,
} from "./security";

export type AppointmentInput = {
  businessId: string;
  timezone: string;
  name: string;
  email: string;
  phone: string;
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  notes?: string;
  source: "online" | "panel";
  idempotencyHash: string;
  actor?: ChatGPTUser | null;
};

type ServiceRow = { duration: number; price: number; name: string };

export async function availableTimes(db: D1Database, input: {
  businessId: string;
  timezone: string;
  serviceId: string;
  professionalId: string;
  date: string;
}) {
  if (!isDate(input.date) || input.date < localDate(input.timezone)) return [];

  const service = await db.prepare(`SELECT duration_minutes AS duration
    FROM services WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.serviceId, input.businessId).first<{ duration: number }>();
  const professional = await db.prepare(`SELECT id FROM professionals
    WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.professionalId, input.businessId).first();
  if (!service || !professional) return [];

  const weekday = weekdayForDate(input.date, input.timezone);
  const hours = await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
    FROM business_hours
    WHERE business_id = ? AND professional_id = ? AND weekday = ? AND active = 1`)
    .bind(input.businessId, input.professionalId, weekday)
    .first<{ startTime: string; endTime: string }>();
  if (!hours) return [];

  const appointments = await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
    FROM appointments
    WHERE business_id = ? AND professional_id = ? AND appointment_date = ?
      AND status NOT IN ('cancelada','no_asistio')`)
    .bind(input.businessId, input.professionalId, input.date)
    .all<{ startTime: string; endTime: string }>();
  const blocks = await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
    FROM time_blocks
    WHERE business_id = ? AND professional_id = ? AND block_date = ?`)
    .bind(input.businessId, input.professionalId, input.date)
    .all<{ startTime: string; endTime: string }>();

  const busy = [...(appointments.results ?? []), ...(blocks.results ?? [])]
    .map((range) => [timeToMinutes(range.startTime), timeToMinutes(range.endTime)] as const);
  const opening = timeToMinutes(hours.startTime);
  const closing = timeToMinutes(hours.endTime);
  const result: string[] = [];
  for (let start = opening; start + service.duration <= closing; start += 15) {
    const end = start + service.duration;
    if (!busy.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart)) {
      result.push(minutesToTime(start));
    }
  }
  return result;
}

export async function createAppointment(db: D1Database, raw: AppointmentInput) {
  const input = {
    ...raw,
    name: cleanText(raw.name, 100),
    email: normalizeEmail(raw.email),
    phone: cleanText(raw.phone, 25),
    notes: cleanText(raw.notes, 500),
  };
  if (!input.name || !isEmail(input.email) || !isPhone(input.phone)) {
    throw new HttpError(400, "Revisa el nombre, email y teléfono.");
  }
  if (!isDate(input.date) || !isTime(input.time)) throw new HttpError(400, "Fecha u hora no válida.");
  if (input.date < localDate(input.timezone)) throw new HttpError(400, "La fecha seleccionada ya pasó.");
  if (!input.idempotencyHash) throw new HttpError(400, "Falta el identificador seguro de la solicitud.");

  const previous = await db.prepare(`SELECT appointment_id AS appointmentId
    FROM idempotency_keys WHERE key_hash = ? AND business_id = ?`)
    .bind(input.idempotencyHash, input.businessId).first<{ appointmentId: string }>();
  if (previous) return { id: previous.appointmentId, duplicate: true };

  const service = await db.prepare(`SELECT name, duration_minutes AS duration, price_cents AS price
    FROM services WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.serviceId, input.businessId).first<ServiceRow>();
  const professional = await db.prepare(`SELECT id FROM professionals
    WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.professionalId, input.businessId).first();
  if (!service || !professional) throw new HttpError(404, "Servicio o profesional no disponible.");

  const allowedTimes = await availableTimes(db, input);
  if (!allowedTimes.includes(input.time)) throw new HttpError(409, "Ese horario ya no está disponible.");

  const startMinutes = timeToMinutes(input.time);
  const endTime = minutesToTime(startMinutes + service.duration);
  const now = new Date().toISOString();
  const clientId = crypto.randomUUID();
  const appointmentId = crypto.randomUUID();
  const client = await db.prepare(`INSERT INTO clients
    (id,business_id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,'',?)
    ON CONFLICT(business_id,email) DO UPDATE SET name=excluded.name, phone=excluded.phone
    RETURNING id`).bind(clientId, input.businessId, input.name, input.email, input.phone, now)
    .first<{ id: string }>();
  if (!client) throw new HttpError(500, "No se pudo preparar la reserva.");

  const statements = [
    db.prepare(`INSERT INTO appointments
      (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,created_at)
      VALUES (?,?,?,?,?,?,?,?, 'programada',?,?,?,?)`)
      .bind(appointmentId, input.businessId, client.id, input.serviceId, input.professionalId,
        input.date, input.time, endTime, input.source, input.notes, service.price, now),
  ];
  for (let minute = startMinutes; minute < startMinutes + service.duration; minute += 5) {
    const slotTime = minutesToTime(minute);
    const slotKey = `${input.businessId}:${input.professionalId}:${input.date}:${slotTime}`;
    statements.push(db.prepare(`INSERT INTO appointment_slots
      (slot_key,appointment_id,business_id,professional_id,appointment_date,slot_time)
      VALUES (?,?,?,?,?,?)`).bind(slotKey, appointmentId, input.businessId, input.professionalId, input.date, slotTime));
  }
  statements.push(db.prepare(`INSERT INTO idempotency_keys
    (key_hash,business_id,appointment_id,created_at) VALUES (?,?,?,?)`)
    .bind(input.idempotencyHash, input.businessId, appointmentId, now));
  statements.push(db.prepare(`INSERT INTO audit_logs
    (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
    VALUES (?,?,?,?, 'appointment.created','appointment',?,?,?)`)
    .bind(crypto.randomUUID(), input.businessId, input.actor?.userId ?? null,
      input.actor?.email ?? null, appointmentId,
      JSON.stringify({ source: input.source, serviceId: input.serviceId, professionalId: input.professionalId }), now));

  try {
    await db.batch(statements);
  } catch (error) {
    const sameRequest = await db.prepare(`SELECT appointment_id AS appointmentId
      FROM idempotency_keys WHERE key_hash = ? AND business_id = ?`)
      .bind(input.idempotencyHash, input.businessId).first<{ appointmentId: string }>();
    if (sameRequest) return { id: sameRequest.appointmentId, duplicate: true };
    const message = error instanceof Error ? error.message : "";
    if (message.includes("appointment_slots") || message.includes("UNIQUE constraint")) {
      throw new HttpError(409, "Ese horario acaba de ocuparse. Elige otro.");
    }
    throw error;
  }

  return { id: appointmentId, duplicate: false, serviceName: service.name, totalCents: service.price };
}
