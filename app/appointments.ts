import type { AuthUser } from "./auth";
import {
  HttpError, cleanText, isDate, isEmail, isPhone, isTime, localDate,
  minutesToTime, normalizeEmail, timeToMinutes, weekdayForDate,
} from "./security";

export type AppointmentInput = {
  businessId: string;
  timezone: string;
  clientId?: string | null;
  name: string;
  email: string;
  phone: string;
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  notes?: string;
  resourceId?: string | null;
  source: "online" | "panel";
  initialStatus?: "programada" | "confirmada";
  idempotencyHash: string;
  actor?: AuthUser | null;
};

export type AppointmentUpdateInput = {
  id: string;
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
  resourceId?: string | null;
  actor: AuthUser | null;
};

type ServiceRow = { duration: number; price: number; name: string };

export async function availableTimes(db: D1Database, input: {
  businessId: string;
  timezone: string;
  serviceId: string;
  professionalId: string;
  date: string;
  excludeAppointmentId?: string;
  resourceId?: string | null;
}) {
  if (!isDate(input.date) || input.date < localDate(input.timezone)) return [];

  const service = await db.prepare(`SELECT duration_minutes AS duration
    FROM services WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.serviceId, input.businessId).first<{ duration: number }>();
  const professional = await db.prepare(`SELECT p.id FROM professionals p
    WHERE p.id = ? AND p.business_id = ? AND p.active = 1
      AND (EXISTS (
        SELECT 1 FROM professional_services ps
        WHERE ps.business_id = p.business_id AND ps.professional_id = p.id AND ps.service_id = ?
      ) OR EXISTS (
        SELECT 1 FROM appointments current
        WHERE current.id = ? AND current.business_id = p.business_id
          AND current.professional_id = p.id AND current.service_id = ?
      ))`)
    .bind(input.professionalId, input.businessId, input.serviceId, input.excludeAppointmentId ?? "", input.serviceId).first();
  if (!service || !professional) return [];

  const weekday = weekdayForDate(input.date);
  const hours = await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
    FROM business_hours
    WHERE business_id = ? AND professional_id = ? AND weekday = ? AND active = 1`)
    .bind(input.businessId, input.professionalId, weekday)
    .first<{ startTime: string; endTime: string }>();
  if (!hours) return [];

  const appointments = input.excludeAppointmentId
    ? await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
        FROM appointments
        WHERE business_id = ? AND professional_id = ? AND appointment_date = ?
          AND status NOT IN ('cancelada','no_asistio') AND id <> ?`)
      .bind(input.businessId, input.professionalId, input.date, input.excludeAppointmentId)
      .all<{ startTime: string; endTime: string }>()
    : await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
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

  if (input.resourceId) {
    const resource = await db.prepare(`SELECT active, service_ids AS serviceIds, professional_ids AS professionalIds
      FROM resources WHERE id = ? AND business_id = ?`)
      .bind(input.resourceId, input.businessId)
      .first<{ active: number; serviceIds: string; professionalIds: string }>();
    if (!resource || resource.active !== 1 || !resourceAllows(resource.serviceIds, input.serviceId) || !resourceAllows(resource.professionalIds, input.professionalId)) return [];
    const resourceAppointments = input.excludeAppointmentId
      ? await db.prepare(`SELECT start_time AS startTime, end_time AS endTime FROM appointments
          WHERE business_id = ? AND resource_id = ? AND appointment_date = ?
            AND status NOT IN ('cancelada','no_asistio') AND id <> ?`)
        .bind(input.businessId, input.resourceId, input.date, input.excludeAppointmentId)
        .all<{ startTime: string; endTime: string }>()
      : await db.prepare(`SELECT start_time AS startTime, end_time AS endTime FROM appointments
          WHERE business_id = ? AND resource_id = ? AND appointment_date = ?
            AND status NOT IN ('cancelada','no_asistio')`)
        .bind(input.businessId, input.resourceId, input.date)
        .all<{ startTime: string; endTime: string }>();
    appointments.results?.push(...(resourceAppointments.results ?? []));
  }

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
  const existingClient = raw.clientId
    ? await db.prepare("SELECT id,name,email,phone FROM clients WHERE id=? AND business_id=?")
      .bind(raw.clientId, raw.businessId).first<{ id:string;name:string;email:string;phone:string }>()
    : null;
  if (raw.clientId && !existingClient) throw new HttpError(404, "Cliente no encontrado.");
  const input = {
    ...raw,
    name: cleanText(raw.name, 100) || cleanText(existingClient?.name, 100),
    email: normalizeEmail(raw.email || existingClient?.email || ""),
    phone: cleanText(raw.phone || existingClient?.phone, 25),
    notes: cleanText(raw.notes, 500),
    resourceId: cleanText(raw.resourceId, 80) || null,
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
  if (previous) return { id: previous.appointmentId, duplicate: true, clientId: null };

  const service = await db.prepare(`SELECT name, duration_minutes AS duration, price_cents AS price
    FROM services WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.serviceId, input.businessId).first<ServiceRow>();
  const professional = await db.prepare(`SELECT p.id FROM professionals p
    JOIN professional_services ps ON ps.business_id = p.business_id AND ps.professional_id = p.id
    WHERE p.id = ? AND p.business_id = ? AND p.active = 1 AND ps.service_id = ?`)
    .bind(input.professionalId, input.businessId, input.serviceId).first();
  if (!service || !professional) throw new HttpError(404, "Servicio o profesional no disponible.");

  const allowedTimes = await availableTimes(db, input);
  if (!allowedTimes.includes(input.time)) throw new HttpError(409, "Ese horario ya no está disponible.");

  const startMinutes = timeToMinutes(input.time);
  const endTime = minutesToTime(startMinutes + service.duration);
  const now = new Date().toISOString();
  const clientId = existingClient?.id ?? crypto.randomUUID();
  const appointmentId = crypto.randomUUID();
  const client = existingClient
    ? await db.prepare("UPDATE clients SET name=?,phone=? WHERE id=? AND business_id=? RETURNING id")
      .bind(input.name, input.phone, existingClient.id, input.businessId).first<{ id: string }>()
    : await db.prepare(`INSERT INTO clients
      (id,business_id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,'',?)
      ON CONFLICT(business_id,email) DO UPDATE SET name=excluded.name, phone=excluded.phone
      RETURNING id`).bind(clientId, input.businessId, input.name, input.email, input.phone, now)
      .first<{ id: string }>();
  if (!client) throw new HttpError(500, "No se pudo preparar la reserva.");

  const statements = [
    db.prepare(`INSERT INTO appointments
      (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,resource_id,created_at)
      VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?)`)
    .bind(appointmentId, input.businessId, client.id, input.serviceId, input.professionalId,
        input.date, input.time, endTime, input.initialStatus ?? "programada", input.source, input.notes, service.price, input.resourceId, now),
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
    if (sameRequest) return { id: sameRequest.appointmentId, duplicate: true, clientId: null };
    const message = error instanceof Error ? error.message : "";
    if (message.includes("appointment_time_overlap") || message.includes("appointment_time_block_overlap") || message.includes("resource_time_overlap") || message.includes("appointment_slots") || message.includes("UNIQUE constraint")) {
      throw new HttpError(409, "Ese horario acaba de ocuparse. Elige otro.");
    }
    throw error;
  }

  return { id: appointmentId, duplicate: false, clientId: client.id, serviceName: service.name, totalCents: service.price };
}

