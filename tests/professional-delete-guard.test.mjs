import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0009_real_quicksilver.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

test("keeps professional names unique per business and preserves related history", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE professionals (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL)");
    db.exec("CREATE TABLE appointments (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, professional_id TEXT NOT NULL)");
    db.exec("CREATE TABLE time_blocks (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, professional_id TEXT NOT NULL)");
    db.exec(migration);

    db.prepare("INSERT INTO professionals (id, business_id, name) VALUES (?, ?, ?)")
      .run("professional-a", "business-a", "Mateo Silva");
    assert.throws(
      () => db.prepare("INSERT INTO professionals (id, business_id, name) VALUES (?, ?, ?)")
        .run("professional-duplicate", "business-a", "MATEO SILVA"),
      /UNIQUE constraint failed/,
    );
    db.prepare("INSERT INTO professionals (id, business_id, name) VALUES (?, ?, ?)")
      .run("professional-other-business", "business-b", "Mateo Silva");
    db.prepare("INSERT INTO professionals (id, business_id, name) VALUES (?, ?, ?)")
      .run("professional-with-block", "business-a", "Andrea Pérez");
    db.prepare("INSERT INTO professionals (id, business_id, name) VALUES (?, ?, ?)")
      .run("empty-professional", "business-a", "Sofía Mora");

    db.prepare("INSERT INTO appointments (id, business_id, professional_id) VALUES (?, ?, ?)")
      .run("appointment-a", "business-a", "professional-a");
    db.prepare("INSERT INTO time_blocks (id, business_id, professional_id) VALUES (?, ?, ?)")
      .run("block-a", "business-a", "professional-with-block");

    assert.throws(() => db.prepare("DELETE FROM professionals WHERE id = ?").run("professional-a"), /professional_has_dependencies/);
    assert.throws(() => db.prepare("DELETE FROM professionals WHERE id = ?").run("professional-with-block"), /professional_has_dependencies/);
    db.prepare("DELETE FROM professionals WHERE id = ?").run("empty-professional");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM professionals WHERE id = ?").get("empty-professional").count, 0);
  } finally {
    db.close();
  }
});
