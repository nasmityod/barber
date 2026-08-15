CREATE TABLE `day_queue_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`queue_date` text NOT NULL,
	`kind` text DEFAULT 'walk_in' NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`position` integer DEFAULT 1 NOT NULL,
	`appointment_id` text,
	`client_id` text NOT NULL,
	`service_id` text,
	`professional_id` text,
	`arrived_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`sale_id` text,
	`sale_amount_cents` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_day_queue_business_date` ON `day_queue_entries` (`business_id`,`queue_date`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_day_queue_business_status` ON `day_queue_entries` (`business_id`,`queue_date`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_day_queue_business_appointment` ON `day_queue_entries` (`business_id`,`appointment_id`) WHERE `appointment_id` IS NOT NULL;
