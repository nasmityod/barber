import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0011_oval_slayback.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE appointments (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    status TEXT NOT NULL,
    total_cents INTEGER NOT NULL
  )`);
  db.exec(migration);
  db.prepare("INSERT INTO appointments (id,business_id,status,total_cents) VALUES (?,?,?,?)")
    .run("appointment", "business", "programada", 3000);
  db.prepare("INSERT INTO appointments (id,business_id,status,total_cents) VALUES (?,?,?,?)")
    .run("cancelled", "business", "cancelada", 1500);
  db.prepare(`INSERT INTO cash_sessions
    (id,business_id,opened_by,opened_at,opening_amount_cents,status)
    VALUES (?,?,?,?,?,'open')`).run("session", "business", "user", "2030-01-02T08:00:00.000Z", 5000);
  return db;
}

function insertPayment(db, { id, appointmentId = "appointment", sessionId = "session", amount = 1000, business = "business" }) {
  db.prepare(`INSERT INTO payments
    (id,business_id,appointment_id,cash_session_id,amount_cents,method,status,created_by,created_at)
    VALUES (?,?,?,?,?,'efectivo','completed','user','2030-01-02T09:00:00.000Z')`)
    .run(id, business, appointmentId, sessionId, amount);
}

test("allows partial payments but atomically rejects overpayment", () => {
  const db = createDatabase();
  try {
    insertPayment(db, { id: "first", amount: 1000 });
    insertPayment(db, { id: "second", amount: 2000 });
    assert.throws(() => insertPayment(db, { id: "excess", amount: 1 }), /payment_amount_invalid/);

    db.prepare("UPDATE payments SET status = 'voided' WHERE id = ?").run("first");
    insertPayment(db, { id: "replacement", amount: 1000 });
    const paid = db.prepare("SELECT SUM(amount_cents) AS total FROM payments WHERE appointment_id = ? AND status = 'completed'")
      .get("appointment");
    assert.equal(paid.total, 3000);
  } finally {
    db.close();
  }
});

test("requires an open tenant session and a chargeable appointment", () => {
  const db = createDatabase();
  try {
    assert.throws(() => insertPayment(db, { id: "cancelled-payment", appointmentId: "cancelled" }), /payment_appointment_invalid/);
    assert.throws(() => insertPayment(db, { id: "cross-tenant", business: "other" }), /payment_(session_closed|appointment_invalid)/);
    db.prepare("UPDATE cash_sessions SET status = 'closed' WHERE id = ?").run("session");
    assert.throws(() => insertPayment(db, { id: "closed-payment" }), /payment_session_closed/);
  } finally {
    db.close();
  }
});

test("keeps at most one open cash session per business", () => {
  const db = createDatabase();
  try {
    assert.throws(() => db.prepare(`INSERT INTO cash_sessions
      (id,business_id,opened_by,opened_at,opening_amount_cents,status)
      VALUES (?,?,?,?,?,'open')`).run("second", "business", "user", "2030-01-02T10:00:00.000Z", 0), /UNIQUE/);
    db.prepare("UPDATE cash_sessions SET status = 'closed' WHERE id = ?").run("session");
    db.prepare(`INSERT INTO cash_sessions
      (id,business_id,opened_by,opened_at,opening_amount_cents,status)
      VALUES (?,?,?,?,?,'open')`).run("next", "business", "user", "2030-01-03T08:00:00.000Z", 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cash_sessions WHERE business_id = ? AND status = 'open'").get("business").count, 1);
  } finally {
    db.close();
  }
});
