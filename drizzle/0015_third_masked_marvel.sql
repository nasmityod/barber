CREATE TABLE `gallery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`title` text NOT NULL,
	`image_url` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loyalty_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`tier` text DEFAULT 'base' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loyalty_business_client` ON `loyalty_accounts` (`business_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `loyalty_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text,
	`appointment_id` text,
	`channel` text NOT NULL,
	`kind` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`scheduled_at` text NOT NULL,
	`sent_at` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`appointment_id` text,
	`client_id` text,
	`amount_cents` integer NOT NULL,
	`deposit_cents` integer DEFAULT 0 NOT NULL,
	`method` text DEFAULT 'deposit' NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`checkout_url` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`paid_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_requests_token` ON `payment_requests` (`token`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`kind` text DEFAULT 'percent' NOT NULL,
	`value` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`max_uses` integer DEFAULT 0 NOT NULL,
	`uses_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promotions_business_code` ON `promotions` (`business_id`,`code`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text,
	`appointment_id` text,
	`rating` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_token` ON `reviews` (`token`);--> statement-breakpoint
CREATE TABLE `waitlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`service_id` text,
	`professional_id` text,
	`preferred_date` text DEFAULT '' NOT NULL,
	`preferred_time` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