export async function updateAppointment(db: D1Database, raw: AppointmentUpdateInput) {
  const input = {
    ...raw,
    id: cleanText(raw.id, 80),
    name: cleanText(raw.name, 100),
    email: normalizeEmail(raw.email),
    phone: cleanText(raw.phone, 25),
    serviceId: cleanText(raw.serviceId, 80),
    professionalId: cleanText(raw.professionalId, 80),
    date: cleanText(raw.date, 10),
    time: cleanText(raw.time, 5),
    notes: cleanText(raw.notes, 500),
  };
  if (!input.id || !input.name || !isEmail(input.email) || !isPhone(input.phone)) {
    throw new HttpError(400, "Revisa el nombre, email y teléfono.");
  }
  if (!isDate(input.date) || !isTime(input.time)) throw new HttpError(400, "Fecha u hora no válida.");
  if (input.date < localDate(input.timezone)) throw new HttpError(400, "La fecha seleccionada ya pasó.");

  const existing = await db.prepare(`SELECT a.status, a.source, a.cancellation_reason AS cancellationReason,
      a.recurring_series_id AS recurringSeriesId, a.occurrence_number AS occurrenceNumber,
      a.resource_id AS resourceId,
      a.client_id AS clientId, a.service_id AS serviceId,
      a.professional_id AS professionalId, a.appointment_date AS date, a.start_time AS time,
      c.email AS clientEmail, COALESCE((SELECT SUM(payment.amount_cents) FROM payments payment
        WHERE payment.business_id = a.business_id AND payment.appointment_id = a.id
          AND payment.status = 'completed'), 0) AS paidCents
    FROM appointments a
    JOIN clients c ON c.id = a.client_id AND c.business_id = a.business_id
    WHERE a.id = ? AND a.business_id = ?`)
    .bind(input.id, input.businessId)
    .first<{ status:string;source:string;cancellationReason:string;recurringSeriesId:string|null;occurrenceNumber:number|null;resourceId:string|null;clientId:string;serviceId:string;professionalId:string;date:string;time:string;clientEmail:string;paidCents:number }>();
  if (!existing) throw new HttpError(404, "Cita no encontrada.");
  if (!['programada', 'confirmada'].includes(existing.status)) {
    throw new HttpError(409, "Solo puedes editar citas programadas o confirmadas.");
  }

  const service = await db.prepare(`SELECT name, duration_minutes AS duration, price_cents AS price
    FROM services WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.serviceId, input.businessId).first<ServiceRow>();
  const professional = await db.prepare(`SELECT name FROM professionals
    WHERE id = ? AND business_id = ? AND active = 1`)
    .bind(input.professionalId, input.businessId).first<{ name:string }>();
  if (!service || !professional) throw new HttpError(404, "Servicio o profesional no disponible.");

  const resourceId = raw.resourceId === undefined ? existing.resourceId : (cleanText(raw.resourceId, 80) || null);
  const allowedTimes = await availableTimes(db, { ...input, resourceId, excludeAppointmentId: input.id });
  if (!allowedTimes.includes(input.time)) throw new HttpError(409, "Ese horario ya no está disponible.");

  const client = await db.prepare("SELECT id FROM clients WHERE business_id = ? AND email = ?")
    .bind(input.businessId, input.email).first<{ id:string }>();
  const clientId = client?.id ?? (existing.clientEmail === input.email ? existing.clientId : crypto.randomUUID());
  const startMinutes = timeToMinutes(input.time);
  const endTime = minutesToTime(startMinutes + service.duration);
  const now = new Date().toISOString();
  const statements = client || existing.clientEmail === input.email
    ? [db.prepare("UPDATE clients SET name = ?, phone = ? WHERE id = ? AND business_id = ?")
      .bind(input.name, input.phone, clientId, input.businessId)]
    : [db.prepare(`INSERT INTO clients (id,business_id,name,email,phone,notes,created_at)
        VALUES (?,?,?,?,?,'',?)`).bind(clientId, input.businessId, input.name, input.email, input.phone, now)];

  statements.push(
    db.prepare(`UPDATE appointments SET client_id = ?, service_id = ?, professional_id = ?,
      appointment_date = ?, start_time = ?, end_time = ?, notes = ?, total_cents = ?, resource_id = ?
      WHERE id = ? AND business_id = ?`)
      .bind(clientId, input.serviceId, input.professionalId, input.date, input.time, endTime,
        input.notes, service.price, resourceId, input.id, input.businessId),
    db.prepare("DELETE FROM appointment_slots WHERE appointment_id = ? AND business_id = ?")
      .bind(input.id, input.businessId),
  );
  for (let minute = startMinutes; minute < startMinutes + service.duration; minute += 5) {
    const slotTime = minutesToTime(minute);
    statements.push(db.prepare(`INSERT INTO appointment_slots
      (slot_key,appointment_id,business_id,professional_id,appointment_date,slot_time)
      VALUES (?,?,?,?,?,?)`).bind(`${input.businessId}:${input.professionalId}:${input.date}:${slotTime}`,
      input.id, input.businessId, input.professionalId, input.date, slotTime));
  }
  statements.push(db.prepare(`INSERT INTO audit_logs
    (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
    VALUES (?,?,?,?, 'appointment.updated','appointment',?,?,?)`)
    .bind(crypto.randomUUID(), input.businessId, input.actor?.userId ?? null, input.actor?.email ?? null, input.id,
      JSON.stringify({
        from: { serviceId: existing.serviceId, professionalId: existing.professionalId, date: existing.date, time: existing.time },
        to: { serviceId: input.serviceId, professionalId: input.professionalId, date: input.date, time: input.time },
      }), now));

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("appointment_time_overlap") || message.includes("appointment_time_block_overlap") || message.includes("resource_time_overlap") ||
      message.includes("appointment_slots") || message.includes("UNIQUE constraint")) {
      throw new HttpError(409, "Ese horario acaba de ocuparse. Elige otro.");
    }
    throw error;
  }

  return {
    id: input.id, clientId, date: input.date, time: input.time, endTime, status: existing.status, source: existing.source,
    cancellationReason: existing.cancellationReason,
    recurringSeriesId: existing.recurringSeriesId, occurrenceNumber: existing.occurrenceNumber,
    resourceId,
    serviceId: input.serviceId, serviceName: service.name, professionalId: input.professionalId,
    professionalName: professional.name, totalCents: service.price, clientName: input.name,
    paidCents: existing.paidCents,
    paymentStatus: existing.paidCents <= 0 ? "pendiente" : existing.paidCents < service.price ? "parcial" : "pagado",
    email: input.email, phone: input.phone, notes: input.notes,
  };
}

function resourceAllows(rawIds: string, id: string) {
  try {
    const parsed: unknown = JSON.parse(rawIds || "[]");
    return !Array.isArray(parsed) || parsed.length === 0 || parsed.includes(id);
  } catch {
    return false;
  }
}
