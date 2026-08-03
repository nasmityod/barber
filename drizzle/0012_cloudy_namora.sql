CREATE TABLE `recurring_appointment_series` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_id` text NOT NULL,
	`professional_id` text NOT NULL,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`idempotency_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recurring_series_idempotency` ON `recurring_appointment_series` (`business_id`,`idempotency_hash`);--> statement-breakpoint
CREATE INDEX `idx_recurring_series_business_status` ON `recurring_appointment_series` (`business_id`,`status`,`start_date`);--> statement-breakpoint
ALTER TABLE `appointments` ADD `recurring_series_id` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `occurrence_number` integer;--> statement-breakpoint
CREATE INDEX `idx_appointments_recurring_series` ON `appointments` (`business_id`,`recurring_series_id`,`appointment_date`);