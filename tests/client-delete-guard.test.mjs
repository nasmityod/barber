import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0007_client_delete_guard.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

test("preserves clients referenced by appointments", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE clients (id TEXT PRIMARY KEY, business_id TEXT NOT NULL)");
    db.exec("CREATE TABLE appointments (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, client_id TEXT NOT NULL)");
    db.exec(migration);
    db.prepare("INSERT INTO clients (id, business_id) VALUES (?, ?)").run("client-with-history", "business-a");
    db.prepare("INSERT INTO clients (id, business_id) VALUES (?, ?)").run("empty-client", "business-a");
    db.prepare("INSERT INTO appointments (id, business_id, client_id) VALUES (?, ?, ?)").run("appointment", "business-a", "client-with-history");

    assert.throws(
      () => db.prepare("DELETE FROM clients WHERE id = ?").run("client-with-history"),
      /client_has_appointments/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM clients WHERE id = ?").get("client-with-history").count, 1);

    db.prepare("DELETE FROM clients WHERE id = ?").run("empty-client");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM clients WHERE id = ?").get("empty-client").count, 0);
  } finally {
    db.close();
  }
});
