import { env } from "cloudflare:workers";

export async function ensureDatabase() {
  const db = env.DB;
  if (!db) throw new Error("La base de datos DB no está disponible");

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL DEFAULT 'America/Caracas', currency TEXT NOT NULL DEFAULT 'USD'
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
    db.prepare(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, phone TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT NOT NULL,
      service_id TEXT NOT NULL, professional_id TEXT NOT NULL, appointment_date TEXT NOT NULL,
      start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'programada',
      source TEXT NOT NULL DEFAULT 'panel', notes TEXT NOT NULL DEFAULT '', total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
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
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_email ON clients(business_id, email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_business_date ON appointments(business_id, appointment_date, start_time)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_professional_slot ON appointments(professional_id, appointment_date, start_time)"),
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

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO businesses (id,name,slug) VALUES ('biz_demo','Corteza Studio','demo')"),
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
  return db;
}
