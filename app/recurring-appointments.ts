import type { AuthUser } from "./auth";
import { generateRecurringDates, nextRecurringDate, type RecurrenceFrequency } from "./recurrence";
import {
  HttpError, cleanText, isDate, isEmail, isPhone, isTime, localDate,
  minutesToTime, normalizeEmail, timeToMinutes, weekdayForDate,
} from "./security";

export type RecurringSeriesInput = {
  businessId: string;
  timezone: string;
  name: string;
  email: string;
  phone: string;
  serviceId: string;
  professionalId: string;
  frequency: string;
  startDate: string;
  endDate: string;
  time: string;
  notes?: string;
  actor: AuthUser;
};

type PreparedSeriesInput = Omit<RecurringSeriesInput, "frequency" | "notes"> & {
  frequency: RecurrenceFrequency;
  notes: string;
};

type ServiceRow = { name:string; duration:number; price:number };
type ScheduleRange = { date:string; startTime:string; endTime:string };

export async function createRecurringSeries(db:D1Database, raw:RecurringSeriesInput & { idempotencyHash:string }) {
  const input = prepareInput(raw);
  if (!raw.idempotencyHash) throw new HttpError(400, "Falta el identificador seguro de la solicitud.");
  const previous = await db.prepare(`SELECT id FROM recurring_appointment_series
    WHERE business_id = ? AND idempotency_hash = ?`)
    .bind(input.businessId, raw.idempotencyHash).first<{id:string}>();
  if (previous) {
    const count = await activeOccurrenceCount(db, input.businessId, previous.id);
    return { id:previous.id, createdCount:count, skipped:[], duplicate:true };
  }

  const dates = requireOccurrenceDates(input);
  const schedule = await loadSchedule(db, input);
  const { accepted, skipped } = availableOccurrences(input, dates, schedule);
  if (!accepted.length) throw new HttpError(409, "No hay fechas disponibles para crear esta serie.");

  const clientId = await upsertClient(db, input);
  const seriesId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements:D1PreparedStatement[] = [
    db.prepare(`INSERT INTO recurring_appointment_series
      (id,business_id,client_id,service_id,professional_id,frequency,start_date,end_date,start_time,
       notes,status,idempotency_hash,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`)
      .bind(seriesId,input.businessId,clientId,input.serviceId,input.professionalId,input.frequency,
        input.startDate,input.endDate,input.time,input.notes,raw.idempotencyHash,input.actor.userId,now,now),
  ];
  appendOccurrenceInserts(db, statements, input, schedule.service, clientId, seriesId, accepted, now);
  statements.push(auditStatement(db, input, seriesId, "recurring_series.created", now, {
    frequency:input.frequency,createdCount:accepted.length,skippedCount:skipped.length,
  }));
  await executeSeriesBatch(db, statements);
  return { id:seriesId, createdCount:accepted.length, skipped, duplicate:false };
}

