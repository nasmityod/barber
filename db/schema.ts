import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Caracas"),
  currency: text("currency").notNull().default("USD"),
  ownerEmail: text("owner_email"),
  createdAt: text("created_at"),
});

export const businessSettings = sqliteTable("business_settings", {
  businessId: text("business_id").primaryKey(),
  country: text("country").notNull().default("VE"),
  timeFormat: text("time_format").notNull().default("24h"),
  paymentMethods: text("payment_methods").notNull().default("[\"cash\",\"card\",\"transfer\",\"mobile\"]"),
  cancellationWindowHours: integer("cancellation_window_hours").notNull().default(24),
  cancellationFeePercent: integer("cancellation_fee_percent").notNull().default(0),
  allowClientCancellation: integer("allow_client_cancellation", { mode: "boolean" }).notNull().default(true),
  businessPhone: text("business_phone").notNull().default(""),
  businessEmail: text("business_email").notNull().default(""),
  address: text("address").notNull().default(""),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  coverImageUrl: text("cover_image_url").notNull().default(""),
  bookingLeadMinutes: integer("booking_lead_minutes").notNull().default(60),
  bookingMaxDays: integer("booking_max_days").notNull().default(60),
  requireConfirmation: integer("require_confirmation", { mode: "boolean" }).notNull().default(false),
  showPrices: integer("show_prices", { mode: "boolean" }).notNull().default(true),
  showGallery: integer("show_gallery", { mode: "boolean" }).notNull().default(true),
  showReviews: integer("show_reviews", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

export const bookingPageSettings = sqliteTable("booking_page_settings", {
  businessId: text("business_id").primaryKey(),
  headline: text("headline").notNull().default("Reserva tu silla. Sin llamadas, sin esperas."),
  subtitle: text("subtitle").notNull().default("Elige un servicio, consulta disponibilidad real y confirma sin esperas."),
  primaryColor: text("primary_color").notNull().default("#C79A2B"),
  publicNote: text("public_note").notNull().default("Reserva online disponible todos los días."),
  showServices: integer("show_services", { mode: "boolean" }).notNull().default(true),
  showProfessionals: integer("show_professionals", { mode: "boolean" }).notNull().default(true),
  showContact: integer("show_contact", { mode: "boolean" }).notNull().default(true),
  showPolicies: integer("show_policies", { mode: "boolean" }).notNull().default(true),
  sectionOrder: text("section_order").notNull().default('["services","gallery","reviews","contact"]'),
  updatedAt: text("updated_at").notNull(),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull().default(""),
  monthlyPriceCents: integer("monthly_price_cents").notNull().default(0), maxProfessionals: integer("max_professionals").notNull().default(1),
  maxAppointments: integer("max_appointments").notNull().default(100), active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), planId: text("plan_id").notNull(),
  status: text("status").notNull().default("trialing"), provider: text("provider").notNull().default("manual"),
  currentPeriodStart: text("current_period_start").notNull(), currentPeriodEnd: text("current_period_end").notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_subscriptions_business").on(table.businessId), index("idx_subscriptions_status").on(table.status)]);

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("idx_services_business_name").on(table.businessId, table.name)]);

export const professionals = sqliteTable("professionals", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  email: text("email"),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("idx_professionals_business_name").on(table.businessId, table.name)]);

export const professionalServices = sqliteTable("professional_services", {
  businessId: text("business_id").notNull(),
  professionalId: text("professional_id").notNull(),
  serviceId: text("service_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.businessId, table.professionalId, table.serviceId] }),
  index("idx_professional_services_service").on(table.businessId, table.serviceId),
]);

export const runtimeMigrations = sqliteTable("runtime_migrations", {
  key: text("key").primaryKey(),
  appliedAt: text("applied_at").notNull(),
});

export const resources = sqliteTable("resources", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("station"),
  notes: text("notes").notNull().default(""),
  serviceIds: text("service_ids").notNull().default("[]"),
  professionalIds: text("professional_ids").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_resources_business_name").on(table.businessId, table.name),
  index("idx_resources_business_active").on(table.businessId, table.active, table.name),
]);

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_clients_business_email").on(table.businessId, table.email)]);

export const recurringAppointmentSeries = sqliteTable("recurring_appointment_series", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  clientId: text("client_id").notNull(),
  serviceId: text("service_id").notNull(),
  professionalId: text("professional_id").notNull(),
  frequency: text("frequency").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("active"),
  idempotencyHash: text("idempotency_hash").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_recurring_series_idempotency").on(table.businessId, table.idempotencyHash),
  index("idx_recurring_series_business_status").on(table.businessId, table.status, table.startDate),
]);

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  clientId: text("client_id").notNull(),
  serviceId: text("service_id").notNull(),
  professionalId: text("professional_id").notNull(),
  appointmentDate: text("appointment_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").notNull().default("programada"),
  source: text("source").notNull().default("panel"),
  notes: text("notes").notNull().default(""),
  cancellationReason: text("cancellation_reason").notNull().default(""),
  recurringSeriesId: text("recurring_series_id"),
  occurrenceNumber: integer("occurrence_number"),
  resourceId: text("resource_id"),
  totalCents: integer("total_cents").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_appointments_business_date").on(table.businessId, table.appointmentDate, table.startTime),
  index("idx_appointments_professional_slot").on(table.professionalId, table.appointmentDate, table.startTime),
  index("idx_appointments_recurring_series").on(table.businessId, table.recurringSeriesId, table.appointmentDate),
  index("idx_appointments_resource_slot").on(table.businessId, table.resourceId, table.appointmentDate, table.startTime),
]);

