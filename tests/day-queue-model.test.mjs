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

function insertQueue(db, { id, business = "one", date = "2030-01-02", position = 1, appointmentId = null, clientId }) {
  db.prepare(`INSERT INTO day_queue_entries
    (id,business_id,queue_date,kind,status,position,appointment_id,client_id,arrived_at,created_at,updated_at)
    VALUES (?,?,?,'walk_in','waiting',?,?,?,?,?,?)`)
    .run(id, business, date, position, appointmentId, clientId, "2030-01-02T09:00:00.000Z", "2030-01-02T09:00:00.000Z", "2030-01-02T09:00:00.000Z");
}

test("persists the day queue with tenant isolation and one check-in per appointment", () => {
  const db = migratedDatabase();
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='day_queue_entries'").get();
    assert.equal(table.name, "day_queue_entries");
    insertQueue(db, { id: "first", clientId: "client-one", appointmentId: "appointment-one" });
    insertQueue(db, { id: "other-business", business: "two", clientId: "client-two", appointmentId: "appointment-one" });
    assert.throws(() => insertQueue(db, { id: "duplicate", clientId: "client-one", appointmentId: "appointment-one" }), /UNIQUE/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM day_queue_entries WHERE business_id='one'").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM day_queue_entries WHERE business_id='two'").get().count, 1);
  } finally {
    db.close();
  }
});

test("keeps waiting positions deterministic and supports operational timestamps", () => {
  const db = migratedDatabase();
  try {
    insertQueue(db, { id: "first", position: 1, clientId: "client-one" });
    insertQueue(db, { id: "second", position: 2, clientId: "client-two" });
    db.prepare("UPDATE day_queue_entries SET position=2,started_at=?,status='in_service' WHERE id='first'").run("2030-01-02T09:12:00.000Z");
    db.prepare("UPDATE day_queue_entries SET position=1 WHERE id='second'").run();
    const rows = db.prepare("SELECT id,position,status,started_at AS startedAt FROM day_queue_entries WHERE business_id='one' ORDER BY position").all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { id: "second", position: 1, status: "waiting", startedAt: null },
      { id: "first", position: 2, status: "in_service", startedAt: "2030-01-02T09:12:00.000Z" },
    ]);
  } finally {
    db.close();
  }
});
