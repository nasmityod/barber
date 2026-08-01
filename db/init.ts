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
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_email ON clients(business_id, email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_business_date ON appointments(business_id, appointment_date, start_time)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_professional_slot ON appointments(professional_id, appointment_date, start_time)"),
  ]);

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO businesses (id,name,slug) VALUES ('biz_demo','Corteza Studio','demo')"),
    db.prepare("INSERT OR IGNORE INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('svc_corte','biz_demo','Corte Signature','Cortes',35,1800)"),
    db.prepare("INSERT OR IGNORE INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('svc_barba','biz_demo','Barba Ritual','Barba',25,1200)"),
    db.prepare("INSERT OR IGNORE INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('svc_combo','biz_demo','Corte + Barba','Combos',55,2800)"),
    db.prepare("INSERT OR IGNORE INTO professionals (id,business_id,name,specialty,email,phone) VALUES ('pro_mateo','biz_demo','Mateo Silva','Fades · Barba · Clásicos','mateo@corteza.studio','+58 412 555 0184')"),
    db.prepare("PRAGMA optimize"),
  ]);
  return db;
}