export async function updateRecurringSeries(db:D1Database, raw:RecurringSeriesInput & { id:string }) {
  const input = prepareInput(raw);
  const id = cleanText(raw.id, 80);
  if (!id) throw new HttpError(400, "Serie recurrente no válida.");
  const existing = await db.prepare(`SELECT id,status FROM recurring_appointment_series
    WHERE id = ? AND business_id = ?`).bind(id,input.businessId).first<{id:string;status:string}>();
  if (!existing) throw new HttpError(404, "Serie recurrente no encontrada.");
  if (existing.status !== "active") throw new HttpError(409, "Solo puedes editar una serie activa.");
  await ensureNoPaidFutureAppointments(db,input.businessId,id,input.startDate);

  const dates = requireOccurrenceDates(input);
  const schedule = await loadSchedule(db,input,{seriesId:id,effectiveFrom:input.startDate});
  const { accepted, skipped } = availableOccurrences(input,dates,schedule);
  if (!accepted.length) throw new HttpError(409, "No hay fechas disponibles para actualizar esta serie.");

  const clientId = await upsertClient(db,input);
  const now = new Date().toISOString();
  const replacementReason = "Reemplazada al editar la serie recurrente";
  const statements:D1PreparedStatement[] = [
    db.prepare(`DELETE FROM appointment_slots WHERE business_id = ? AND appointment_id IN (
      SELECT id FROM appointments WHERE business_id = ? AND recurring_series_id = ?
        AND appointment_date >= ? AND status IN ('programada','confirmada'))`)
      .bind(input.businessId,input.businessId,id,input.startDate),
    db.prepare(`UPDATE appointments SET status = 'cancelada', cancellation_reason = ?
      WHERE business_id = ? AND recurring_series_id = ? AND appointment_date >= ?
        AND status IN ('programada','confirmada')`)
      .bind(replacementReason,input.businessId,id,input.startDate),
    db.prepare(`UPDATE recurring_appointment_series SET client_id = ?, service_id = ?, professional_id = ?,
      frequency = ?, start_date = ?, end_date = ?, start_time = ?, notes = ?, updated_at = ?
      WHERE id = ? AND business_id = ?`)
      .bind(clientId,input.serviceId,input.professionalId,input.frequency,input.startDate,input.endDate,
        input.time,input.notes,now,id,input.businessId),
  ];
  appendOccurrenceInserts(db,statements,input,schedule.service,clientId,id,accepted,now);
  statements.push(auditStatement(db,input,id,"recurring_series.updated",now,{
    effectiveFrom:input.startDate,createdCount:accepted.length,skippedCount:skipped.length,
  }));
  await executeSeriesBatch(db,statements);
  return { id, createdCount:accepted.length, skipped, duplicate:false };
}

