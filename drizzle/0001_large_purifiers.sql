CREATE INDEX `idx_appointments_business_date` ON `appointments` (`business_id`,`appointment_date`,`start_time`);--> statement-breakpoint
CREATE INDEX `idx_appointments_professional_slot` ON `appointments` (`professional_id`,`appointment_date`,`start_time`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clients_business_email` ON `clients` (`business_id`,`email`);