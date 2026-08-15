import type { AuthUser } from "./auth";

type AppointmentCommissionRow = {
  appointmentId: string; professionalId: string; serviceId: string; professionalName: string; serviceName: string; category: string;
  totalCents: number; paidCents: number; sourcePaymentId: string | null;
};

type CommissionRuleRow = { id: string; name: string; kind: "percent" | "fixed"; value: number };

export type GeneratedCommission = {
  id: string; appointmentId: string; professionalId: string; serviceId: string; ruleId: string;
  amountCents: number; basisCents: number; status: "pending"; created?: boolean;
};

/** Creates the commission once an appointment is completed and fully paid. */
export async function generateCommissionForAppointment(db: D1Database, businessId: string, appointmentId: string) {
  const appointment = await db.prepare(`SELECT a.id AS appointmentId, a.professional_id AS professionalId, a.service_id AS serviceId,
      p.name AS professionalName, s.name AS serviceName, s.category,
      a.total_cents AS totalCents, COALESCE((SELECT SUM(payment.amount_cents) FROM payments payment
        WHERE payment.business_id=a.business_id AND payment.appointment_id=a.id AND payment.status='completed'),0) AS paidCents,
      (SELECT payment.id FROM payments payment WHERE payment.business_id=a.business_id AND payment.appointment_id=a.id
        AND payment.status='completed' ORDER BY payment.created_at DESC LIMIT 1) AS sourcePaymentId
    FROM appointments a JOIN professionals p ON p.id=a.professional_id AND p.business_id=a.business_id
    JOIN services s ON s.id=a.service_id AND s.business_id=a.business_id
    WHERE a.id=? AND a.business_id=? AND a.status='completada'`).bind(appointmentId, businessId).first<AppointmentCommissionRow>();
  if (!appointment || Number(appointment.paidCents) < Number(appointment.totalCents)) return null;

  const existing = await db.prepare("SELECT id,appointment_id AS appointmentId,professional_id AS professionalId,service_id AS serviceId,rule_id AS ruleId,amount_cents AS amountCents,basis_cents AS basisCents,status FROM commissions WHERE business_id=? AND appointment_id=?")
    .bind(businessId, appointmentId).first<GeneratedCommission>();
  if (existing) return existing;

  const rule = await db.prepare(`SELECT id,name,kind,value FROM commission_rules
    WHERE business_id=? AND active=1 AND (
      (scope='professional' AND professional_id=?) OR (scope='service' AND service_id=?) OR
      (scope='category' AND category=?) OR scope='default'
    ) ORDER BY priority DESC,
      CASE scope WHEN 'professional' THEN 4 WHEN 'service' THEN 3 WHEN 'category' THEN 2 ELSE 1 END DESC,
      created_at DESC LIMIT 1`).bind(businessId, appointment.professionalId, appointment.serviceId, appointment.category).first<CommissionRuleRow>();
  if (!rule) return null;

  const basisCents = Math.min(Number(appointment.totalCents), Number(appointment.paidCents));
  const amountCents = rule.kind === "fixed" ? Math.min(Number(rule.value), basisCents) : Math.floor(basisCents * Number(rule.value) / 10_000);
  if (amountCents <= 0) return null;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO commissions
      (id,business_id,appointment_id,professional_id,service_id,rule_id,source_payment_id,professional_name,service_name,rule_name,kind,value,basis_cents,amount_cents,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`).bind(
      id, businessId, appointmentId, appointment.professionalId, appointment.serviceId, rule.id, appointment.sourcePaymentId,
      appointment.professionalName, appointment.serviceName, rule.name, rule.kind, rule.value, basisCents, amountCents, now, now,
    ).run();
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (!message.includes("idx_commissions_business_appointment") && !message.includes("commissions.business_id, commissions.appointment_id")) throw error;
    return db.prepare("SELECT id,appointment_id AS appointmentId,professional_id AS professionalId,service_id AS serviceId,rule_id AS ruleId,amount_cents AS amountCents,basis_cents AS basisCents,status FROM commissions WHERE business_id=? AND appointment_id=?")
      .bind(businessId, appointmentId).first<GeneratedCommission>();
  }
  return { id, appointmentId, professionalId: appointment.professionalId, serviceId: appointment.serviceId, ruleId: rule.id, amountCents, basisCents, status: "pending", created: true } satisfies GeneratedCommission;
}

export async function auditGeneratedCommission(db: D1Database, businessId: string, user: AuthUser, commission: GeneratedCommission) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO audit_logs
    (id,business_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at)
    VALUES (?,?,?,?, 'commission.generated','commission',?,?,?)`).bind(
    crypto.randomUUID(), businessId, user.userId, user.email, commission.id,
    JSON.stringify({ appointmentId: commission.appointmentId, basisCents: commission.basisCents, amountCents: commission.amountCents, ruleId: commission.ruleId }), now,
  ).run();
}
