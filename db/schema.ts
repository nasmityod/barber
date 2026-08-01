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