export async function cancelRecurringSeries(db:D1Database,input:{
  id:string;businessId:string;timezone:string;reason:string;actor:AuthUser;
}) {
  const id = cleanText(input.id,80);
  const reason = cleanText(input.reason,180);
  if (!id || !reason) throw new HttpError(400,"Indica el motivo de la cancelación.");
  const series = await db.prepare(`SELECT status FROM recurring_appointment_series
    WHERE id = ? AND business_id = ?`).bind(id,input.businessId).first<{status:string}>();
  if (!series) throw new HttpError(404,"Serie recurrente no encontrada.");
  if (series.status === "cancelled") return {id,cancelledCount:0};
  const effectiveFrom = localDate(input.timezone);
  await ensureNoPaidFutureAppointments(db,input.businessId,id,effectiveFrom);
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM appointments
    WHERE business_id = ? AND recurring_series_id = ? AND appointment_date >= ?
      AND status IN ('programada','confirmada')`).bind(input.businessId,id,effectiveFrom).first<{count:number}>();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`DELETE FROM appointment_slots WHERE business_id = ? AND appointment_id IN (
      SELECT id FROM appointments WHERE business_id = ? AND recurring_series_id = ?
        AND appointment_date >= ? AND status IN ('programada','confirmada'))`)
      .bind(input.businessId,input.businessId,id,effectiveFrom),
    db.prepare(`UPDATE appointments SET status = 'cancelada', cancellation_reason = ?
      WHERE business_id = ? AND recurring_series_id = ? AND appointment_date >= ?
        AND status IN ('programada','confirmada')`).bind(reason,input.businessId,id,effectiveFrom),
    db.prepare(`UPDATE recurring_appointment_series SET status = 'cancelled', updated_at = ?
      WHERE id = ? AND business_id = ?`).bind(now,id,input.businessId),
    auditStatement(db,{businessId:input.businessId,actor:input.actor},id,"recurring_series.cancelled",now,{reason,cancelledCount:count?.count??0}),
  ]);
  return {id,cancelledCount:count?.count??0};
}

function prepareInput(raw:RecurringSeriesInput):PreparedSeriesInput {
  const frequency = cleanText(raw.frequency,16);
  const input = {
    ...raw,
    name:cleanText(raw.name,100),email:normalizeEmail(raw.email),phone:cleanText(raw.phone,25),
    serviceId:cleanText(raw.serviceId,80),professionalId:cleanText(raw.professionalId,80),
    frequency:frequency as RecurrenceFrequency,startDate:cleanText(raw.startDate,10),
    endDate:cleanText(raw.endDate,10),time:cleanText(raw.time,5),notes:cleanText(raw.notes,500),
  };
  if (!input.name || !isEmail(input.email) || !isPhone(input.phone)) throw new HttpError(400,"Revisa el nombre, email y teléfono.");
  if (!input.serviceId || !input.professionalId) throw new HttpError(400,"Selecciona un servicio y un profesional.");
  if (!["weekly","biweekly","monthly"].includes(input.frequency)) throw new HttpError(400,"Frecuencia no válida.");
  if (!isDate(input.startDate) || !isDate(input.endDate) || input.startDate > input.endDate || !isTime(input.time)) {
    throw new HttpError(400,"Revisa las fechas y la hora de la serie.");
  }
  if (input.startDate < localDate(input.timezone)) throw new HttpError(400,"La fecha inicial ya pasó.");
  return input;
}

function requireOccurrenceDates(input:PreparedSeriesInput) {
  const dates = generateRecurringDates(input.startDate,input.endDate,input.frequency);
  if (!dates.length) throw new HttpError(400,"La serie no contiene ninguna fecha.");
  const next = nextRecurringDate(input.startDate,input.frequency,dates.length);
  if (dates.length === 52 && next <= input.endDate) throw new HttpError(400,"Una serie puede contener como máximo 52 citas.");
  return dates;
}

async function loadSchedule(db:D1Database,input:PreparedSeriesInput,exclude?:{seriesId:string;effectiveFrom:string}) {
  const appointmentsSql = exclude
    ? `SELECT appointment_date AS date,start_time AS startTime,end_time AS endTime FROM appointments
       WHERE business_id = ? AND professional_id = ? AND appointment_date BETWEEN ? AND ?
         AND status NOT IN ('cancelada','no_asistio')
         AND NOT (recurring_series_id = ? AND appointment_date >= ? AND status IN ('programada','confirmada'))`
    : `SELECT appointment_date AS date,start_time AS startTime,end_time AS endTime FROM appointments
       WHERE business_id = ? AND professional_id = ? AND appointment_date BETWEEN ? AND ?
         AND status NOT IN ('cancelada','no_asistio')`;
  const appointmentsStatement = exclude
    ? db.prepare(appointmentsSql).bind(input.businessId,input.professionalId,input.startDate,input.endDate,exclude.seriesId,exclude.effectiveFrom)
    : db.prepare(appointmentsSql).bind(input.businessId,input.professionalId,input.startDate,input.endDate);
  const [service,professional,hours,appointments,blocks] = await Promise.all([
    db.prepare(`SELECT name,duration_minutes AS duration,price_cents AS price FROM services
      WHERE id = ? AND business_id = ? AND active = 1`).bind(input.serviceId,input.businessId).first<ServiceRow>(),
    db.prepare(`SELECT p.id FROM professionals p JOIN professional_services ps
      ON ps.business_id = p.business_id AND ps.professional_id = p.id
      WHERE p.id = ? AND p.business_id = ? AND p.active = 1 AND ps.service_id = ?`)
      .bind(input.professionalId,input.businessId,input.serviceId).first(),
    db.prepare(`SELECT weekday,start_time AS startTime,end_time AS endTime FROM business_hours
      WHERE business_id = ? AND professional_id = ? AND active = 1`).bind(input.businessId,input.professionalId)
      .all<{weekday:number;startTime:string;endTime:string}>(),
    appointmentsStatement.all<ScheduleRange>(),
    db.prepare(`SELECT block_date AS date,start_time AS startTime,end_time AS endTime FROM time_blocks
      WHERE business_id = ? AND professional_id = ? AND block_date BETWEEN ? AND ?`)
      .bind(input.businessId,input.professionalId,input.startDate,input.endDate).all<ScheduleRange>(),
  ]);
  if (!service || !professional) throw new HttpError(404,"Servicio o profesional no disponible.");
  return {service,hours:hours.results??[],appointments:appointments.results??[],blocks:blocks.results??[]};
}

function availableOccurrences(input:PreparedSeriesInput,dates:string[],schedule:Awaited<ReturnType<typeof loadSchedule>>) {
  const accepted:string[] = [];
  const skipped:{date:string;reason:string}[] = [];
  const start = timeToMinutes(input.time);
  const end = start + schedule.service.duration;
  for (const date of dates) {
    const hours = schedule.hours.find((item)=>item.weekday===weekdayForDate(date));
    if (!hours || start < timeToMinutes(hours.startTime) || end > timeToMinutes(hours.endTime)) {
      skipped.push({date,reason:"fuera_del_horario"});
      continue;
    }
    const busy = [...schedule.appointments,...schedule.blocks].filter((item)=>item.date===date);
    if (busy.some((item)=>start < timeToMinutes(item.endTime) && end > timeToMinutes(item.startTime))) {
      skipped.push({date,reason:"horario_ocupado"});
      continue;
    }
    accepted.push(date);
  }
  return {accepted,skipped};
}

async function upsertClient(db:D1Database,input:PreparedSeriesInput) {
  const id = crypto.randomUUID();
  const client = await db.prepare(`INSERT INTO clients (id,business_id,name,email,phone,notes,created_at)
    VALUES (?,?,?,?,?,'',?) ON CONFLICT(business_id,email) DO UPDATE SET
      name=excluded.name,phone=excluded.phone RETURNING id`)
    .bind(id,input.businessId,input.name,input.email,input.phone,new Date().toISOString()).first<{id:string}>();
  if (!client) throw new HttpError(500,"No se pudo preparar el cliente de la serie.");
  return client.id;
}

function appendOccurrenceInserts(db:D1Database,statements:D1PreparedStatement[],input:PreparedSeriesInput,
  service:ServiceRow,clientId:string,seriesId:string,dates:string[],now:string) {
  const endTime = minutesToTime(timeToMinutes(input.time)+service.duration);
  dates.forEach((date,index)=>statements.push(db.prepare(`INSERT INTO appointments
    (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,
     source,notes,cancellation_reason,recurring_series_id,occurrence_number,total_cents,created_at)
    VALUES (?,?,?,?,?,?,?,?,'programada','recurring',?,'',?,?,?,?)`)
    .bind(crypto.randomUUID(),input.businessId,clientId,input.serviceId,input.professionalId,date,input.time,
      endTime,input.notes,seriesId,index+1,service.price,now)));
}

function auditStatement(db:D1Database,input:Pick<PreparedSeriesInput,"businessId"|"actor">,seriesId:string,
  action:string,now:string,metadata:Record<string,string|number|boolean|null>) {
  return db.prepare(`INSERT INTO audit_logs
    (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
    VALUES (?,?,?,?,?,'recurring_series',?,?,?)`)
    .bind(crypto.randomUUID(),input.businessId,input.actor.userId,input.actor.email,action,seriesId,JSON.stringify(metadata),now);
}

async function executeSeriesBatch(db:D1Database,statements:D1PreparedStatement[]) {
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("appointment_time_overlap") || message.includes("appointment_time_block_overlap") || message.includes("UNIQUE constraint")) {
      throw new HttpError(409,"Uno de los horarios acaba de ocuparse. Revisa la serie e inténtalo de nuevo.");
    }
    throw error;
  }
}

async function ensureNoPaidFutureAppointments(db:D1Database,businessId:string,seriesId:string,effectiveFrom:string) {
  const paid = await db.prepare(`SELECT COUNT(DISTINCT appointment.id) AS count FROM appointments appointment
    JOIN payments payment ON payment.business_id = appointment.business_id AND payment.appointment_id = appointment.id
      AND payment.status = 'completed'
    WHERE appointment.business_id = ? AND appointment.recurring_series_id = ?
      AND appointment.appointment_date >= ? AND appointment.status IN ('programada','confirmada')`)
    .bind(businessId,seriesId,effectiveFrom).first<{count:number}>();
  if ((paid?.count??0)>0) throw new HttpError(409,"La serie tiene citas futuras con cobros. Anula esos cobros antes de modificarla.");
}

async function activeOccurrenceCount(db:D1Database,businessId:string,seriesId:string) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM appointments
    WHERE business_id = ? AND recurring_series_id = ? AND status NOT IN ('cancelada','no_asistio')`)
    .bind(businessId,seriesId).first<{count:number}>();
  return row?.count??0;
}
