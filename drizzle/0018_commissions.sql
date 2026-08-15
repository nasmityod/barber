CREATE TABLE `commission_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `name` text NOT NULL,
  `scope` text DEFAULT 'default' NOT NULL,
  `professional_id` text,
  `service_id` text,
  `category` text,
  `kind` text DEFAULT 'percent' NOT NULL,
  `value` integer DEFAULT 0 NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`scope` IN ('default','professional','service','category')),
  CHECK (`kind` IN ('percent','fixed')),
  CHECK (`value` >= 0),
  CHECK (`priority` >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_commission_rules_business_active` ON `commission_rules` (`business_id`,`active`,`priority`);
--> statement-breakpoint
CREATE INDEX `idx_commission_rules_professional` ON `commission_rules` (`business_id`,`professional_id`);
--> statement-breakpoint
CREATE INDEX `idx_commission_rules_service` ON `commission_rules` (`business_id`,`service_id`);
--> statement-breakpoint
CREATE TABLE `commission_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `name` text NOT NULL,
  `period_from` text,
  `period_to` text,
  `status` text DEFAULT 'paid' NOT NULL,
  `total_cents` integer DEFAULT 0 NOT NULL,
  `commission_count` integer DEFAULT 0 NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `paid_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_commission_batches_business_created` ON `commission_batches` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_commission_batches_business_status` ON `commission_batches` (`business_id`,`status`);
--> statement-breakpoint
CREATE TABLE `commissions` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `appointment_id` text NOT NULL,
  `professional_id` text NOT NULL,
  `service_id` text NOT NULL,
  `rule_id` text NOT NULL,
  `source_payment_id` text,
  `batch_id` text,
  `professional_name` text NOT NULL,
  `service_name` text NOT NULL,
  `rule_name` text NOT NULL,
  `kind` text NOT NULL,
  `value` integer NOT NULL,
  `basis_cents` integer NOT NULL,
  `amount_cents` integer NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `paid_at` text,
  `paid_by` text,
  CHECK (`kind` IN ('percent','fixed')),
  CHECK (`status` IN ('pending','paid','cancelled')),
  CHECK (`value` >= 0),
  CHECK (`basis_cents` >= 0),
  CHECK (`amount_cents` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commissions_business_appointment` ON `commissions` (`business_id`,`appointment_id`);
--> statement-breakpoint
CREATE INDEX `idx_commissions_business_created` ON `commissions` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_commissions_business_status` ON `commissions` (`business_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_commissions_batch` ON `commissions` (`business_id`,`batch_id`);
