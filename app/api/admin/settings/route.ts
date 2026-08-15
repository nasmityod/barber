import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, isEmail, isPhone, readJson, writeAudit,
} from "../../../security";

const PAYMENT_METHODS = ["cash", "card", "transfer", "mobile", "other"] as const;
const DEFAULT_PAYMENT_METHODS = ["cash", "card", "transfer", "mobile"];

type SettingsPayload = {
  businessName?: unknown;
  country?: unknown;
  timezone?: unknown;
  timeFormat?: unknown;
  currency?: unknown;
  paymentMethods?: unknown;
  cancellationWindowHours?: unknown;
  cancellationFeePercent?: unknown;
  allowClientCancellation?: unknown;
  businessPhone?: unknown;
  businessEmail?: unknown;
  address?: unknown;
  whatsappNumber?: unknown;
  logoUrl?: unknown;
  coverImageUrl?: unknown;
  bookingLeadMinutes?: unknown;
  bookingMaxDays?: unknown;
  requireConfirmation?: unknown;
  showPrices?: unknown;
  showGallery?: unknown;
  showReviews?: unknown;
  headline?: unknown;
  subtitle?: unknown;
  primaryColor?: unknown;
  publicNote?: unknown;
  showServices?: unknown;
  showProfessionals?: unknown;
  showContact?: unknown;
  showPolicies?: unknown;
};

type SettingsRow = {
  businessName: string;
  slug: string;
  timezone: string;
  currency: string;
  country: string;
  timeFormat: string;
  paymentMethods: string;
  cancellationWindowHours: number;
  cancellationFeePercent: number;
  allowClientCancellation: number;
  businessPhone: string;
  businessEmail: string;
  address: string;
  whatsappNumber: string;
  logoUrl: string;
  coverImageUrl: string;
  bookingLeadMinutes: number;
  bookingMaxDays: number;
  requireConfirmation: number;
  showPrices: number;
  showGallery: number;
  showReviews: number;
  headline: string;
  subtitle: string;
  primaryColor: string;
  publicNote: string;
  showServices: number;
  showProfessionals: number;
  showContact: number;
  showPolicies: number;
  updatedAt: string;
};

