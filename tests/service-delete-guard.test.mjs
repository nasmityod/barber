import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0008_gray_stature.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

test("keeps service names unique per business and preserves referenced services", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE services (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      price_cents INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec("CREATE TABLE appointments (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, service_id TEXT NOT NULL)");
    db.exec(migration);

    db.prepare("INSERT INTO services (id, business_id, name, category, duration_minutes, price_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .run("service-a", "business-a", "Corte clásico", "Cortes", 30, 1500);
    assert.throws(
      () => db.prepare("INSERT INTO services (id, business_id, name, category, duration_minutes, price_cents) VALUES (?, ?, ?, ?, ?, ?)")
        .run("service-duplicate", "business-a", "CORTE clásico", "Cortes", 30, 1500),
      /UNIQUE constraint failed/,
    );
    db.prepare("INSERT INTO services (id, business_id, name, category, duration_minutes, price_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .run("service-other-business", "business-b", "Corte clásico", "Cortes", 30, 1500);

    db.prepare("INSERT INTO appointments (id, business_id, service_id) VALUES (?, ?, ?)")
      .run("appointment-a", "business-a", "service-a");
    assert.throws(
      () => db.prepare("DELETE FROM services WHERE id = ?").run("service-a"),
      /service_has_appointments/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM services WHERE id = ?").get("service-a").count, 1);

    db.prepare("DELETE FROM services WHERE id = ?").run("service-other-business");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM services WHERE id = ?").get("service-other-business").count, 0);
  } finally {
    db.close();
  }
});
