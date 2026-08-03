DROP INDEX `idx_products_business_sku`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_business_sku` ON `products` (`business_id`,`sku`) WHERE "products"."sku" <> '';