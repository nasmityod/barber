CREATE TABLE `appointment_slots` (
	`slot_key` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`business_id` text NOT NULL,
	`professional_id` text NOT NULL,
	`appointment_date` text NOT NULL,
	`slot_time` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_appointment_slots_appointment` ON `appointment_slots` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_appointment_slots_professional_date` ON `appointment_slots` (`business_id`,`professional_id`,`appointment_date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`actor_user_id` text,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_business_created` ON `audit_logs` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `business_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`professional_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_hours_professional_weekday` ON `business_hours` (`business_id`,`professional_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `business_members` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'professional' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`created_at` text NOT NULL,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_members_business_user` ON `business_members` (`business_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_members_business_email` ON `business_members` (`business_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_business_members_user_status` ON `business_members` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_business_created` ON `idempotency_keys` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expires` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `time_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`professional_id` text NOT NULL,
	`block_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_time_blocks_professional_date` ON `time_blocks` (`business_id`,`professional_id`,`block_date`);