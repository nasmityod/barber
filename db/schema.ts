import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Caracas"),
  currency: text("currency").notNull().default("USD"),
});

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const professionals = sqliteTable("professionals", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  email: text("email"),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_clients_business_email").on(table.businessId, table.email)]);

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
  totalCents: integer("total_cents").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_appointments_business_date").on(table.businessId, table.appointmentDate, table.startTime),
  index("idx_appointments_professional_slot").on(table.professionalId, table.appointmentDate, table.startTime),
]);

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
