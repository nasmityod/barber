CREATE UNIQUE INDEX `idx_services_business_name` ON `services` (`business_id`,`name` COLLATE NOCASE);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `services_protect_appointments`
BEFORE DELETE ON `services`
WHEN EXISTS (
	SELECT 1 FROM `appointments`
	WHERE `appointments`.`business_id` = OLD.`business_id`
		AND `appointments`.`service_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'service_has_appointments');
END;
