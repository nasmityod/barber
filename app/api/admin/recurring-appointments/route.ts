import { ensureDatabase } from "../../../../db/init";
import { cancelRecurringSeries, createRecurringSeries, updateRecurringSeries } from "../../../recurring-appointments";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, localDate, normalizeEmail, readJson, sha256,
} from "../../../security";

type SeriesPayload = {
  id?:unknown;name?:unknown;email?:unknown;phone?:unknown;serviceId?:unknown;professionalId?:unknown;
  frequency?:unknown;startDate?:unknown;endDate?:unknown;time?:unknown;notes?:unknown;
};

type CancelPayload = {id?:unknown;reason?:unknown};

export async function GET() {
  try {
    const context = await getAdminContext("appointments.read");
    if (!context) throw new HttpError(401,"Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const today = localDate(context.timezone);
    const result = await db.prepare(`SELECT series.id,series.status,series.frequency,
      series.start_date AS startDate,series.end_date AS endDate,series.start_time AS time,
      series.notes,series.created_at AS createdAt,series.updated_at AS updatedAt,
      client.id AS clientId,client.name AS clientName,client.email,client.phone,
      service.id AS serviceId,service.name AS serviceName,
      professional.id AS professionalId,professional.name AS professionalName,
      COUNT(appointment.id) AS totalCount,
      SUM(CASE WHEN appointment.status NOT IN ('cancelada','no_asistio') THEN 1 ELSE 0 END) AS activeCount,
      SUM(CASE WHEN appointment.appointment_date >= ? AND appointment.status IN ('programada','confirmada') THEN 1 ELSE 0 END) AS futureCount,
      MIN(CASE WHEN appointment.appointment_date >= ? AND appointment.status IN ('programada','confirmada') THEN appointment.appointment_date END) AS nextDate
      FROM recurring_appointment_series series
      JOIN clients client ON client.id = series.client_id AND client.business_id = series.business_id
      JOIN services service ON service.id = series.service_id AND service.business_id = series.business_id
      JOIN professionals professional ON professional.id = series.professional_id AND professional.business_id = series.business_id
      LEFT JOIN appointments appointment ON appointment.business_id = series.business_id
        AND appointment.recurring_series_id = series.id
      WHERE series.business_id = ?
      GROUP BY series.id,client.id,service.id,professional.id
      ORDER BY CASE WHEN series.status = 'active' THEN 0 ELSE 1 END,series.updated_at DESC
      LIMIT 100`).bind(today,today,context.businessId).all();
    return Response.json({series:result.results??[]},{headers:{"cache-control":"no-store"}});
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401,"Inicia sesión para continuar.");
    const body = await readJson<SeriesPayload>(request);
    const db = await ensureDatabase();
    await enforceRateLimit(db,`admin-recurring:${context.user.userId}`,20,60*1000);
    const idempotencyKey = request.headers.get("idempotency-key")??"";
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(idempotencyKey)) throw new HttpError(400,"Solicitud no válida.");
    const result = await createRecurringSeries(db,{
      ...seriesInput(body,context),idempotencyHash:await sha256(`${context.businessId}:recurring:${idempotencyKey}`),
    });
    return Response.json(result,{status:result.duplicate?200:201,headers:{"cache-control":"no-store"}});
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request:Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401,"Inicia sesión para continuar.");
    const body = await readJson<SeriesPayload>(request);
    const db = await ensureDatabase();
    await enforceRateLimit(db,`admin-recurring:${context.user.userId}`,20,60*1000);
    const result = await updateRecurringSeries(db,{...seriesInput(body,context),id:cleanText(body.id,80)});
    return Response.json(result,{headers:{"cache-control":"no-store"}});
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request:Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("appointments.write");
    if (!context) throw new HttpError(401,"Inicia sesión para continuar.");
    const body = await readJson<CancelPayload>(request);
    const db = await ensureDatabase();
    await enforceRateLimit(db,`admin-recurring:${context.user.userId}`,20,60*1000);
    const result = await cancelRecurringSeries(db,{
      id:cleanText(body.id,80),businessId:context.businessId,timezone:context.timezone,
      reason:cleanText(body.reason,180),actor:context.user,
    });
    return Response.json(result,{headers:{"cache-control":"no-store"}});
  } catch (error) {
    return errorResponse(error);
  }
}

function seriesInput(body:SeriesPayload,context:NonNullable<Awaited<ReturnType<typeof getAdminContext>>>) {
  return {
    businessId:context.businessId,timezone:context.timezone,actor:context.user,
    name:cleanText(body.name,100),email:normalizeEmail(body.email),phone:cleanText(body.phone,25),
    serviceId:cleanText(body.serviceId,80),professionalId:cleanText(body.professionalId,80),
    frequency:cleanText(body.frequency,16),startDate:cleanText(body.startDate,10),
    endDate:cleanText(body.endDate,10),time:cleanText(body.time,5),notes:cleanText(body.notes,500),
  };
}
