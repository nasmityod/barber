import { ensureDatabase } from "../db/init";
import { localDateAfter } from "./security";

/**
 * Mantenimiento programado del Worker (cron):
 * 1. Encola recordatorios idempotentes para las citas de mañana de cada negocio (zona horaria propia).
 * 2. Expira solicitudes de pago vencidas.
 * 3. Limpia ventanas de rate limiting caducadas.
 * El envío final se confirma desde el panel (WhatsApp/email con un clic) hasta conectar un proveedor externo.
 */
export async function runScheduledMaintenance() {
  const db = await ensureDatabase();
  const now = new Date().toISOString();

  const businesses = await db.prepare(`SELECT DISTINCT b.id, b.name, b.timezone
    FROM businesses b JOIN appointments a ON a.business_id = b.id
    WHERE a.appointment_date BETWEEN date('now','-1 day') AND date('now','+2 day')
      AND a.status IN ('programada','confirmada')
    LIMIT 200`).all<{ id:string; name:string; timezone:string }>();

  let queuedTotal = 0;
  for (const business of businesses.results ?? []) {
    const target = safeTomorrow(business.timezone);
    const channels = [
      { channel: "whatsapp", recipientSql: "c.phone", guardSql: "c.phone <> ''" },
      { channel: "email", recipientSql: "c.email", guardSql: "c.email <> '' AND c.email NOT LIKE '%@local.invalid'" },
    ] as const;
    let queuedForBusiness = 0;
    for (const { channel, recipientSql, guardSql } of channels) {
      const inserted = await db.prepare(`INSERT INTO message_logs
          (id,business_id,client_id,appointment_id,channel,kind,recipient,body,status,scheduled_at,created_at)
        SELECT lower(hex(randomblob(16))), a.business_id, a.client_id, a.id, ?1, 'appointment_reminder', ${recipientSql},
          'Hola ' || c.name || ', te recordamos tu cita de ' || s.name || ' el ' || a.appointment_date ||
            ' a las ' || a.start_time || ' en ' || ?2 || '. ¡Te esperamos!',
          'queued', ?3, ?4
        FROM appointments a
        JOIN clients c ON c.id = a.client_id AND c.business_id = a.business_id
        JOIN services s ON s.id = a.service_id AND s.business_id = a.business_id
        WHERE a.business_id = ?5 AND a.appointment_date = ?3 AND a.status IN ('programada','confirmada')
          AND ${guardSql}
          AND NOT EXISTS (SELECT 1 FROM message_logs m
            WHERE m.business_id = a.business_id AND m.appointment_id = a.id
              AND m.kind = 'appointment_reminder' AND m.channel = ?1 AND m.scheduled_at = ?3)`)
        .bind(channel, business.name, target, now, business.id).run();
      queuedForBusiness += inserted.meta.changes ?? 0;
    }
    if (queuedForBusiness > 0) {
      await db.prepare(`INSERT INTO alerts (id,business_id,kind,title,message,severity,created_at)
        VALUES (?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), business.id, "reminders", "Recordatorios listos para enviar",
          `Se prepararon ${queuedForBusiness} recordatorio(s) para las citas del ${target}. Envíalos desde Marketing → Mensajes.`,
          "info", now).run();
      queuedTotal += queuedForBusiness;
    }
  }

  const expired = await db.prepare("UPDATE payment_requests SET status='expired' WHERE status='pending' AND expires_at < ?")
    .bind(now).run();
  const cleaned = await db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(Date.now()).run();

  return {
    remindersQueued: queuedTotal,
    paymentRequestsExpired: expired.meta.changes ?? 0,
    rateLimitsCleaned: cleaned.meta.changes ?? 0,
  };
}

function safeTomorrow(timezone: string) {
  try {
    return localDateAfter(timezone, 1);
  } catch {
    return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  }
}