export const appointmentPortalTokens = sqliteTable("appointment_portal_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  businessId: text("business_id").notNull(),
  appointmentId: text("appointment_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastAccessedAt: text("last_accessed_at"),
}, (table) => [
  uniqueIndex("idx_appointment_portal_appointment").on(table.businessId, table.appointmentId),
  index("idx_appointment_portal_expires").on(table.expiresAt),
]);

export const dayQueueEntries = sqliteTable("day_queue_entries", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), queueDate: text("queue_date").notNull(),
  kind: text("kind").notNull().default("walk_in"), status: text("status").notNull().default("waiting"), position: integer("position").notNull().default(1),
  appointmentId: text("appointment_id"), clientId: text("client_id").notNull(), serviceId: text("service_id"), professionalId: text("professional_id"),
  arrivedAt: text("arrived_at").notNull(), startedAt: text("started_at"), finishedAt: text("finished_at"),
  saleId: text("sale_id"), saleAmountCents: integer("sale_amount_cents").notNull().default(0), notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_day_queue_business_date").on(table.businessId, table.queueDate, table.position),
  index("idx_day_queue_business_status").on(table.businessId, table.queueDate, table.status),
]);

export const cashSessions = sqliteTable("cash_sessions", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  openedBy: text("opened_by").notNull(),
  openedAt: text("opened_at").notNull(),
  openingAmountCents: integer("opening_amount_cents").notNull().default(0),
  status: text("status").notNull().default("open"),
  closedBy: text("closed_by"),
  closedAt: text("closed_at"),
  expectedCashCents: integer("expected_cash_cents"),
  countedCashCents: integer("counted_cash_cents"),
  countedBreakdown: text("counted_breakdown").notNull().default(""),
  closingSummary: text("closing_summary").notNull().default(""),
  notes: text("notes").notNull().default(""),
}, (table) => [
  uniqueIndex("idx_cash_sessions_one_open").on(table.businessId).where(sql`${table.status} = 'open'`),
  index("idx_cash_sessions_business_opened").on(table.businessId, table.openedAt),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  appointmentId: text("appointment_id").notNull(),
  cashSessionId: text("cash_session_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("completed"),
  reference: text("reference").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  voidedBy: text("voided_by"),
  voidedAt: text("voided_at"),
  voidReason: text("void_reason").notNull().default(""),
  tipCents: integer("tip_cents").notNull().default(0),
}, (table) => [
  index("idx_payments_business_created").on(table.businessId, table.createdAt),
  index("idx_payments_appointment").on(table.businessId, table.appointmentId),
  index("idx_payments_cash_session").on(table.businessId, table.cashSessionId),
]);

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull().default(""),
  category: text("category").notNull().default("General"),
  priceCents: integer("price_cents").notNull(),
  costCents: integer("cost_cents").notNull().default(0),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_products_business_sku").on(table.businessId, table.sku).where(sql`${table.sku} <> ''`),
  index("idx_products_business_active").on(table.businessId, table.active, table.name),
]);

export const productSales = sqliteTable("product_sales", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  cashSessionId: text("cash_session_id").notNull(),
  clientId: text("client_id"),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  tipCents: integer("tip_cents").notNull().default(0),
  method: text("method").notNull(),
  status: text("status").notNull().default("completed"),
  receiptNumber: text("receipt_number").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_product_sales_receipt").on(table.businessId, table.receiptNumber),
  index("idx_product_sales_business_created").on(table.businessId, table.createdAt),
]);

