import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort()) {
    db.exec(readFileSync(`drizzle/${file}`, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return db;
}

function seed(db, business = "one", suffix = "") {
  db.prepare("INSERT INTO businesses (id,name,slug) VALUES (?,?,?)").run(business, "Negocio", `${business}${suffix}`);
  db.prepare("INSERT INTO clients (id,business_id,name,email,phone,created_at) VALUES (?,?,?,?,?,?)").run(`client-${business}`, business, "Cliente", `${business}@example.com`, "+5800000000", "2030-01-01");
  db.prepare("INSERT INTO professionals (id,business_id,name,specialty,active) VALUES (?,?,?,?,1)").run(`pro-${business}`, business, "Profesional", "Barbería");
  db.prepare("INSERT INTO services (id,business_id,name,category,duration_minutes,price_cents,active) VALUES (?,?,?,?,?,?,1)").run(`svc-${business}`, business, "Corte", "Cortes", 30, 1800);
  db.prepare(`INSERT INTO appointments
    (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,total_cents,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(`appt-${business}`, business, `client-${business}`, `svc-${business}`, `pro-${business}`, "2030-01-02", "09:00", "09:30", "completada", 1800, "2030-01-01T09:00:00.000Z");
  db.prepare("INSERT INTO cash_sessions (id,business_id,opened_by,opened_at,status) VALUES (?,?,?,?, 'open')").run(`cash-${business}`, business, "user", "2030-01-01");
  db.prepare("INSERT INTO payments (id,business_id,appointment_id,cash_session_id,amount_cents,method,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)").run(`payment-${business}`, business, `appt-${business}`, `cash-${business}`, 1800, "efectivo", "user", "2030-01-02T10:00:00.000Z");
}

test("stores isolated commission rules and preserves explicit rule priority", () => {
  const db = migratedDatabase();
  try {
    seed(db, "one");
    seed(db, "two");
    db.prepare("INSERT INTO commission_rules (id,business_id,name,scope,kind,value,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("default-one", "one", "General", "default", "percent", 1000, 100, "2030-01-01", "2030-01-01");
    db.prepare("INSERT INTO commission_rules (id,business_id,name,scope,professional_id,kind,value,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run("professional-one", "one", "Profesional", "professional", "pro-one", "percent", 2500, 50, "2030-01-01", "2030-01-01");
    const rule = db.prepare(`SELECT id,kind,value FROM commission_rules WHERE business_id='one' AND active=1 AND
      ((scope='professional' AND professional_id='pro-one') OR scope='default') ORDER BY priority DESC,
      CASE scope WHEN 'professional' THEN 4 ELSE 1 END DESC LIMIT 1`).get();
    assert.deepEqual({ id: rule.id, kind: rule.kind, value: rule.value }, { id: "default-one", kind: "percent", value: 1000 });
    const commission = Math.floor(1800 * 2500 / 10000);
    db.prepare(`INSERT INTO commissions
      (id,business_id,appointment_id,professional_id,service_id,rule_id,source_payment_id,professional_name,service_name,rule_name,kind,value,basis_cents,amount_cents,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`).run("commission-one", "one", "appt-one", "pro-one", "svc-one", "professional-one", "payment-one", "Profesional", "Corte", "Profesional", "percent", 2500, 1800, commission, "2030-01-02", "2030-01-02");
    assert.equal(db.prepare("SELECT amount_cents FROM commissions WHERE business_id='one' AND id='commission-one'").get().amount_cents, 450);
    assert.throws(() => db.prepare(`INSERT INTO commissions
      (id,business_id,appointment_id,professional_id,service_id,rule_id,professional_name,service_name,rule_name,kind,value,basis_cents,amount_cents,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("duplicate", "one", "appt-one", "pro-one", "svc-one", "professional-one", "Profesional", "Corte", "Profesional", "percent", 2500, 1800, 450, "2030-01-02", "2030-01-02"));
    db.prepare("INSERT INTO commission_rules (id,business_id,name,scope,kind,value,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("default-two", "two", "General", "default", "percent", 3000, 100, "2030-01-01", "2030-01-01");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM commission_rules WHERE business_id='one'").get().count, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM commission_rules WHERE business_id='two'").get().count, 1);
  } finally { db.close(); }
});

test("pays pending commissions in an auditable batch without crossing tenants", () => {
  const db = migratedDatabase();
  try {
    seed(db, "one");
    db.prepare(`INSERT INTO commissions
      (id,business_id,appointment_id,professional_id,service_id,rule_id,professional_name,service_name,rule_name,kind,value,basis_cents,amount_cents,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("commission-one", "one", "appt-one", "pro-one", "svc-one", "rule-one", "Profesional", "Corte", "General", "fixed", 500, 1800, 500, "2030-01-02", "2030-01-02");
    const batch = "batch-one";
    db.prepare("INSERT INTO commission_batches (id,business_id,name,status,total_cents,commission_count,created_by,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?)").run(batch, "one", "Enero", "paid", 500, 1, "user", "2030-01-03", "2030-01-03");
    db.prepare("UPDATE commissions SET status='paid',batch_id=?,paid_at=?,paid_by=? WHERE id=? AND business_id=? AND status='pending'").run(batch, "2030-01-03", "user", "commission-one", "one");
    assert.deepEqual({ ...db.prepare("SELECT status,batch_id,paid_by FROM commissions WHERE id='commission-one'").get() }, { status: "paid", batch_id: batch, paid_by: "user" });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM commissions WHERE business_id='two'").get().count, 0);
  } finally { db.close(); }
});
