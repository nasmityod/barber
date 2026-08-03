CREATE TABLE `professional_services` (
	`business_id` text NOT NULL,
	`professional_id` text NOT NULL,
	`service_id` text NOT NULL,
	PRIMARY KEY(`business_id`, `professional_id`, `service_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_professional_services_service` ON `professional_services` (`business_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `runtime_migrations` (
	`key` text PRIMARY KEY NOT NULL,
	`applied_at` text NOT NULL
);--> statement-breakpoint
CREATE TRIGGER `professional_services_validate_insert`
BEFORE INSERT ON `professional_services`
WHEN NOT EXISTS (
	SELECT 1 FROM `professionals` p
	WHERE p.`id` = NEW.`professional_id` AND p.`business_id` = NEW.`business_id`
) OR NOT EXISTS (
	SELECT 1 FROM `services` s
	WHERE s.`id` = NEW.`service_id` AND s.`business_id` = NEW.`business_id`
)
BEGIN
	SELECT RAISE(ABORT, 'invalid_professional_service');
END;--> statement-breakpoint
CREATE TRIGGER `professional_services_validate_update`
BEFORE UPDATE OF `business_id`, `professional_id`, `service_id` ON `professional_services`
WHEN NOT EXISTS (
	SELECT 1 FROM `professionals` p
	WHERE p.`id` = NEW.`professional_id` AND p.`business_id` = NEW.`business_id`
) OR NOT EXISTS (
	SELECT 1 FROM `services` s
	WHERE s.`id` = NEW.`service_id` AND s.`business_id` = NEW.`business_id`
)
BEGIN
	SELECT RAISE(ABORT, 'invalid_professional_service');
END;--> statement-breakpoint
CREATE TRIGGER `services_cleanup_professional_assignments`
AFTER DELETE ON `services`
BEGIN
	DELETE FROM `professional_services`
	WHERE `business_id` = OLD.`business_id` AND `service_id` = OLD.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `professionals_cleanup_service_assignments`
AFTER DELETE ON `professionals`
BEGIN
	DELETE FROM `professional_services`
	WHERE `business_id` = OLD.`business_id` AND `professional_id` = OLD.`id`;
END;--> statement-breakpoint
INSERT OR IGNORE INTO `professional_services` (`business_id`,`professional_id`,`service_id`)
SELECT p.`business_id`, p.`id`, s.`id`
FROM `professionals` p JOIN `services` s ON s.`business_id` = p.`business_id`;--> statement-breakpoint
INSERT OR IGNORE INTO `runtime_migrations` (`key`,`applied_at`)
VALUES ('professional_services_v1', CURRENT_TIMESTAMP);
