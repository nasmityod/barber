CREATE TRIGGER IF NOT EXISTS `appointments_no_time_block_insert`
BEFORE INSERT ON `appointments`
WHEN NEW.`status` NOT IN ('cancelada', 'no_asistio') AND EXISTS (
	SELECT 1 FROM `time_blocks` AS `blocked`
	WHERE `blocked`.`business_id` = NEW.`business_id`
		AND `blocked`.`professional_id` = NEW.`professional_id`
		AND `blocked`.`block_date` = NEW.`appointment_date`
		AND NEW.`start_time` < `blocked`.`end_time`
		AND NEW.`end_time` > `blocked`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'appointment_time_block_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `appointments_no_time_block_update`
BEFORE UPDATE OF `business_id`, `professional_id`, `appointment_date`, `start_time`, `end_time`, `status` ON `appointments`
WHEN NEW.`status` NOT IN ('cancelada', 'no_asistio') AND EXISTS (
	SELECT 1 FROM `time_blocks` AS `blocked`
	WHERE `blocked`.`business_id` = NEW.`business_id`
		AND `blocked`.`professional_id` = NEW.`professional_id`
		AND `blocked`.`block_date` = NEW.`appointment_date`
		AND NEW.`start_time` < `blocked`.`end_time`
		AND NEW.`end_time` > `blocked`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'appointment_time_block_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `time_blocks_no_appointment_insert`
BEFORE INSERT ON `time_blocks`
WHEN EXISTS (
	SELECT 1 FROM `appointments` AS `existing`
	WHERE `existing`.`business_id` = NEW.`business_id`
		AND `existing`.`professional_id` = NEW.`professional_id`
		AND `existing`.`appointment_date` = NEW.`block_date`
		AND `existing`.`status` NOT IN ('cancelada', 'no_asistio')
		AND NEW.`start_time` < `existing`.`end_time`
		AND NEW.`end_time` > `existing`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'time_block_appointment_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `time_blocks_no_appointment_update`
BEFORE UPDATE OF `business_id`, `professional_id`, `block_date`, `start_time`, `end_time` ON `time_blocks`
WHEN EXISTS (
	SELECT 1 FROM `appointments` AS `existing`
	WHERE `existing`.`business_id` = NEW.`business_id`
		AND `existing`.`professional_id` = NEW.`professional_id`
		AND `existing`.`appointment_date` = NEW.`block_date`
		AND `existing`.`status` NOT IN ('cancelada', 'no_asistio')
		AND NEW.`start_time` < `existing`.`end_time`
		AND NEW.`end_time` > `existing`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'time_block_appointment_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `time_blocks_no_overlap_insert`
BEFORE INSERT ON `time_blocks`
WHEN EXISTS (
	SELECT 1 FROM `time_blocks` AS `existing`
	WHERE `existing`.`business_id` = NEW.`business_id`
		AND `existing`.`professional_id` = NEW.`professional_id`
		AND `existing`.`block_date` = NEW.`block_date`
		AND NEW.`start_time` < `existing`.`end_time`
		AND NEW.`end_time` > `existing`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'time_block_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `time_blocks_no_overlap_update`
BEFORE UPDATE OF `business_id`, `professional_id`, `block_date`, `start_time`, `end_time` ON `time_blocks`
WHEN EXISTS (
	SELECT 1 FROM `time_blocks` AS `existing`
	WHERE `existing`.`id` <> NEW.`id`
		AND `existing`.`business_id` = NEW.`business_id`
		AND `existing`.`professional_id` = NEW.`professional_id`
		AND `existing`.`block_date` = NEW.`block_date`
		AND NEW.`start_time` < `existing`.`end_time`
		AND NEW.`end_time` > `existing`.`start_time`
)
BEGIN
	SELECT RAISE(ABORT, 'time_block_overlap');
END;
