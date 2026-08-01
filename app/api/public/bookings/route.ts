import { ensureDatabase } from "../../../../db/init";
import { createAppointment } from "../../../appointments";
import {
  assertSameOrigin, clientAddress, cleanText, enforceRateLimit, errorResponse,
  HttpError, normalizeEmail, readJson, sha256,
} from "../../../security";

type BookingPayload = {
  slug?: unknown; name?: unknown; email?: unknown; phone?: unknown; serviceId?: unknown;
  professionalId?: unknown; date?: unknown; time?: unknown; notes?: unknown;
  website?: unknown; formStartedAt?: unknown;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<BookingPayload>(request);
    if (cleanText(body.website, 200)) {
      return Response.json({ message: "Reserva recibida" }, { status: 201, headers: { "cache-control": "no-store" } });
    }
    const startedAt = Number(body.formStartedAt);
    const elapsed = Date.now() - startedAt;
    if (!Number.isFinite(startedAt) || elapsed < 1_500 || elapsed > 2 * 60 * 60 * 1000) {
      throw new HttpError(400, "Actualiza la página e inténtalo de nuevo.");
    }
    const slug = cleanText(body.slug, 63).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug)) throw new HttpError(400, "Negocio no válido.");
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(idempotencyKey)) throw new HttpError(400, "Solicitud no válida.");

    const db = await ensureDatabase();
    const business = await db.prepare("SELECT id, timezone FROM businesses WHERE slug = ?")
      .bind(slug).first<{ id: string; timezone: string }>();
    if (!business) throw new HttpError(404, "Barbería no encontrada.");
    const daily = new Date().toISOString().slice(0, 10);
    const addressHash = await sha256(`${daily}:${clientAddress(request)}`);
    const emailHash = await sha256(`${daily}:${normalizeEmail(body.email)}`);
    await enforceRateLimit(db, `booking-ip:${business.id}:${addressHash}`, 8, 10 * 60 * 1000);
    await enforceRateLimit(db, `booking-email:${business.id}:${emailHash}`, 5, 30 * 60 * 1000);
    const idempotencyHash = await sha256(`${business.id}:${idempotencyKey}`);
    const result = await createAppointment(db, {
      businessId: business.id, timezone: business.timezone,
      name: cleanText(body.name, 100), email: normalizeEmail(body.email), phone: cleanText(body.phone, 25),
      serviceId: cleanText(body.serviceId, 80), professionalId: cleanText(body.professionalId, 80),
      date: cleanText(body.date, 10), time: cleanText(body.time, 5), notes: cleanText(body.notes, 500),
      source: "online", idempotencyHash,
    });
    return Response.json({ id: result.id, message: result.duplicate ? "Reserva ya confirmada" : "Reserva confirmada" },
      { status: result.duplicate ? 200 : 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
