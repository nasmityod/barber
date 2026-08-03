CREATE UNIQUE INDEX `idx_professionals_business_name` ON `professionals` (`business_id`,`name` COLLATE NOCASE);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `professionals_protect_dependencies`
BEFORE DELETE ON `professionals`
WHEN EXISTS (
	SELECT 1 FROM `appointments`
	WHERE `appointments`.`business_id` = OLD.`business_id`
		AND `appointments`.`professional_id` = OLD.`id`
) OR EXISTS (
	SELECT 1 FROM `time_blocks`
	WHERE `time_blocks`.`business_id` = OLD.`business_id`
		AND `time_blocks`.`professional_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'professional_has_dependencies');
END;
