import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  hasPermission, HttpError, isDate, isTime, localDate, readJson, timeToMinutes, weekdayForDate,
} from "../../../security";

type TimeBlockPayload = {
  id?: unknown;
  professionalId?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  reason?: unknown;
  days?: unknown;
};

type WeeklyScheduleDay = { weekday: number; active: boolean; startTime: string; endTime: string };

export async function GET() {
  try {
    const context = await getAdminContext("appointments.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const today = localDate(context.timezone);
    const [hours, blocks] = await Promise.all([
      db.prepare(`SELECT id, professional_id AS professionalId, weekday,
        start_time AS startTime, end_time AS endTime, active
        FROM business_hours
        WHERE business_id = ?
        ORDER BY professional_id, weekday, start_time`)
        .bind(context.businessId).all(),
      db.prepare(`SELECT b.id, b.professional_id AS professionalId, p.name AS professionalName,
        b.block_date AS date, b.start_time AS startTime, b.end_time AS endTime,
        b.reason, b.created_at AS createdAt
        FROM time_blocks b
        JOIN professionals p ON p.id = b.professional_id AND p.business_id = b.business_id
        WHERE b.business_id = ? AND b.block_date >= ?
        ORDER BY b.block_date, b.start_time
        LIMIT 200`)
        .bind(context.businessId, today).all(),
    ]);
    return Response.json({
      hours: hours.results ?? [],
      blocks: blocks.results ?? [],
      canManage: context.role !== "professional",
      canManageSchedule: hasPermission(context.role, "professionals.write"),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("professionals.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<TimeBlockPayload>(request, 8192);
    const professionalId = cleanText(body.professionalId, 80);
    const days = validateWeeklySchedule(body.days);
    if (!professionalId) throw new HttpError(400, "Profesional no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `schedule-write:${context.user.userId}`, 60, 60 * 60 * 1000);
    const professional = await db.prepare("SELECT id FROM professionals WHERE id = ? AND business_id = ?")
      .bind(professionalId, context.businessId).first();
    if (!professional) throw new HttpError(404, "Profesional no encontrado.");

    const today = localDate(context.timezone);
    const conflicts = await db.batch(days.map((day) => db.prepare(`SELECT id, appointment_date AS date,
      start_time AS startTime, end_time AS endTime FROM appointments
      WHERE business_id = ? AND professional_id = ? AND appointment_date >= ?
        AND status NOT IN ('cancelada','no_asistio')
        AND CAST(strftime('%w', appointment_date) AS INTEGER) = ?
        AND (? = 0 OR start_time < ? OR end_time > ?)
      LIMIT 1`).bind(context.businessId, professionalId, today, day.weekday, day.active ? 1 : 0, day.startTime, day.endTime)));
    const conflict = conflicts.find((result) => (result.results?.length ?? 0) > 0)?.results?.[0] as {date?:string;startTime?:string}|undefined;
    if (conflict) {
      throw new HttpError(409, `El nuevo horario deja fuera la cita del ${conflict.date ?? "calendario"} a las ${conflict.startTime ?? "hora registrada"}.`);
    }

    await db.batch(days.map((day) => db.prepare(`INSERT INTO business_hours
      (id,business_id,professional_id,weekday,start_time,end_time,active)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(business_id,professional_id,weekday) DO UPDATE SET
        start_time = excluded.start_time, end_time = excluded.end_time, active = excluded.active`)
      .bind(crypto.randomUUID(), context.businessId, professionalId, day.weekday, day.startTime, day.endTime, day.active ? 1 : 0)));
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO audit_logs
      (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
      VALUES (?,?,?,?, 'schedule.hours_updated','professional',?,?,?)`)
      .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email, professionalId,
        JSON.stringify({ days }), now).run();
    const hours = await db.prepare(`SELECT id, professional_id AS professionalId, weekday,
      start_time AS startTime, end_time AS endTime, active FROM business_hours
      WHERE business_id = ? AND professional_id = ? ORDER BY weekday`)
      .bind(context.businessId, professionalId).all();
    return Response.json({ hours: hours.results ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<TimeBlockPayload>(request);
    const professionalId = cleanText(body.professionalId, 80);
    const date = cleanText(body.date, 10);
    const startTime = cleanText(body.startTime, 5);
    const endTime = cleanText(body.endTime, 5);
    const reason = cleanText(body.reason, 160);
    if (!professionalId || !isDate(date) || !isTime(startTime) || !isTime(endTime)) {
      throw new HttpError(400, "Revisa el profesional, la fecha y las horas.");
    }
    if (date < localDate(context.timezone)) throw new HttpError(400, "No puedes bloquear una fecha pasada.");
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new HttpError(400, "La hora final debe ser posterior a la inicial.");
    }

    const db = await ensureDatabase();
    await enforceRateLimit(db, `schedule-write:${context.user.userId}`, 60, 60 * 60 * 1000);
    const professional = await db.prepare(`SELECT id, name FROM professionals
      WHERE id = ? AND business_id = ? AND active = 1`)
      .bind(professionalId, context.businessId).first<{ id: string; name: string }>();
    if (!professional) throw new HttpError(404, "Profesional no disponible.");
    const hours = await db.prepare(`SELECT start_time AS startTime, end_time AS endTime
      FROM business_hours
      WHERE business_id = ? AND professional_id = ? AND weekday = ? AND active = 1`)
      .bind(context.businessId, professionalId, weekdayForDate(date))
      .first<{ startTime: string; endTime: string }>();
    if (!hours) throw new HttpError(409, "Ese profesional no trabaja en la fecha seleccionada.");
    if (timeToMinutes(startTime) < timeToMinutes(hours.startTime) || timeToMinutes(endTime) > timeToMinutes(hours.endTime)) {
      throw new HttpError(400, `El bloqueo debe estar entre ${hours.startTime} y ${hours.endTime}.`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.batch([
        db.prepare(`INSERT INTO time_blocks
          (id,business_id,professional_id,block_date,start_time,end_time,reason,created_at)
          VALUES (?,?,?,?,?,?,?,?)`)
          .bind(id, context.businessId, professionalId, date, startTime, endTime, reason, now),
        db.prepare(`INSERT INTO audit_logs
          (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
          VALUES (?,?,?,?, 'schedule.block_created','time_block',?,?,?)`)
          .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email, id,
            JSON.stringify({ professionalId, date, startTime, endTime, reason }), now),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("time_block_appointment_overlap")) {
        throw new HttpError(409, "Ya existe una cita activa dentro de ese horario.");
      }
      if (message.includes("time_block_overlap")) {
        throw new HttpError(409, "Ese horario ya está cubierto por otro bloqueo.");
      }
      throw error;
    }

    return Response.json({ block: {
      id, professionalId, professionalName: professional.name, date, startTime, endTime, reason, createdAt: now,
    } }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<TimeBlockPayload>(request);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Bloqueo no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `schedule-write:${context.user.userId}`, 60, 60 * 60 * 1000);
    const block = await db.prepare(`SELECT professional_id AS professionalId, block_date AS date,
      start_time AS startTime, end_time AS endTime, reason
      FROM time_blocks WHERE id = ? AND business_id = ?`)
      .bind(id, context.businessId)
      .first<{ professionalId: string; date: string; startTime: string; endTime: string; reason: string }>();
    if (!block) throw new HttpError(404, "Bloqueo no encontrado.");
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("DELETE FROM time_blocks WHERE id = ? AND business_id = ?").bind(id, context.businessId),
      db.prepare(`INSERT INTO audit_logs
        (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
        VALUES (?,?,?,?, 'schedule.block_deleted','time_block',?,?,?)`)
        .bind(crypto.randomUUID(), context.businessId, context.user.userId, context.user.email, id,
          JSON.stringify(block), now),
    ]);
    return Response.json({ id, message: "Bloqueo eliminado" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function validateWeeklySchedule(value: unknown): WeeklyScheduleDay[] {
  if (!Array.isArray(value) || value.length !== 7) throw new HttpError(400, "Debes configurar los siete días de la semana.");
  const days = value.map((item) => {
    if (!item || typeof item !== "object") throw new HttpError(400, "Horario semanal no válido.");
    const input = item as Record<string, unknown>;
    const weekday = Number(input.weekday);
    const active = input.active === true || input.active === 1 || input.active === "1" || input.active === "true" || input.active === "on";
    const startTime = cleanText(input.startTime, 5);
    const endTime = cleanText(input.endTime, 5);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !isTime(startTime) || !isTime(endTime) || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new HttpError(400, "Revisa los días y las horas del horario semanal.");
    }
    return { weekday, active, startTime, endTime };
  });
  if (new Set(days.map((day) => day.weekday)).size !== 7) throw new HttpError(400, "Cada día de la semana debe aparecer una sola vez.");
  return days;
}
