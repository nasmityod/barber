import { ensureDatabase } from "../../../db/init";

type AppointmentPayload = {
  name?: string; email?: string; phone?: string; serviceId?: string;
  professionalId?: string; date?: string; time?: string; notes?: string; source?: string;
};

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const db = await ensureDatabase();
    const result = await db.prepare(`SELECT a.id, a.appointment_date AS date, a.start_time AS time,
      a.status, a.source, a.total_cents AS totalCents, c.name AS clientName,
      c.phone, s.name AS serviceName, p.name AS professionalName
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services s ON s.id = a.service_id
      JOIN professionals p ON p.id = a.professional_id
      WHERE a.business_id = 'biz_demo'
      ORDER BY a.appointment_date ASC, a.start_time ASC LIMIT 60`).all();
    return Response.json({ appointments: result.results ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las citas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AppointmentPayload;
    const required = [body.name, body.email, body.phone, body.serviceId, body.professionalId, body.date, body.time];
    if (required.some((value) => !value?.trim())) {
      return Response.json({ error: "Completa todos los campos requeridos" }, { status: 400 });
    }
    const db = await ensureDatabase();
    const service = await db.prepare("SELECT duration_minutes AS duration, price_cents AS price FROM services WHERE id = ? AND active = 1")
      .bind(body.serviceId).first<{ duration: number; price: number }>();
    if (!service) return Response.json({ error: "Servicio no disponible" }, { status: 404 });

    const collision = await db.prepare(`SELECT id FROM appointments WHERE professional_id = ?
      AND appointment_date = ? AND start_time = ? AND status NOT IN ('cancelada','no_asistio')`)
      .bind(body.professionalId, body.date, body.time).first();
    if (collision) return Response.json({ error: "Ese horario acaba de ocuparse. Elige otro." }, { status: 409 });

    const now = new Date().toISOString();
    let client = await db.prepare("SELECT id FROM clients WHERE business_id = 'biz_demo' AND email = ?")
      .bind(body.email!.trim().toLowerCase()).first<{ id: string }>();
    if (!client) {
      client = { id: crypto.randomUUID() };
      await db.prepare("INSERT INTO clients (id,business_id,name,email,phone,notes,created_at) VALUES (?,'biz_demo',?,?,?,?,?)")
        .bind(client.id, body.name!.trim(), body.email!.trim().toLowerCase(), body.phone!.trim(), "", now).run();
    } else {
      await db.prepare("UPDATE clients SET name = ?, phone = ? WHERE id = ?")
        .bind(body.name!.trim(), body.phone!.trim(), client.id).run();
    }

    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO appointments
      (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,created_at)
      VALUES (?,'biz_demo',?,?,?,?,?,'programada',?,?,?,?)`)
      .bind(id, client.id, body.serviceId, body.professionalId, body.date, body.time,
        addMinutes(body.time!, service.duration), body.source ?? "panel", body.notes?.trim() ?? "", service.price, now).run();
    return Response.json({ id, message: "Cita reservada" }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear la cita" }, { status: 500 });
  }
}
