CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`cash_session_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`receipt_number` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_business_created` ON `expenses` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reference_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_movements_product_created` ON `inventory_movements` (`business_id`,`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`line_total_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`cash_session_id` text NOT NULL,
	`client_id` text,
	`subtotal_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`tip_cents` integer DEFAULT 0 NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`receipt_number` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_sales_receipt` ON `product_sales` (`business_id`,`receipt_number`);--> statement-breakpoint
CREATE INDEX `idx_product_sales_business_created` ON `product_sales` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`price_cents` integer NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`minimum_stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_business_sku` ON `products` (`business_id`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_products_business_active` ON `products` (`business_id`,`active`,`name`);--> statement-breakpoint
CREATE TRIGGER `products_non_negative_insert`
BEFORE INSERT ON `products` WHEN NEW.`stock_quantity` < 0 BEGIN
	SELECT RAISE(ABORT, 'product_stock_negative');
END;--> statement-breakpoint
CREATE TRIGGER `products_non_negative_update`
BEFORE UPDATE OF `stock_quantity` ON `products` WHEN NEW.`stock_quantity` < 0 BEGIN
	SELECT RAISE(ABORT, 'product_stock_negative');
END;--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`receipt_number` text NOT NULL,
	`appointment_id` text,
	`sale_id` text,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_business_number` ON `receipts` (`business_id`,`receipt_number`);--> statement-breakpoint
CREATE INDEX `idx_receipts_business_created` ON `receipts` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`cash_session_id` text NOT NULL,
	`payment_id` text,
	`sale_id` text,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_refunds_business_created` ON `refunds` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_refunds_payment` ON `refunds` (`business_id`,`payment_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD `tip_cents` integer DEFAULT 0 NOT NULL;
