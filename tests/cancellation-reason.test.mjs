import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0006_woozy_juggernaut.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

test("adds a safe default and persists the cancellation reason", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE appointments (id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL)");
    db.prepare("INSERT INTO appointments (id, status) VALUES (?, ?)").run("appointment", "programada");
    db.exec(migration);
    assert.equal(db.prepare("SELECT cancellation_reason FROM appointments WHERE id = ?").get("appointment").cancellation_reason, "");
    db.prepare("UPDATE appointments SET status = ?, cancellation_reason = ? WHERE id = ?")
      .run("cancelada", "Cliente solicitó otra fecha", "appointment");
    const cancelled = db.prepare("SELECT status, cancellation_reason AS reason FROM appointments WHERE id = ?").get("appointment");
    assert.equal(cancelled.status, "cancelada");
    assert.equal(cancelled.reason, "Cliente solicitó otra fecha");
  } finally {
    db.close();
  }
});