export const productSaleItems = sqliteTable("product_sale_items", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  lineTotalCents: integer("line_total_cents").notNull(),
});

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  productId: text("product_id").notNull(),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  note: text("note").notNull().default(""),
  referenceId: text("reference_id"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_inventory_movements_product_created").on(table.businessId, table.productId, table.createdAt),
]);

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  cashSessionId: text("cash_session_id").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  vendor: text("vendor").notNull().default(""),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  receiptNumber: text("receipt_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("completed"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_expenses_business_created").on(table.businessId, table.createdAt),
]);

export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  cashSessionId: text("cash_session_id").notNull(),
  paymentId: text("payment_id"),
  saleId: text("sale_id"),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("completed"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_refunds_business_created").on(table.businessId, table.createdAt),
  index("idx_refunds_payment").on(table.businessId, table.paymentId),
]);

export const commissionRules = sqliteTable("commission_rules", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), name: text("name").notNull(),
  scope: text("scope").notNull().default("default"), professionalId: text("professional_id"), serviceId: text("service_id"),
  category: text("category"), kind: text("kind").notNull().default("percent"), value: integer("value").notNull().default(0),
  priority: integer("priority").notNull().default(0), active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_commission_rules_business_active").on(table.businessId, table.active, table.priority),
  index("idx_commission_rules_professional").on(table.businessId, table.professionalId),
  index("idx_commission_rules_service").on(table.businessId, table.serviceId),
]);

export const commissionBatches = sqliteTable("commission_batches", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), name: text("name").notNull(),
  periodFrom: text("period_from"), periodTo: text("period_to"), status: text("status").notNull().default("paid"),
  totalCents: integer("total_cents").notNull().default(0), commissionCount: integer("commission_count").notNull().default(0),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), paidAt: text("paid_at"),
}, (table) => [
  index("idx_commission_batches_business_created").on(table.businessId, table.createdAt),
  index("idx_commission_batches_business_status").on(table.businessId, table.status),
]);

export const commissions = sqliteTable("commissions", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), appointmentId: text("appointment_id").notNull(),
  professionalId: text("professional_id").notNull(), serviceId: text("service_id").notNull(), ruleId: text("rule_id").notNull(),
  sourcePaymentId: text("source_payment_id"), batchId: text("batch_id"), professionalName: text("professional_name").notNull(),
  serviceName: text("service_name").notNull(), ruleName: text("rule_name").notNull(), kind: text("kind").notNull(),
  value: integer("value").notNull(), basisCents: integer("basis_cents").notNull(), amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  paidAt: text("paid_at"), paidBy: text("paid_by"),
}, (table) => [
  uniqueIndex("idx_commissions_business_appointment").on(table.businessId, table.appointmentId),
  index("idx_commissions_business_created").on(table.businessId, table.createdAt),
  index("idx_commissions_business_status").on(table.businessId, table.status, table.createdAt),
  index("idx_commissions_batch").on(table.businessId, table.batchId),
]);

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  appointmentId: text("appointment_id"),
  saleId: text("sale_id"),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_receipts_business_number").on(table.businessId, table.receiptNumber),
  index("idx_receipts_business_created").on(table.businessId, table.createdAt),
]);

export const promotions = sqliteTable("promotions", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), name: text("name").notNull(),
  code: text("code").notNull(), kind: text("kind").notNull().default("percent"), value: integer("value").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true), startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(), maxUses: integer("max_uses").notNull().default(0),
  usesCount: integer("uses_count").notNull().default(0), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_promotions_business_code").on(table.businessId, table.code)]);

export const loyaltyAccounts = sqliteTable("loyalty_accounts", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), clientId: text("client_id").notNull(),
  points: integer("points").notNull().default(0), tier: text("tier").notNull().default("base"), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_loyalty_business_client").on(table.businessId, table.clientId)]);

export const loyaltyTransactions = sqliteTable("loyalty_transactions", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), clientId: text("client_id").notNull(),
  points: integer("points").notNull(), reason: text("reason").notNull(), createdBy: text("created_by"), createdAt: text("created_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), clientId: text("client_id"), appointmentId: text("appointment_id"),
  rating: integer("rating").notNull(), comment: text("comment").notNull().default(""), status: text("status").notNull().default("pending"),
  token: text("token").notNull(), createdAt: text("created_at").notNull(), publishedAt: text("published_at"),
}, (table) => [uniqueIndex("idx_reviews_token").on(table.token)]);

export const galleryItems = sqliteTable("gallery_items", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), title: text("title").notNull(), imageUrl: text("image_url").notNull(),
  caption: text("caption").notNull().default(""), active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0), createdAt: text("created_at").notNull(),
});

