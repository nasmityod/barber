export type PublicService = { id: string; name: string; category: string; durationMinutes: number; priceCents: number };
export type PublicProfessional = { id: string; name: string; specialty: string; serviceIds: string[] };
export type PublicReview = { id: string; rating: number; comment: string; createdAt: string; clientName: string | null };
export type PublicGalleryItem = { id: string; title: string; imageUrl: string; caption: string };

export type PublicCatalog = {
  business: {
    name: string; slug: string; timezone: string; currency: string; timeFormat: string;
    businessPhone: string; businessEmail: string; address: string; whatsappNumber: string;
    logoUrl: string; coverImageUrl: string; bookingLeadMinutes: number; bookingMaxDays: number;
    allowClientCancellation: boolean; cancellationWindowHours: number; cancellationFeePercent: number;
    showPrices: boolean; showGallery: boolean; showReviews: boolean; headline: string; subtitle: string;
    primaryColor: string; publicNote: string; showServices: boolean; showProfessionals: boolean;
    showContact: boolean; showPolicies: boolean;
  };
  services: PublicService[];
  professionals: PublicProfessional[];
  gallery: PublicGalleryItem[];
  reviews: PublicReview[];
};

/** Oro 787. Migra en lectura los acentos heredados (azul de plantilla y el
 *  latón del sistema anterior) sin tocar los datos guardados. */
export const BRAND_ACCENT = "#C79A2B";
const LEGACY_ACCENTS = /^#(2563eb|c6a15b)$/i;
export function barberAccent(value: string) {
  return LEGACY_ACCENTS.test(value.trim()) ? BRAND_ACCENT : value;
}

export async function getPublicCatalog(db: D1Database, slug: string): Promise<PublicCatalog | null> {
  const business = await db.prepare(`SELECT business.id, business.name, business.slug, business.timezone, business.currency,
      COALESCE(settings.time_format, '12h') AS timeFormat,
      COALESCE(settings.business_phone, '') AS businessPhone, COALESCE(settings.business_email, '') AS businessEmail,
      COALESCE(settings.address, '') AS address, COALESCE(settings.whatsapp_number, '') AS whatsappNumber,
      COALESCE(settings.logo_url, '') AS logoUrl, COALESCE(settings.cover_image_url, '') AS coverImageUrl,
      COALESCE(settings.booking_lead_minutes, 60) AS bookingLeadMinutes, COALESCE(settings.booking_max_days, 60) AS bookingMaxDays,
      COALESCE(settings.allow_client_cancellation, 1) AS allowClientCancellation,
      COALESCE(settings.cancellation_window_hours, 24) AS cancellationWindowHours,
      COALESCE(settings.cancellation_fee_percent, 0) AS cancellationFeePercent,
      COALESCE(settings.show_prices, 1) AS showPrices, COALESCE(settings.show_gallery, 1) AS showGallery,
      COALESCE(settings.show_reviews, 1) AS showReviews,
      COALESCE(page.headline, 'Reserva tu silla. Sin llamadas, sin esperas.') AS headline,
      COALESCE(page.subtitle, 'Elige un servicio, consulta disponibilidad real y confirma sin esperas.') AS subtitle,
      COALESCE(page.primary_color, '#C79A2B') AS primaryColor,
      COALESCE(page.public_note, 'Reserva online disponible todos los días.') AS publicNote,
      COALESCE(page.show_services, 1) AS showServices, COALESCE(page.show_professionals, 1) AS showProfessionals,
      COALESCE(page.show_contact, 1) AS showContact, COALESCE(page.show_policies, 1) AS showPolicies
    FROM businesses business
    LEFT JOIN business_settings settings ON settings.business_id = business.id
    LEFT JOIN booking_page_settings page ON page.business_id = business.id
    WHERE business.slug = ?`).bind(slug).first<Record<string, unknown>>();
  if (!business || typeof business.id !== "string") return null;
  const [services, professionals, gallery, reviews] = await Promise.all([
    db.prepare(`SELECT s.id, s.name, s.category, s.duration_minutes AS durationMinutes, s.price_cents AS priceCents
      FROM services s WHERE s.business_id = ? AND s.active = 1 AND EXISTS (
        SELECT 1 FROM professional_services ps JOIN professionals p
          ON p.id = ps.professional_id AND p.business_id = ps.business_id AND p.active = 1
        WHERE ps.business_id = s.business_id AND ps.service_id = s.id
      ) ORDER BY s.price_cents, s.name`).bind(business.id).all<PublicService>(),
    db.prepare(`SELECT p.id, p.name, p.specialty, COALESCE(GROUP_CONCAT(ps.service_id), '') AS serviceIdsCsv
      FROM professionals p LEFT JOIN professional_services ps
        ON ps.business_id = p.business_id AND ps.professional_id = p.id
      WHERE p.business_id = ? AND p.active = 1 GROUP BY p.id ORDER BY p.name`)
      .bind(business.id).all<{ id: string; name: string; specialty: string; serviceIdsCsv: string }>(),
    db.prepare(`SELECT id,title,image_url AS imageUrl,caption FROM gallery_items
      WHERE business_id=? AND active=1 ORDER BY sort_order,created_at DESC LIMIT 30`).bind(business.id).all<PublicGalleryItem>(),
    db.prepare(`SELECT r.id,r.rating,r.comment,r.created_at AS createdAt,c.name AS clientName FROM reviews r
      LEFT JOIN clients c ON c.id=r.client_id AND c.business_id=r.business_id
      WHERE r.business_id=? AND r.status='published' ORDER BY r.published_at DESC,r.created_at DESC LIMIT 30`).bind(business.id).all<PublicReview>(),
  ]);
  const toBoolean = (value: unknown) => value === 1;
  return {
    business: {
      name: String(business.name ?? ""), slug: String(business.slug ?? ""), timezone: String(business.timezone ?? "America/Caracas"),
      currency: String(business.currency ?? "USD"), timeFormat: String(business.timeFormat ?? "24h"),
      businessPhone: String(business.businessPhone ?? ""), businessEmail: String(business.businessEmail ?? ""),
      address: String(business.address ?? ""), whatsappNumber: String(business.whatsappNumber ?? ""),
      logoUrl: String(business.logoUrl ?? ""), coverImageUrl: String(business.coverImageUrl ?? ""),
      bookingLeadMinutes: Number(business.bookingLeadMinutes ?? 60), bookingMaxDays: Number(business.bookingMaxDays ?? 60),
      allowClientCancellation: toBoolean(business.allowClientCancellation),
      cancellationWindowHours: Number(business.cancellationWindowHours ?? 24),
      cancellationFeePercent: Number(business.cancellationFeePercent ?? 0), showPrices: toBoolean(business.showPrices),
      showGallery: toBoolean(business.showGallery), showReviews: toBoolean(business.showReviews),
      headline: String(business.headline ?? ""), subtitle: String(business.subtitle ?? ""),
      primaryColor: barberAccent(String(business.primaryColor ?? "#C79A2B")), publicNote: String(business.publicNote ?? ""),
      showServices: toBoolean(business.showServices), showProfessionals: toBoolean(business.showProfessionals),
      showContact: toBoolean(business.showContact), showPolicies: toBoolean(business.showPolicies),
    },
    services: services.results ?? [],
    professionals: (professionals.results ?? []).map(({ serviceIdsCsv, ...professional }) => ({
      ...professional, serviceIds: serviceIdsCsv ? serviceIdsCsv.split(",") : [],
    })),
    gallery: toBoolean(business.showGallery) ? gallery.results ?? [] : [],
    reviews: toBoolean(business.showReviews) ? reviews.results ?? [] : [],
  };
}
