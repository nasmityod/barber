import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0010_abandoned_mindworm.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

test("backfills and protects service assignments per business", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE professionals (id TEXT PRIMARY KEY, business_id TEXT NOT NULL)");
    db.exec("CREATE TABLE services (id TEXT PRIMARY KEY, business_id TEXT NOT NULL)");
    db.prepare("INSERT INTO professionals (id,business_id) VALUES (?,?)").run("professional-a", "business-a");
    db.prepare("INSERT INTO professionals (id,business_id) VALUES (?,?)").run("professional-b", "business-b");
    db.prepare("INSERT INTO services (id,business_id) VALUES (?,?)").run("service-a", "business-a");
    db.prepare("INSERT INTO services (id,business_id) VALUES (?,?)").run("service-b", "business-b");
    db.exec(migration);

    assert.deepEqual(
      db.prepare("SELECT business_id AS businessId, professional_id AS professionalId, service_id AS serviceId FROM professional_services ORDER BY business_id").all().map((row) => ({ ...row })),
      [
        { businessId: "business-a", professionalId: "professional-a", serviceId: "service-a" },
        { businessId: "business-b", professionalId: "professional-b", serviceId: "service-b" },
      ],
    );
    assert.throws(
      () => db.prepare("INSERT INTO professional_services (business_id,professional_id,service_id) VALUES (?,?,?)")
        .run("business-a", "professional-a", "service-b"),
      /invalid_professional_service/,
    );

    db.prepare("DELETE FROM services WHERE id = ?").run("service-a");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM professional_services WHERE business_id = ?").get("business-a").count, 0);
    db.prepare("DELETE FROM professionals WHERE id = ?").run("professional-b");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM professional_services WHERE business_id = ?").get("business-b").count, 0);
  } finally {
    db.close();
  }
});