export const waitlistEntries = sqliteTable("waitlist_entries", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), clientId: text("client_id"), name: text("name").notNull(),
  email: text("email").notNull().default(""), phone: text("phone").notNull().default(""), serviceId: text("service_id"), professionalId: text("professional_id"),
  preferredDate: text("preferred_date").notNull().default(""), preferredTime: text("preferred_time").notNull().default(""), status: text("status").notNull().default("waiting"),
  notes: text("notes").notNull().default(""), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});

export const messageLogs = sqliteTable("message_logs", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), clientId: text("client_id"), appointmentId: text("appointment_id"),
  channel: text("channel").notNull(), kind: text("kind").notNull(), recipient: text("recipient").notNull(), body: text("body").notNull(),
  status: text("status").notNull().default("queued"), scheduledAt: text("scheduled_at").notNull(), sentAt: text("sent_at"), error: text("error").notNull().default(""), createdAt: text("created_at").notNull(),
});

export const paymentRequests = sqliteTable("payment_requests", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), appointmentId: text("appointment_id"), clientId: text("client_id"),
  amountCents: integer("amount_cents").notNull(), depositCents: integer("deposit_cents").notNull().default(0), method: text("method").notNull().default("deposit"),
  provider: text("provider").notNull().default("manual"), checkoutUrl: text("checkout_url").notNull().default(""), reference: text("reference").notNull().default(""),
  status: text("status").notNull().default("pending"), token: text("token").notNull(), expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull(), paidAt: text("paid_at"),
}, (table) => [uniqueIndex("idx_payment_requests_token").on(table.token)]);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(), memberId: text("member_id").notNull(), businessId: text("business_id").notNull(),
  expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull(), usedAt: text("used_at"),
}, (table) => [index("idx_password_reset_member").on(table.memberId), index("idx_password_reset_expires").on(table.expiresAt)]);

export const termsAcceptances = sqliteTable("terms_acceptances", {
  id: text("id").primaryKey(), memberId: text("member_id").notNull(), businessId: text("business_id").notNull(),
  version: text("version").notNull(), ipHash: text("ip_hash").notNull().default(""), acceptedAt: text("accepted_at").notNull(),
}, (table) => [uniqueIndex("idx_terms_member_version").on(table.memberId, table.version)]);

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), kind: text("kind").notNull(),
  title: text("title").notNull(), message: text("message").notNull(), severity: text("severity").notNull().default("info"),
  readAt: text("read_at"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_alerts_business_created").on(table.businessId, table.createdAt)]);

export const businessMembers = sqliteTable("business_members", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  userId: text("user_id"),
  email: text("email").notNull(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("professional"),
  status: text("status").notNull().default("pending"),
  invitedBy: text("invited_by"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
}, (table) => [
  uniqueIndex("idx_business_members_business_user").on(table.businessId, table.userId),
  uniqueIndex("idx_business_members_business_email").on(table.businessId, table.email),
  index("idx_business_members_user_status").on(table.userId, table.status),
]);

export const businessHours = sqliteTable("business_hours", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  professionalId: text("professional_id").notNull(),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  uniqueIndex("idx_business_hours_professional_weekday").on(table.businessId, table.professionalId, table.weekday),
]);

export const timeBlocks = sqliteTable("time_blocks", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  professionalId: text("professional_id").notNull(),
  blockDate: text("block_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_time_blocks_professional_date").on(table.businessId, table.professionalId, table.blockDate),
]);

export const appointmentSlots = sqliteTable("appointment_slots", {
  slotKey: text("slot_key").primaryKey(),
  appointmentId: text("appointment_id").notNull(),
  businessId: text("business_id").notNull(),
  professionalId: text("professional_id").notNull(),
  appointmentDate: text("appointment_date").notNull(),
  slotTime: text("slot_time").notNull(),
}, (table) => [
  index("idx_appointment_slots_appointment").on(table.appointmentId),
  index("idx_appointment_slots_professional_date").on(table.businessId, table.professionalId, table.appointmentDate),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  actorUserId: text("actor_user_id"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_audit_logs_business_created").on(table.businessId, table.createdAt),
]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_rate_limits_expires").on(table.expiresAt)]);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  keyHash: text("key_hash").primaryKey(),
  businessId: text("business_id").notNull(),
  appointmentId: text("appointment_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_idempotency_business_created").on(table.businessId, table.createdAt)]);

export const authCredentials = sqliteTable("auth_credentials", {
  memberId: text("member_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  mustChangePassword: integer("must_change_password", { mode:"boolean" }).notNull().default(true),
  passwordUpdatedAt: text("password_updated_at").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: text("member_id").notNull(),
  businessId: text("business_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  index("idx_auth_sessions_member").on(table.memberId),
  index("idx_auth_sessions_expires").on(table.expiresAt),
]);
