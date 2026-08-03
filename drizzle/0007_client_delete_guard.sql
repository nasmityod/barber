CREATE TRIGGER IF NOT EXISTS `clients_protect_appointments`
BEFORE DELETE ON `clients`
WHEN EXISTS (
	SELECT 1 FROM `appointments`
	WHERE `appointments`.`business_id` = OLD.`business_id`
		AND `appointments`.`client_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'client_has_appointments');
END;
