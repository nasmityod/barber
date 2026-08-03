CREATE TRIGGER IF NOT EXISTS `appointments_no_overlap_insert`
BEFORE INSERT ON `appointments`
WHEN NEW.`status` NOT IN ('cancelada', 'no_asistio') AND EXISTS (
	SELECT 1
	FROM `appointments` AS `existing`
	WHERE `existing`.`business_id` = NEW.`business_id`
		AND `existing`.`professional_id` = NEW.`professional_id`
		AND `existing`.`appointment_date` = NEW.`appointment_date`
		AND `existing`.`status` NOT IN ('cancelada', 'no_asistio')
		AND NEW.`start_time` < `existing`.`end_time`
		AND NEW.`end_time` > `existing`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'appointment_time_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `appointments_no_overlap_update`
BEFORE UPDATE OF `business_id`, `professional_id`, `appointment_date`, `start_time`, `end_time`, `status` ON `appointments`
WHEN NEW.`status` NOT IN ('cancelada', 'no_asistio') AND EXISTS (
	SELECT 1
	FROM `appointments` AS `existing`
	WHERE `existing`.`id` <> NEW.`id`
		AND `existing`.`business_id` = NEW.`business_id`
		AND `existing`.`professional_id` = NEW.`professional_id`
		AND `existing`.`appointment_date` = NEW.`appointment_date`
		AND `existing`.`status` NOT IN ('cancelada', 'no_asistio')
		AND NEW.`start_time` < `existing`.`end_time`
		AND NEW.`end_time` > `existing`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'appointment_time_overlap');
END;