export async function GET() {
  try {
    const context = await getAdminContext("settings.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    await ensureSettingsRow(db, context.businessId);
    const settings = await findSettings(db, context.businessId);
    if (!settings) throw new HttpError(404, "Negocio no encontrado.");
    return Response.json({ settings: serializeSettings(settings) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("settings.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<SettingsPayload>(request, 12_288);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `settings-write:${context.user.userId}`, 30, 60 * 60 * 1000);
    await ensureSettingsRow(db, context.businessId);
    const current = await findSettings(db, context.businessId);
    if (!current) throw new HttpError(404, "Negocio no encontrado.");
    const input = validateSettings(body, current);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE businesses SET name = ?, timezone = ?, currency = ? WHERE id = ?`)
        .bind(input.businessName, input.timezone, input.currency, context.businessId),
      db.prepare(`INSERT INTO business_settings
        (business_id,country,time_format,payment_methods,cancellation_window_hours,cancellation_fee_percent,
         allow_client_cancellation,business_phone,business_email,address,whatsapp_number,logo_url,cover_image_url,
         booking_lead_minutes,booking_max_days,require_confirmation,show_prices,show_gallery,show_reviews,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(business_id) DO UPDATE SET country=excluded.country,time_format=excluded.time_format,
          payment_methods=excluded.payment_methods,cancellation_window_hours=excluded.cancellation_window_hours,
          cancellation_fee_percent=excluded.cancellation_fee_percent,allow_client_cancellation=excluded.allow_client_cancellation,
          business_phone=excluded.business_phone,business_email=excluded.business_email,address=excluded.address,
          whatsapp_number=excluded.whatsapp_number,logo_url=excluded.logo_url,cover_image_url=excluded.cover_image_url,
          booking_lead_minutes=excluded.booking_lead_minutes,booking_max_days=excluded.booking_max_days,
          require_confirmation=excluded.require_confirmation,show_prices=excluded.show_prices,
          show_gallery=excluded.show_gallery,show_reviews=excluded.show_reviews,updated_at=excluded.updated_at`)
        .bind(context.businessId, input.country, input.timeFormat, JSON.stringify(input.paymentMethods),
          input.cancellationWindowHours, input.cancellationFeePercent, input.allowClientCancellation ? 1 : 0,
          input.businessPhone, input.businessEmail, input.address, input.whatsappNumber, input.logoUrl, input.coverImageUrl,
          input.bookingLeadMinutes, input.bookingMaxDays, input.requireConfirmation ? 1 : 0,
          input.showPrices ? 1 : 0, input.showGallery ? 1 : 0, input.showReviews ? 1 : 0, now),
      db.prepare(`INSERT INTO booking_page_settings
        (business_id,headline,subtitle,primary_color,public_note,show_services,show_professionals,show_contact,show_policies,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(business_id) DO UPDATE SET headline=excluded.headline,subtitle=excluded.subtitle,
          primary_color=excluded.primary_color,public_note=excluded.public_note,show_services=excluded.show_services,
          show_professionals=excluded.show_professionals,show_contact=excluded.show_contact,
          show_policies=excluded.show_policies,updated_at=excluded.updated_at`)
        .bind(context.businessId, input.headline, input.subtitle, input.primaryColor, input.publicNote,
          input.showServices ? 1 : 0, input.showProfessionals ? 1 : 0, input.showContact ? 1 : 0,
          input.showPolicies ? 1 : 0, now),
    ]);
    await writeAudit(db, {
      businessId: context.businessId, user: context.user, action: "business.settings_updated",
      entityType: "business_settings", entityId: context.businessId,
      metadata: { timezone: input.timezone, currency: input.currency, paymentMethodCount: input.paymentMethods.length },
    });
    const saved = await findSettings(db, context.businessId);
    return Response.json({ settings: saved ? serializeSettings(saved) : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function ensureSettingsRow(db: D1Database, businessId: string) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO business_settings
      (business_id,payment_methods,updated_at) VALUES (?, ?, ?)`)
      .bind(businessId, JSON.stringify(DEFAULT_PAYMENT_METHODS), now),
    db.prepare(`INSERT OR IGNORE INTO booking_page_settings (business_id,updated_at) VALUES (?,?)`)
      .bind(businessId, now),
  ]);
}

async function findSettings(db: D1Database, businessId: string) {
  return db.prepare(`SELECT b.name AS businessName,b.slug,b.timezone,b.currency,
    s.country,s.time_format AS timeFormat,s.payment_methods AS paymentMethods,
    s.cancellation_window_hours AS cancellationWindowHours,s.cancellation_fee_percent AS cancellationFeePercent,
    s.allow_client_cancellation AS allowClientCancellation,s.business_phone AS businessPhone,
    s.business_email AS businessEmail,s.address,s.whatsapp_number AS whatsappNumber,s.logo_url AS logoUrl,
    s.cover_image_url AS coverImageUrl,s.booking_lead_minutes AS bookingLeadMinutes,s.booking_max_days AS bookingMaxDays,
    s.require_confirmation AS requireConfirmation,s.show_prices AS showPrices,s.show_gallery AS showGallery,
    s.show_reviews AS showReviews,
    page.headline,page.subtitle,page.primary_color AS primaryColor,page.public_note AS publicNote,
    page.show_services AS showServices,page.show_professionals AS showProfessionals,
    page.show_contact AS showContact,page.show_policies AS showPolicies,page.updated_at AS updatedAt
    FROM businesses b JOIN business_settings s ON s.business_id = b.id
    JOIN booking_page_settings page ON page.business_id = b.id WHERE b.id = ?`)
    .bind(businessId).first<SettingsRow>();
}

function serializeSettings(row: SettingsRow) {
  let paymentMethods: string[] = DEFAULT_PAYMENT_METHODS;
  try {
    const parsed: unknown = JSON.parse(row.paymentMethods);
    if (Array.isArray(parsed)) paymentMethods = parsed.filter((value): value is string => typeof value === "string");
  } catch {
    // Keep the safe default if a legacy row contains invalid JSON.
  }
  return {
    ...row,
    paymentMethods,
    allowClientCancellation: row.allowClientCancellation === 1,
    requireConfirmation: row.requireConfirmation === 1,
    showPrices: row.showPrices === 1,
    showGallery: row.showGallery === 1,
    showReviews: row.showReviews === 1,
    showServices: row.showServices === 1,
    showProfessionals: row.showProfessionals === 1,
    showContact: row.showContact === 1,
    showPolicies: row.showPolicies === 1,
  };
}

function validateSettings(body: SettingsPayload, current: SettingsRow) {
  const businessName = body.businessName === undefined ? current.businessName : cleanText(body.businessName, 120);
  const country = body.country === undefined ? current.country : cleanText(body.country, 2).toUpperCase();
  const timezone = body.timezone === undefined ? current.timezone : cleanText(body.timezone, 80);
  const timeFormat = body.timeFormat === undefined ? current.timeFormat : cleanText(body.timeFormat, 3);
  const currency = body.currency === undefined ? current.currency : cleanText(body.currency, 3).toUpperCase();
  const paymentMethods = body.paymentMethods === undefined ? parseMethods(current.paymentMethods) : validateMethods(body.paymentMethods);
  const cancellationWindowHours = boundedInteger(body.cancellationWindowHours ?? current.cancellationWindowHours, 0, 720);
  const cancellationFeePercent = boundedInteger(body.cancellationFeePercent ?? current.cancellationFeePercent, 0, 100);
  const bookingLeadMinutes = boundedInteger(body.bookingLeadMinutes ?? current.bookingLeadMinutes, 0, 10_080);
  const bookingMaxDays = boundedInteger(body.bookingMaxDays ?? current.bookingMaxDays, 1, 365);
  const allowClientCancellation = booleanValue(body.allowClientCancellation, current.allowClientCancellation === 1);
  const requireConfirmation = booleanValue(body.requireConfirmation, current.requireConfirmation === 1);
  const showPrices = booleanValue(body.showPrices, current.showPrices === 1);
  const showGallery = booleanValue(body.showGallery, current.showGallery === 1);
  const showReviews = booleanValue(body.showReviews, current.showReviews === 1);
  const headline = body.headline === undefined ? current.headline : cleanText(body.headline, 120);
  const subtitle = body.subtitle === undefined ? current.subtitle : cleanText(body.subtitle, 240);
  const primaryColor = body.primaryColor === undefined ? current.primaryColor : colorValue(body.primaryColor);
  const publicNote = body.publicNote === undefined ? current.publicNote : cleanText(body.publicNote, 240);
  const showServices = booleanValue(body.showServices, current.showServices === 1);
  const showProfessionals = booleanValue(body.showProfessionals, current.showProfessionals === 1);
  const showContact = booleanValue(body.showContact, current.showContact === 1);
  const showPolicies = booleanValue(body.showPolicies, current.showPolicies === 1);
  const businessPhone = body.businessPhone === undefined ? current.businessPhone : cleanText(body.businessPhone, 25);
  const businessEmail = body.businessEmail === undefined ? current.businessEmail : cleanText(body.businessEmail, 254).toLowerCase();
  const address = body.address === undefined ? current.address : cleanText(body.address, 240);
  const whatsappNumber = body.whatsappNumber === undefined ? current.whatsappNumber : cleanText(body.whatsappNumber, 25);
  const logoUrl = body.logoUrl === undefined ? current.logoUrl : secureUrl(body.logoUrl, "logo");
  const coverImageUrl = body.coverImageUrl === undefined ? current.coverImageUrl : secureUrl(body.coverImageUrl, "portada");
  if (businessName.length < 2 || headline.length < 2 || subtitle.length < 2 || !/^[A-Z]{2}$/u.test(country) || !/^[A-Z]{3}$/u.test(currency) || !["12h", "24h"].includes(timeFormat)) {
    throw new HttpError(400, "Revisa el nombre, país, formato horario y moneda.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new HttpError(400, "La zona horaria no es válida.");
  }
  if (!paymentMethods.length || cancellationWindowHours === null || cancellationFeePercent === null || bookingLeadMinutes === null || bookingMaxDays === null) {
    throw new HttpError(400, "Revisa los límites de reservas y cancelación.");
  }
  if (businessPhone && !isPhone(businessPhone) || whatsappNumber && !isPhone(whatsappNumber)) {
    throw new HttpError(400, "El teléfono o WhatsApp no es válido.");
  }
  if (businessEmail && !isEmail(businessEmail)) throw new HttpError(400, "El correo del negocio no es válido.");
  return {
    businessName, country, timezone, timeFormat, currency, paymentMethods,
    cancellationWindowHours, cancellationFeePercent, allowClientCancellation,
    businessPhone, businessEmail, address, whatsappNumber, logoUrl, coverImageUrl,
    bookingLeadMinutes, bookingMaxDays, requireConfirmation, showPrices, showGallery, showReviews,
    headline, subtitle, primaryColor, publicNote, showServices, showProfessionals, showContact, showPolicies,
  };
}

function parseMethods(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && PAYMENT_METHODS.includes(item as typeof PAYMENT_METHODS[number])) : DEFAULT_PAYMENT_METHODS;
  } catch {
    return DEFAULT_PAYMENT_METHODS;
  }
}

function validateMethods(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError(400, "Selecciona al menos un método de pago.");
  const methods = value.filter((item): item is string => typeof item === "string" && PAYMENT_METHODS.includes(item as typeof PAYMENT_METHODS[number]));
  if (!methods.length || methods.length !== new Set(methods).size) throw new HttpError(400, "Los métodos de pago no son válidos.");
  return methods;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(cleanText(value, 12));
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if ([true, 1, "1", "true", "on"].includes(value as never)) return true;
  if ([false, 0, "0", "false", "off"].includes(value as never)) return false;
  throw new HttpError(400, "Valor booleano no válido.");
}

function secureUrl(value: unknown, label: string) {
  const text = cleanText(value, 500);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") throw new Error("protocol");
    return url.toString();
  } catch {
    throw new HttpError(400, `La URL de ${label} debe usar HTTPS.`);
  }
}

function colorValue(value: unknown) {
  const color = cleanText(value, 7).toUpperCase();
  if (!/^#[0-9A-F]{6}$/u.test(color)) throw new HttpError(400, "El color principal no es válido.");
  return color;
}
