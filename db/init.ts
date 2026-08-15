import { env } from "cloudflare:workers";

export async function ensureDatabase() {
  const db = env.DB;
  if (!db) throw new Error("La base de datos DB no está disponible");

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL DEFAULT 'America/Caracas', currency TEXT NOT NULL DEFAULT 'USD',
      owner_email TEXT, created_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS business_settings (
      business_id TEXT PRIMARY KEY, country TEXT NOT NULL DEFAULT 'VE', time_format TEXT NOT NULL DEFAULT '24h',
      payment_methods TEXT NOT NULL DEFAULT '["cash","card","transfer","mobile"]',
      cancellation_window_hours INTEGER NOT NULL DEFAULT 24, cancellation_fee_percent INTEGER NOT NULL DEFAULT 0,
      allow_client_cancellation INTEGER NOT NULL DEFAULT 1, business_phone TEXT NOT NULL DEFAULT '',
      business_email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', whatsapp_number TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '', cover_image_url TEXT NOT NULL DEFAULT '', booking_lead_minutes INTEGER NOT NULL DEFAULT 60,
      booking_max_days INTEGER NOT NULL DEFAULT 60, require_confirmation INTEGER NOT NULL DEFAULT 0,
      show_prices INTEGER NOT NULL DEFAULT 1, show_gallery INTEGER NOT NULL DEFAULT 1, show_reviews INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_page_settings (
      business_id TEXT PRIMARY KEY, headline TEXT NOT NULL DEFAULT 'Tu mejor versión empieza aquí.',
      subtitle TEXT NOT NULL DEFAULT 'Elige un servicio, consulta disponibilidad real y confirma sin esperas.',
      primary_color TEXT NOT NULL DEFAULT '#C6A15B', public_note TEXT NOT NULL DEFAULT 'Reserva online disponible todos los días.',
      show_services INTEGER NOT NULL DEFAULT 1, show_professionals INTEGER NOT NULL DEFAULT 1,
      show_contact INTEGER NOT NULL DEFAULT 1, show_policies INTEGER NOT NULL DEFAULT 1,
      section_order TEXT NOT NULL DEFAULT '["services","gallery","reviews","contact"]', updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', monthly_price_cents INTEGER NOT NULL DEFAULT 0,
      max_professionals INTEGER NOT NULL DEFAULT 1, max_appointments INTEGER NOT NULL DEFAULT 100, active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'trialing',
      provider TEXT NOT NULL DEFAULT 'manual', current_period_start TEXT NOT NULL, current_period_end TEXT NOT NULL,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      price_cents INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS professionals (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      specialty TEXT NOT NULL, email TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'station', notes TEXT NOT NULL DEFAULT '',
      service_ids TEXT NOT NULL DEFAULT '[]', professional_ids TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS professional_services (
      business_id TEXT NOT NULL, professional_id TEXT NOT NULL, service_id TEXT NOT NULL,
      PRIMARY KEY (business_id, professional_id, service_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS runtime_migrations (
      key TEXT PRIMARY KEY, applied_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, phone TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS recurring_appointment_series (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT NOT NULL,
      service_id TEXT NOT NULL, professional_id TEXT NOT NULL, frequency TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL, start_time TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
      idempotency_hash TEXT NOT NULL, created_by TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT NOT NULL,
      service_id TEXT NOT NULL, professional_id TEXT NOT NULL, appointment_date TEXT NOT NULL,
      start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'programada',
      source TEXT NOT NULL DEFAULT 'panel', notes TEXT NOT NULL DEFAULT '', cancellation_reason TEXT NOT NULL DEFAULT '',
      recurring_series_id TEXT, occurrence_number INTEGER, total_cents INTEGER NOT NULL,
      resource_id TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS appointment_portal_tokens (
      token_hash TEXT PRIMARY KEY, business_id TEXT NOT NULL, appointment_id TEXT NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_accessed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS day_queue_entries (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, queue_date TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'walk_in', status TEXT NOT NULL DEFAULT 'waiting', position INTEGER NOT NULL DEFAULT 1,
      appointment_id TEXT, client_id TEXT NOT NULL, service_id TEXT, professional_id TEXT,
      arrived_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
      sale_id TEXT, sale_amount_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cash_sessions (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, opened_by TEXT NOT NULL,
      opened_at TEXT NOT NULL, opening_amount_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open', closed_by TEXT, closed_at TEXT,
      expected_cash_cents INTEGER, counted_cash_cents INTEGER,
      counted_breakdown TEXT NOT NULL DEFAULT '', closing_summary TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, appointment_id TEXT NOT NULL,
      cash_session_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed', reference TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, voided_by TEXT,
       voided_at TEXT, void_reason TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General',
      price_cents INTEGER NOT NULL, cost_cents INTEGER NOT NULL DEFAULT 0,
      stock_quantity INTEGER NOT NULL DEFAULT 0, minimum_stock INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS products_non_negative_insert
      BEFORE INSERT ON products WHEN NEW.stock_quantity < 0 BEGIN
        SELECT RAISE(ABORT, 'product_stock_negative');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS products_non_negative_update
      BEFORE UPDATE OF stock_quantity ON products WHEN NEW.stock_quantity < 0 BEGIN
        SELECT RAISE(ABORT, 'product_stock_negative');
      END`),
    db.prepare(`CREATE TABLE IF NOT EXISTS product_sales (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, cash_session_id TEXT NOT NULL,
      client_id TEXT, subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL, tip_cents INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed', receipt_number TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS product_sale_items (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL, line_total_cents INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, product_id TEXT NOT NULL,
      type TEXT NOT NULL, quantity INTEGER NOT NULL, unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '', reference_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, cash_session_id TEXT NOT NULL,
      category TEXT NOT NULL, description TEXT NOT NULL, vendor TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL, method TEXT NOT NULL, receipt_number TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'completed',
      created_by TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, cash_session_id TEXT NOT NULL,
      payment_id TEXT, sale_id TEXT, amount_cents INTEGER NOT NULL, method TEXT NOT NULL,
      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed', created_by TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commission_rules (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'default', professional_id TEXT, service_id TEXT, category TEXT,
      kind TEXT NOT NULL DEFAULT 'percent', value INTEGER NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      CHECK (scope IN ('default','professional','service','category')), CHECK (kind IN ('percent','fixed')),
      CHECK (value >= 0), CHECK (priority >= 0)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commission_batches (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, period_from TEXT, period_to TEXT,
      status TEXT NOT NULL DEFAULT 'paid', total_cents INTEGER NOT NULL DEFAULT 0, commission_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, paid_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, appointment_id TEXT NOT NULL, professional_id TEXT NOT NULL,
      service_id TEXT NOT NULL, rule_id TEXT NOT NULL, source_payment_id TEXT, batch_id TEXT,
      professional_name TEXT NOT NULL, service_name TEXT NOT NULL, rule_name TEXT NOT NULL,
      kind TEXT NOT NULL, value INTEGER NOT NULL, basis_cents INTEGER NOT NULL, amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT, paid_by TEXT,
      CHECK (kind IN ('percent','fixed')), CHECK (status IN ('pending','paid','cancelled')),
      CHECK (value >= 0), CHECK (basis_cents >= 0), CHECK (amount_cents >= 0)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, receipt_number TEXT NOT NULL,
      appointment_id TEXT, sale_id TEXT, snapshot TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'percent', value INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0,
      uses_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS loyalty_accounts (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0, tier TEXT NOT NULL DEFAULT 'base', updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT NOT NULL,
      points INTEGER NOT NULL, reason TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT, appointment_id TEXT,
      rating INTEGER NOT NULL, comment TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
      token TEXT NOT NULL, created_at TEXT NOT NULL, published_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS gallery_items (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, title TEXT NOT NULL, image_url TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS waitlist_entries (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT, name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', service_id TEXT, professional_id TEXT,
      preferred_date TEXT NOT NULL DEFAULT '', preferred_time TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'waiting',
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS message_logs (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT, appointment_id TEXT,
      channel TEXT NOT NULL, kind TEXT NOT NULL, recipient TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', scheduled_at TEXT NOT NULL, sent_at TEXT, error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, appointment_id TEXT, client_id TEXT,
      amount_cents INTEGER NOT NULL, deposit_cents INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT 'deposit',
      provider TEXT NOT NULL DEFAULT 'manual', checkout_url TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
      paid_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, business_id TEXT NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS terms_acceptances (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, business_id TEXT NOT NULL,
      version TEXT NOT NULL, ip_hash TEXT NOT NULL DEFAULT '', accepted_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      message TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', read_at TEXT, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS business_members (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, user_id TEXT,
      email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'professional', status TEXT NOT NULL DEFAULT 'pending',
      invited_by TEXT, created_at TEXT NOT NULL, last_seen_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS business_hours (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, professional_id TEXT NOT NULL,
      weekday INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS time_blocks (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, professional_id TEXT NOT NULL,
      block_date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS appointment_slots (
      slot_key TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, business_id TEXT NOT NULL,
      professional_id TEXT NOT NULL, appointment_date TEXT NOT NULL, slot_time TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, actor_user_id TEXT,
      actor_email TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS idempotency_keys (
      key_hash TEXT PRIMARY KEY, business_id TEXT NOT NULL, appointment_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_credentials (
      member_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1,
      password_updated_at TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, business_id TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS appointments_no_overlap_insert
      BEFORE INSERT ON appointments
      WHEN NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
        SELECT 1 FROM appointments AS existing
        WHERE existing.business_id = NEW.business_id
          AND existing.professional_id = NEW.professional_id
          AND existing.appointment_date = NEW.appointment_date
          AND existing.status NOT IN ('cancelada','no_asistio')
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'appointment_time_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS appointments_no_overlap_update
      BEFORE UPDATE OF business_id, professional_id, appointment_date, start_time, end_time, status ON appointments
      WHEN NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
        SELECT 1 FROM appointments AS existing
        WHERE existing.id <> NEW.id
          AND existing.business_id = NEW.business_id
          AND existing.professional_id = NEW.professional_id
          AND existing.appointment_date = NEW.appointment_date
          AND existing.status NOT IN ('cancelada','no_asistio')
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'appointment_time_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS appointments_no_time_block_insert
      BEFORE INSERT ON appointments
      WHEN NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
        SELECT 1 FROM time_blocks AS blocked
        WHERE blocked.business_id = NEW.business_id
          AND blocked.professional_id = NEW.professional_id
          AND blocked.block_date = NEW.appointment_date
          AND NEW.start_time < blocked.end_time
          AND NEW.end_time > blocked.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'appointment_time_block_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS appointments_no_time_block_update
      BEFORE UPDATE OF business_id, professional_id, appointment_date, start_time, end_time, status ON appointments
      WHEN NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
        SELECT 1 FROM time_blocks AS blocked
        WHERE blocked.business_id = NEW.business_id
          AND blocked.professional_id = NEW.professional_id
          AND blocked.block_date = NEW.appointment_date
          AND NEW.start_time < blocked.end_time
          AND NEW.end_time > blocked.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'appointment_time_block_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS time_blocks_no_appointment_insert
      BEFORE INSERT ON time_blocks
      WHEN EXISTS (
        SELECT 1 FROM appointments AS existing
        WHERE existing.business_id = NEW.business_id
          AND existing.professional_id = NEW.professional_id
          AND existing.appointment_date = NEW.block_date
          AND existing.status NOT IN ('cancelada','no_asistio')
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'time_block_appointment_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS time_blocks_no_appointment_update
      BEFORE UPDATE OF business_id, professional_id, block_date, start_time, end_time ON time_blocks
      WHEN EXISTS (
        SELECT 1 FROM appointments AS existing
        WHERE existing.business_id = NEW.business_id
          AND existing.professional_id = NEW.professional_id
          AND existing.appointment_date = NEW.block_date
          AND existing.status NOT IN ('cancelada','no_asistio')
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'time_block_appointment_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS time_blocks_no_overlap_insert
      BEFORE INSERT ON time_blocks
      WHEN EXISTS (
        SELECT 1 FROM time_blocks AS existing
        WHERE existing.business_id = NEW.business_id
          AND existing.professional_id = NEW.professional_id
          AND existing.block_date = NEW.block_date
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'time_block_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS time_blocks_no_overlap_update
      BEFORE UPDATE OF business_id, professional_id, block_date, start_time, end_time ON time_blocks
      WHEN EXISTS (
        SELECT 1 FROM time_blocks AS existing
        WHERE existing.id <> NEW.id
          AND existing.business_id = NEW.business_id
          AND existing.professional_id = NEW.professional_id
          AND existing.block_date = NEW.block_date
          AND NEW.start_time < existing.end_time
          AND NEW.end_time > existing.start_time
      )
      BEGIN
        SELECT RAISE(ABORT, 'time_block_overlap');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS clients_protect_appointments
      BEFORE DELETE ON clients
      WHEN EXISTS (
        SELECT 1 FROM appointments
        WHERE appointments.business_id = OLD.business_id
          AND appointments.client_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'client_has_appointments');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS services_protect_appointments
      BEFORE DELETE ON services
      WHEN EXISTS (
        SELECT 1 FROM appointments
        WHERE appointments.business_id = OLD.business_id
          AND appointments.service_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'service_has_appointments');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS professionals_protect_dependencies
      BEFORE DELETE ON professionals
      WHEN EXISTS (
        SELECT 1 FROM appointments
        WHERE appointments.business_id = OLD.business_id
          AND appointments.professional_id = OLD.id
      ) OR EXISTS (
        SELECT 1 FROM time_blocks
        WHERE time_blocks.business_id = OLD.business_id
          AND time_blocks.professional_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'professional_has_dependencies');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS professional_services_validate_insert
      BEFORE INSERT ON professional_services
      WHEN NOT EXISTS (
        SELECT 1 FROM professionals p
        WHERE p.id = NEW.professional_id AND p.business_id = NEW.business_id
      ) OR NOT EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = NEW.service_id AND s.business_id = NEW.business_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'invalid_professional_service');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS professional_services_validate_update
      BEFORE UPDATE OF business_id, professional_id, service_id ON professional_services
      WHEN NOT EXISTS (
        SELECT 1 FROM professionals p
        WHERE p.id = NEW.professional_id AND p.business_id = NEW.business_id
      ) OR NOT EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = NEW.service_id AND s.business_id = NEW.business_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'invalid_professional_service');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS services_cleanup_professional_assignments
      AFTER DELETE ON services
      BEGIN
        DELETE FROM professional_services
        WHERE business_id = OLD.business_id AND service_id = OLD.id;
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS professionals_cleanup_service_assignments
      AFTER DELETE ON professionals
      BEGIN
        DELETE FROM professional_services
        WHERE business_id = OLD.business_id AND professional_id = OLD.id;
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS payments_require_open_session
      BEFORE INSERT ON payments
      WHEN NOT EXISTS (
        SELECT 1 FROM cash_sessions session
        WHERE session.id = NEW.cash_session_id
          AND session.business_id = NEW.business_id
          AND session.status = 'open'
      )
      BEGIN
        SELECT RAISE(ABORT, 'payment_session_closed');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS payments_require_valid_appointment
      BEFORE INSERT ON payments
      WHEN NOT EXISTS (
        SELECT 1 FROM appointments appointment
        WHERE appointment.id = NEW.appointment_id
          AND appointment.business_id = NEW.business_id
          AND appointment.status NOT IN ('cancelada','no_asistio')
      )
      BEGIN
        SELECT RAISE(ABORT, 'payment_appointment_invalid');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS payments_prevent_overpayment
      BEFORE INSERT ON payments
      WHEN EXISTS (
        SELECT 1 FROM cash_sessions session
        WHERE session.id = NEW.cash_session_id AND session.business_id = NEW.business_id
          AND session.status = 'open'
      ) AND EXISTS (
        SELECT 1 FROM appointments appointment
        WHERE appointment.id = NEW.appointment_id AND appointment.business_id = NEW.business_id
          AND appointment.status NOT IN ('cancelada','no_asistio')
      ) AND (NEW.amount_cents <= 0 OR NEW.status <> 'completed' OR
        NEW.amount_cents + COALESCE((
          SELECT SUM(existing.amount_cents) FROM payments existing
          WHERE existing.business_id = NEW.business_id
            AND existing.appointment_id = NEW.appointment_id
            AND existing.status = 'completed'
        ), 0) > COALESCE((
          SELECT appointment.total_cents FROM appointments appointment
          WHERE appointment.id = NEW.appointment_id
            AND appointment.business_id = NEW.business_id
        ), 0))
      BEGIN
        SELECT RAISE(ABORT, 'payment_amount_invalid');
      END`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_services_business_name ON services(business_id, name COLLATE NOCASE)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_business_name ON professionals(business_id, name COLLATE NOCASE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_professional_services_service ON professional_services(business_id, service_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_email ON clients(business_id, email)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_series_idempotency ON recurring_appointment_series(business_id, idempotency_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_recurring_series_business_status ON recurring_appointment_series(business_id, status, start_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_business_date ON appointments(business_id, appointment_date, start_time)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_professional_slot ON appointments(professional_id, appointment_date, start_time)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_day_queue_business_date ON day_queue_entries(business_id, queue_date, position)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_day_queue_business_status ON day_queue_entries(business_id, queue_date, status)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_day_queue_business_appointment ON day_queue_entries(business_id, appointment_id) WHERE appointment_id IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_one_open ON cash_sessions(business_id) WHERE status = 'open'"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_cash_sessions_business_opened ON cash_sessions(business_id, opened_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_business_created ON payments(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments(business_id, appointment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_cash_session ON payments(business_id, cash_session_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_business_members_business_user ON business_members(business_id, user_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_business_members_business_email ON business_members(business_id, email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_business_members_user_status ON business_members(user_id, status)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_business_hours_professional_weekday ON business_hours(business_id, professional_id, weekday)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_time_blocks_professional_date ON time_blocks(business_id, professional_id, block_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointment_slots_appointment ON appointment_slots(appointment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointment_slots_professional_date ON appointment_slots(business_id, professional_id, appointment_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON audit_logs(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_idempotency_business_created ON idempotency_keys(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_member ON auth_sessions(member_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at)"),
  ]);

  const paymentColumns = await db.prepare("PRAGMA table_info(payments)").all<{ name:string }>();
  if (!(paymentColumns.results ?? []).some((column) => column.name === "tip_cents")) {
    await db.prepare("ALTER TABLE payments ADD COLUMN tip_cents INTEGER NOT NULL DEFAULT 0").run();
  }
  const cashSessionColumns = await db.prepare("PRAGMA table_info(cash_sessions)").all<{ name:string }>();
  if (!(cashSessionColumns.results ?? []).some((column) => column.name === "counted_breakdown")) {
    await db.prepare("ALTER TABLE cash_sessions ADD COLUMN counted_breakdown TEXT NOT NULL DEFAULT ''").run();
  }
  if (!(cashSessionColumns.results ?? []).some((column) => column.name === "closing_summary")) {
    await db.prepare("ALTER TABLE cash_sessions ADD COLUMN closing_summary TEXT NOT NULL DEFAULT ''").run();
  }
  const businessColumns = await db.prepare("PRAGMA table_info(businesses)").all<{ name:string }>();
  if (!(businessColumns.results ?? []).some((column) => column.name === "owner_email")) await db.prepare("ALTER TABLE businesses ADD COLUMN owner_email TEXT").run();
  if (!(businessColumns.results ?? []).some((column) => column.name === "created_at")) await db.prepare("ALTER TABLE businesses ADD COLUMN created_at TEXT").run();
  await db.batch([
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_business_sku ON products(business_id, sku) WHERE sku <> ''"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_products_business_active ON products(business_id, active, name)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_product_sales_receipt ON product_sales(business_id, receipt_number)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_product_sales_business_created ON product_sales(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created ON inventory_movements(business_id, product_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_expenses_business_created ON expenses(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_refunds_business_created ON refunds(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(business_id, payment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commission_rules_business_active ON commission_rules(business_id, active, priority)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commission_rules_professional ON commission_rules(business_id, professional_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commission_rules_service ON commission_rules(business_id, service_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commission_batches_business_created ON commission_batches(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commission_batches_business_status ON commission_batches(business_id, status)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_business_appointment ON commissions(business_id, appointment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commissions_business_created ON commissions(business_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commissions_business_status ON commissions(business_id, status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_commissions_batch ON commissions(business_id, batch_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_business_number ON receipts(business_id, receipt_number)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_receipts_business_created ON receipts(business_id, created_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_business_code ON promotions(business_id, code)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_promotions_business_active ON promotions(business_id, active, starts_at, ends_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_business_client ON loyalty_accounts(business_id, client_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_client ON loyalty_transactions(business_id, client_id, created_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_token ON reviews(token)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reviews_business_status ON reviews(business_id, status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_gallery_business_active ON gallery_items(business_id, active, sort_order)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_waitlist_business_status ON waitlist_entries(business_id, status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_messages_business_scheduled ON message_logs(business_id, status, scheduled_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_token ON payment_requests(token)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payment_requests_business_status ON payment_requests(business_id, status, created_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_business ON subscriptions(business_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_password_reset_member ON password_reset_tokens(member_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_member_version ON terms_acceptances(member_id, version)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_alerts_business_created ON alerts(business_id, created_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_business_name ON resources(business_id, name COLLATE NOCASE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_resources_business_active ON resources(business_id, active, name)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_portal_appointment ON appointment_portal_tokens(business_id, appointment_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointment_portal_expires ON appointment_portal_tokens(expires_at)"),
    db.prepare("INSERT OR IGNORE INTO plans (id,name,description,monthly_price_cents,max_professionals,max_appointments) VALUES ('free','Gratis','Para empezar sin tarjeta',0,1,100)"),
    db.prepare("INSERT OR IGNORE INTO plans (id,name,description,monthly_price_cents,max_professionals,max_appointments) VALUES ('pro','Pro','Para barberías en crecimiento',1900,5,1000)"),
    db.prepare("INSERT OR IGNORE INTO plans (id,name,description,monthly_price_cents,max_professionals,max_appointments) VALUES ('business','Business','Para equipos y varias operaciones',4900,25,10000)"),
  ]);

  const appointmentColumns = await db.prepare("PRAGMA table_info(appointments)").all<{ name:string }>();
  if (!(appointmentColumns.results ?? []).some((column) => column.name === "cancellation_reason")) {
    await db.prepare("ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT ''").run();
  }
  if (!(appointmentColumns.results ?? []).some((column) => column.name === "recurring_series_id")) {
    await db.prepare("ALTER TABLE appointments ADD COLUMN recurring_series_id TEXT").run();
  }
  if (!(appointmentColumns.results ?? []).some((column) => column.name === "occurrence_number")) {
    await db.prepare("ALTER TABLE appointments ADD COLUMN occurrence_number INTEGER").run();
  }
  if (!(appointmentColumns.results ?? []).some((column) => column.name === "resource_id")) {
    await db.prepare("ALTER TABLE appointments ADD COLUMN resource_id TEXT").run();
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_recurring_series ON appointments(business_id, recurring_series_id, appointment_date)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_resource_slot ON appointments(business_id, resource_id, appointment_date, start_time)").run();
  await db.batch([
    db.prepare(`CREATE TRIGGER IF NOT EXISTS appointments_no_resource_overlap_insert
      BEFORE INSERT ON appointments
      WHEN NEW.resource_id IS NOT NULL AND NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
        SELECT 1 FROM appointments AS existing
        WHERE existing.id <> NEW.id AND existing.business_id = NEW.business_id
          AND existing.resource_id = NEW.resource_id AND existing.appointment_date = NEW.appointment_date
          AND existing.status NOT IN ('cancelada','no_asistio')
          AND NEW.start_time < existing.end_time AND NEW.end_time > existing.start_time
      )
      BEGIN SELECT RAISE(ABORT, 'resource_time_overlap'); END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS appointments_no_resource_overlap_update
      BEFORE UPDATE OF resource_id, appointment_date, start_time, end_time, status ON appointments
      WHEN NEW.resource_id IS NOT NULL AND NEW.status NOT IN ('cancelada','no_asistio') AND EXISTS (
        SELECT 1 FROM appointments AS existing
        WHERE existing.id <> NEW.id AND existing.business_id = NEW.business_id
          AND existing.resource_id = NEW.resource_id AND existing.appointment_date = NEW.appointment_date
          AND existing.status NOT IN ('cancelada','no_asistio')
          AND NEW.start_time < existing.end_time AND NEW.end_time > existing.start_time
      )
      BEGIN SELECT RAISE(ABORT, 'resource_time_overlap'); END`),
  ]);

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO businesses (id,name,slug,owner_email,created_at) VALUES ('biz_demo','Corteza Studio','demo','owner@corteza.studio',?)").bind(new Date().toISOString()),
    db.prepare("INSERT OR IGNORE INTO business_settings (business_id,updated_at) VALUES ('biz_demo',?)").bind(new Date().toISOString()),
    db.prepare("INSERT OR IGNORE INTO booking_page_settings (business_id,updated_at) VALUES ('biz_demo',?)").bind(new Date().toISOString()),
    db.prepare(`INSERT OR IGNORE INTO subscriptions (id,business_id,plan_id,status,provider,current_period_start,current_period_end,created_at)
      VALUES ('sub_demo','biz_demo','free','active','manual',date('now'),date('now','+1 year'),?)`).bind(new Date().toISOString()),
    db.prepare("INSERT OR IGNORE INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('svc_corte','biz_demo','Corte Signature','Cortes',35,1800)"),
    db.prepare("INSERT OR IGNORE INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('svc_barba','biz_demo','Barba Ritual','Barba',25,1200)"),
    db.prepare("INSERT OR IGNORE INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('svc_combo','biz_demo','Corte + Barba','Combos',55,2800)"),
    db.prepare("INSERT OR IGNORE INTO professionals (id,business_id,name,specialty,email,phone) VALUES ('pro_mateo','biz_demo','Mateo Silva','Fades · Barba · Clásicos','mateo@corteza.studio','+58 412 555 0184')"),
    ...[1, 2, 3, 4, 5, 6].map((weekday) =>
      db.prepare("INSERT OR IGNORE INTO business_hours (id,business_id,professional_id,weekday,start_time,end_time,active) VALUES (?,'biz_demo','pro_mateo',?,'09:00','19:00',1)")
        .bind(`hours_pro_mateo_${weekday}`, weekday)
    ),
    db.prepare("PRAGMA optimize"),
  ]);
  const backfill = await db.prepare(`INSERT OR IGNORE INTO runtime_migrations (key,applied_at)
    VALUES ('professional_services_v1',?) RETURNING key`).bind(new Date().toISOString()).first();
  if (backfill) {
    await db.prepare(`INSERT OR IGNORE INTO professional_services (business_id,professional_id,service_id)
      SELECT p.business_id, p.id, s.id
      FROM professionals p JOIN services s ON s.business_id = p.business_id`).run();
  }
  return db;
}
