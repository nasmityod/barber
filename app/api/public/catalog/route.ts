import { ensureDatabase } from "../../../../db/init";
import { clientAddress, enforceRateLimit, errorResponse, HttpError, sha256 } from "../../../security";
import { barberAccent } from "../../../public-catalog";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug)) throw new HttpError(400, "Negocio no válido.");
    const db = await ensureDatabase();
    const rateKey = await sha256(`catalog:${new Date().toISOString().slice(0, 10)}:${clientAddress(request)}`);
    await enforceRateLimit(db, `catalog:${rateKey}`, 120, 60 * 60 * 1000);
    const business = await db.prepare(`SELECT business.id, business.name, business.slug, business.timezone, business.currency,
        COALESCE(settings.time_format, '12h') AS timeFormat,
        COALESCE(settings.business_phone, '') AS businessPhone,
        COALESCE(settings.business_email, '') AS businessEmail,
        COALESCE(settings.address, '') AS address,
        COALESCE(settings.whatsapp_number, '') AS whatsappNumber,
        COALESCE(settings.logo_url, '') AS logoUrl,
        COALESCE(settings.cover_image_url, '') AS coverImageUrl,
        COALESCE(settings.booking_lead_minutes, 60) AS bookingLeadMinutes,
        COALESCE(settings.booking_max_days, 60) AS bookingMaxDays,
        COALESCE(settings.allow_client_cancellation, 1) AS allowClientCancellation,
        COALESCE(settings.cancellation_window_hours, 24) AS cancellationWindowHours,
        COALESCE(settings.cancellation_fee_percent, 0) AS cancellationFeePercent,
        COALESCE(settings.show_prices, 1) AS showPrices,
        COALESCE(page.headline, 'Reserva tu silla. Sin llamadas, sin esperas.') AS headline,
        COALESCE(page.subtitle, 'Elige un servicio, consulta disponibilidad real y confirma sin esperas.') AS subtitle,
        COALESCE(page.primary_color, '#C79A2B') AS primaryColor,
        COALESCE(page.public_note, 'Reserva online disponible todos los días.') AS publicNote,
        COALESCE(page.show_services, 1) AS showServices,
        COALESCE(page.show_professionals, 1) AS showProfessionals,
        COALESCE(page.show_contact, 1) AS showContact,
        COALESCE(page.show_policies, 1) AS showPolicies,
        COALESCE(settings.show_gallery, 1) AS showGallery,
        COALESCE(settings.show_reviews, 1) AS showReviews
      FROM businesses business
      LEFT JOIN business_settings settings ON settings.business_id = business.id
      LEFT JOIN booking_page_settings page ON page.business_id = business.id
      WHERE business.slug = ?`).bind(slug)
      .first<{ id: string; name: string; slug: string; timezone: string; currency: string; timeFormat: string;
        businessPhone: string; businessEmail: string; address: string; whatsappNumber: string; logoUrl: string;
        coverImageUrl: string; bookingLeadMinutes: number; bookingMaxDays: number; allowClientCancellation: number;
        cancellationWindowHours: number; cancellationFeePercent: number; showPrices: number; headline: string;
        subtitle: string; primaryColor: string; publicNote: string; showServices: number; showProfessionals: number;
        showContact: number; showPolicies: number; showGallery: number; showReviews: number }>();
    if (!business) throw new HttpError(404, "Barbería no encontrada.");
    const [services, professionals, gallery, reviews] = await Promise.all([
      db.prepare(`SELECT s.id, s.name, s.category, s.duration_minutes AS durationMinutes, s.price_cents AS priceCents
        FROM services s WHERE s.business_id = ? AND s.active = 1 AND EXISTS (
          SELECT 1 FROM professional_services ps JOIN professionals p
            ON p.id = ps.professional_id AND p.business_id = ps.business_id AND p.active = 1
          WHERE ps.business_id = s.business_id AND ps.service_id = s.id
        ) ORDER BY s.price_cents, s.name`)
        .bind(business.id).all(),
      db.prepare(`SELECT p.id, p.name, p.specialty,
        COALESCE(GROUP_CONCAT(ps.service_id), '') AS serviceIdsCsv
        FROM professionals p LEFT JOIN professional_services ps
          ON ps.business_id = p.business_id AND ps.professional_id = p.id
        WHERE p.business_id = ? AND p.active = 1
        GROUP BY p.id ORDER BY p.name`).bind(business.id).all<{id:string;name:string;specialty:string;serviceIdsCsv:string}>(),
      db.prepare(`SELECT id,title,image_url AS imageUrl,caption FROM gallery_items WHERE business_id=? AND active=1 ORDER BY sort_order,created_at DESC LIMIT 30`).bind(business.id).all(),
      db.prepare(`SELECT r.id,r.rating,r.comment,r.created_at AS createdAt,c.name AS clientName FROM reviews r LEFT JOIN clients c ON c.id=r.client_id AND c.business_id=r.business_id WHERE r.business_id=? AND r.status='published' ORDER BY r.published_at DESC, r.created_at DESC LIMIT 30`).bind(business.id).all(),
    ]);
    return Response.json({
      business: {
        name: business.name, slug: business.slug, timezone: business.timezone, currency: business.currency,
        timeFormat: business.timeFormat, businessPhone: business.businessPhone, businessEmail: business.businessEmail,
        address: business.address, whatsappNumber: business.whatsappNumber, logoUrl: business.logoUrl,
        coverImageUrl: business.coverImageUrl, bookingLeadMinutes: business.bookingLeadMinutes,
        bookingMaxDays: business.bookingMaxDays, allowClientCancellation: business.allowClientCancellation === 1,
        cancellationWindowHours: business.cancellationWindowHours, cancellationFeePercent: business.cancellationFeePercent,
        showPrices: business.showPrices === 1, showGallery: business.showGallery === 1, showReviews: business.showReviews === 1,
        headline: business.headline, subtitle: business.subtitle, primaryColor: barberAccent(business.primaryColor),
        publicNote: business.publicNote, showServices: business.showServices === 1,
        showProfessionals: business.showProfessionals === 1, showContact: business.showContact === 1,
        showPolicies: business.showPolicies === 1,
      },
      services: services.results ?? [],
      gallery: business.showGallery === 1 ? gallery.results ?? [] : [],
      reviews: business.showReviews === 1 ? reviews.results ?? [] : [],
      professionals: (professionals.results ?? []).map(({serviceIdsCsv,...professional})=>({
        ...professional,serviceIds:serviceIdsCsv?serviceIdsCsv.split(","):[],
      })),
    }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return errorResponse(error);
  }
}
