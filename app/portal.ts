import { sha256 } from "./security";

export type PortalAppointment = {
  tokenHash: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  timezone: string;
  currency: string;
  timeFormat: string;
  appointmentId: string;
  status: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  resourceId: string | null;
  totalCents: number;
  allowClientCancellation: number;
  cancellationWindowHours: number;
  cancellationFeePercent: number;
  requireConfirmation: number;
  bookingLeadMinutes: number;
  bookingMaxDays: number;
  expiresAt: string;
};

export async function createAppointmentPortalToken(db: D1Database, businessId: string, appointmentId: string, seed: string) {
  const token = await sha256(`corteza-appointment-portal:${businessId}:${appointmentId}:${seed}`);
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 370 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(`INSERT OR IGNORE INTO appointment_portal_tokens
    (token_hash,business_id,appointment_id,expires_at,created_at) VALUES (?,?,?,?,?)`)
    .bind(tokenHash, businessId, appointmentId, expiresAt, now).run();
  return token;
}

export async function getPortalAppointment(db: D1Database, token: string, touch = false) {
  if (!/^[a-f0-9]{64}$/u.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT access.token_hash AS tokenHash,
      access.business_id AS businessId, access.expires_at AS expiresAt,
      business.name AS businessName, business.slug AS businessSlug, business.timezone, business.currency,
      COALESCE(settings.time_format, '24h') AS timeFormat,
      appointment.id AS appointmentId, appointment.status,
      appointment.appointment_date AS appointmentDate, appointment.start_time AS startTime,
      appointment.end_time AS endTime, appointment.notes,
      client.id AS clientId, client.name AS clientName, client.email AS clientEmail, client.phone AS clientPhone,
      service.id AS serviceId, service.name AS serviceName,
      professional.id AS professionalId, professional.name AS professionalName,
      appointment.resource_id AS resourceId,
      appointment.total_cents AS totalCents,
      COALESCE(settings.allow_client_cancellation, 1) AS allowClientCancellation,
      COALESCE(settings.cancellation_window_hours, 24) AS cancellationWindowHours,
      COALESCE(settings.cancellation_fee_percent, 0) AS cancellationFeePercent,
      COALESCE(settings.require_confirmation, 0) AS requireConfirmation,
      COALESCE(settings.booking_lead_minutes, 60) AS bookingLeadMinutes,
      COALESCE(settings.booking_max_days, 60) AS bookingMaxDays
    FROM appointment_portal_tokens access
    JOIN appointments appointment ON appointment.id = access.appointment_id
      AND appointment.business_id = access.business_id
    JOIN businesses business ON business.id = access.business_id
    JOIN clients client ON client.id = appointment.client_id AND client.business_id = appointment.business_id
    JOIN services service ON service.id = appointment.service_id AND service.business_id = appointment.business_id
    JOIN professionals professional ON professional.id = appointment.professional_id AND professional.business_id = appointment.business_id
    LEFT JOIN business_settings settings ON settings.business_id = business.id
    WHERE access.token_hash = ? LIMIT 1`).bind(tokenHash).first<PortalAppointment>();
  if (!row || row.expiresAt <= new Date().toISOString()) return null;
  if (touch) {
    await db.prepare("UPDATE appointment_portal_tokens SET last_accessed_at=? WHERE token_hash=?")
      .bind(new Date().toISOString(), tokenHash).run();
  }
  return row;
}

export function portalDetails(row: PortalAppointment) {
  return {
    business: { name: row.businessName, slug: row.businessSlug, timezone: row.timezone, currency: row.currency, timeFormat: row.timeFormat },
    appointment: {
      id: row.appointmentId, status: row.status, date: row.appointmentDate, time: row.startTime,
      endTime: row.endTime, notes: row.notes, serviceName: row.serviceName,
      serviceId: row.serviceId, professionalId: row.professionalId, professionalName: row.professionalName, totalCents: row.totalCents,
    },
    client: { name: row.clientName, email: row.clientEmail, phone: row.clientPhone },
    policy: {
      allowClientCancellation: row.allowClientCancellation === 1,
      cancellationWindowHours: row.cancellationWindowHours,
      cancellationFeePercent: row.cancellationFeePercent,
      requireConfirmation: row.requireConfirmation === 1,
      bookingLeadMinutes: row.bookingLeadMinutes,
      bookingMaxDays: row.bookingMaxDays,
    },
    expiresAt: row.expiresAt,
  };
}
