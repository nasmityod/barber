CREATE TABLE `cash_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` text NOT NULL,
	`opening_amount_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_by` text,
	`closed_at` text,
	`expected_cash_cents` integer,
	`counted_cash_cents` integer,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cash_sessions_one_open` ON `cash_sessions` (`business_id`) WHERE "cash_sessions"."status" = 'open';--> statement-breakpoint
CREATE INDEX `idx_cash_sessions_business_opened` ON `cash_sessions` (`business_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`cash_session_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`voided_by` text,
	`voided_at` text,
	`void_reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payments_business_created` ON `payments` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payments_appointment` ON `payments` (`business_id`,`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_cash_session` ON `payments` (`business_id`,`cash_session_id`);--> statement-breakpoint
CREATE TRIGGER `payments_require_open_session`
BEFORE INSERT ON `payments`
WHEN NOT EXISTS (
	SELECT 1 FROM `cash_sessions` session
	WHERE session.`id` = NEW.`cash_session_id`
		AND session.`business_id` = NEW.`business_id`
		AND session.`status` = 'open'
)
BEGIN
	SELECT RAISE(ABORT, 'payment_session_closed');
END;--> statement-breakpoint
CREATE TRIGGER `payments_require_valid_appointment`
BEFORE INSERT ON `payments`
WHEN NOT EXISTS (
	SELECT 1 FROM `appointments` appointment
	WHERE appointment.`id` = NEW.`appointment_id`
		AND appointment.`business_id` = NEW.`business_id`
		AND appointment.`status` NOT IN ('cancelada','no_asistio')
)
BEGIN
	SELECT RAISE(ABORT, 'payment_appointment_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `payments_prevent_overpayment`
BEFORE INSERT ON `payments`
WHEN EXISTS (
	SELECT 1 FROM `cash_sessions` session
	WHERE session.`id` = NEW.`cash_session_id` AND session.`business_id` = NEW.`business_id`
		AND session.`status` = 'open'
) AND EXISTS (
	SELECT 1 FROM `appointments` appointment
	WHERE appointment.`id` = NEW.`appointment_id` AND appointment.`business_id` = NEW.`business_id`
		AND appointment.`status` NOT IN ('cancelada','no_asistio')
) AND (NEW.`amount_cents` <= 0 OR NEW.`status` <> 'completed' OR
	NEW.`amount_cents` + COALESCE((
		SELECT SUM(existing.`amount_cents`) FROM `payments` existing
		WHERE existing.`business_id` = NEW.`business_id`
			AND existing.`appointment_id` = NEW.`appointment_id`
			AND existing.`status` = 'completed'
	), 0) > COALESCE((
		SELECT appointment.`total_cents` FROM `appointments` appointment
		WHERE appointment.`id` = NEW.`appointment_id`
			AND appointment.`business_id` = NEW.`business_id`
	), 0))
BEGIN
	SELECT RAISE(ABORT, 'payment_amount_invalid');
END;
