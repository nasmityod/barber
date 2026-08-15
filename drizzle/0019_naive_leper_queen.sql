CREATE TABLE `booking_page_settings` (
  `business_id` text PRIMARY KEY NOT NULL,
  `headline` text DEFAULT 'Tu mejor versión empieza aquí.' NOT NULL,
  `subtitle` text DEFAULT 'Elige un servicio, consulta disponibilidad real y confirma sin esperas.' NOT NULL,
  `primary_color` text DEFAULT '#2563EB' NOT NULL,
  `public_note` text DEFAULT 'Reserva online disponible todos los días.' NOT NULL,
  `show_services` integer DEFAULT true NOT NULL,
  `show_professionals` integer DEFAULT true NOT NULL,
  `show_contact` integer DEFAULT true NOT NULL,
  `show_policies` integer DEFAULT true NOT NULL,
  `section_order` text DEFAULT '["services","gallery","reviews","contact"]' NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `appointment_portal_tokens` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `appointment_id` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `last_accessed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointment_portal_appointment` ON `appointment_portal_tokens` (`business_id`,`appointment_id`);
--> statement-breakpoint
CREATE INDEX `idx_appointment_portal_expires` ON `appointment_portal_tokens` (`expires_at`);
