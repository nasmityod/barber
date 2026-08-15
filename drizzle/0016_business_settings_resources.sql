CREATE TABLE `business_settings` (
	`business_id` text PRIMARY KEY NOT NULL,
	`country` text DEFAULT 'VE' NOT NULL,
	`time_format` text DEFAULT '24h' NOT NULL,
	`payment_methods` text DEFAULT '["cash","card","transfer","mobile"]' NOT NULL,
	`cancellation_window_hours` integer DEFAULT 24 NOT NULL,
	`cancellation_fee_percent` integer DEFAULT 0 NOT NULL,
	`allow_client_cancellation` integer DEFAULT true NOT NULL,
	`business_phone` text DEFAULT '' NOT NULL,
	`business_email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`whatsapp_number` text DEFAULT '' NOT NULL,
	`logo_url` text DEFAULT '' NOT NULL,
	`cover_image_url` text DEFAULT '' NOT NULL,
	`booking_lead_minutes` integer DEFAULT 60 NOT NULL,
	`booking_max_days` integer DEFAULT 60 NOT NULL,
	`require_confirmation` integer DEFAULT false NOT NULL,
	`show_prices` integer DEFAULT true NOT NULL,
	`show_gallery` integer DEFAULT true NOT NULL,
	`show_reviews` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'station' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`service_ids` text DEFAULT '[]' NOT NULL,
	`professional_ids` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_resources_business_name` ON `resources` (`business_id`,`name`);
--> statement-breakpoint
CREATE INDEX `idx_resources_business_active` ON `resources` (`business_id`,`active`,`name`);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `resource_id` text;
--> statement-breakpoint
CREATE INDEX `idx_appointments_resource_slot` ON `appointments` (`business_id`,`resource_id`,`appointment_date`,`start_time`);
--> statement-breakpoint
CREATE TRIGGER `appointments_no_resource_overlap_insert`
BEFORE INSERT ON `appointments`
WHEN NEW.resource_id IS NOT NULL AND NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
  SELECT 1 FROM appointments AS existing
  WHERE existing.id <> NEW.id AND existing.business_id = NEW.business_id
    AND existing.resource_id = NEW.resource_id AND existing.appointment_date = NEW.appointment_date
    AND existing.status NOT IN ('cancelada','no_asistio')
    AND NEW.start_time < existing.end_time AND NEW.end_time > existing.start_time
)
BEGIN SELECT RAISE(ABORT, 'resource_time_overlap'); END;
--> statement-breakpoint
CREATE TRIGGER `appointments_no_resource_overlap_update`
BEFORE UPDATE OF resource_id, appointment_date, start_time, end_time, status ON `appointments`
WHEN NEW.resource_id IS NOT NULL AND NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
  SELECT 1 FROM appointments AS existing
  WHERE existing.id <> NEW.id AND existing.business_id = NEW.business_id
    AND existing.resource_id = NEW.resource_id AND existing.appointment_date = NEW.appointment_date
    AND existing.status NOT IN ('cancelada','no_asistio')
    AND NEW.start_time < existing.end_time AND NEW.end_time > existing.start_time
)
BEGIN SELECT RAISE(ABORT, 'resource_time_overlap'); END;
