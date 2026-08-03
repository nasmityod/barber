import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0004_appointment_overlap_guards.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

function databaseWithLegacyAppointment() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE appointments (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    appointment_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL
  )`);
  db.prepare(`INSERT INTO appointments
    (id, business_id, professional_id, appointment_date, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("existing", "business", "professional", "2030-01-02", "09:00", "09:35", "programada");
  db.exec(migration);
  return db;
}

function insertAppointment(db, { id, professional = "professional", start, end, status = "programada" }) {
  db.prepare(`INSERT INTO appointments
    (id, business_id, professional_id, appointment_date, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, "business", professional, "2030-01-02", start, end, status);
}

test("rejects every kind of overlap, including against appointments created before the migration", () => {
  const db = databaseWithLegacyAppointment();
  try {
    assert.throws(() => insertAppointment(db, { id: "same", start: "09:00", end: "09:20" }), /appointment_time_overlap/);
    assert.throws(() => insertAppointment(db, { id: "inside", start: "09:10", end: "09:20" }), /appointment_time_overlap/);
    assert.throws(() => insertAppointment(db, { id: "contains", start: "08:45", end: "09:45" }), /appointment_time_overlap/);
    assert.throws(() => insertAppointment(db, { id: "tail", start: "09:30", end: "10:00" }), /appointment_time_overlap/);
  } finally {
    db.close();
  }
});

test("allows adjacent appointments, cancelled ranges, and another professional", () => {
  const db = databaseWithLegacyAppointment();
  try {
    insertAppointment(db, { id: "adjacent", start: "09:35", end: "10:00" });
    insertAppointment(db, { id: "cancelled", start: "09:10", end: "09:20", status: "cancelada" });
    insertAppointment(db, { id: "other-professional", professional: "professional-2", start: "09:10", end: "09:20" });
  } finally {
    db.close();
  }
});

test("rejects reprogramming an appointment into an occupied range", () => {
  const db = databaseWithLegacyAppointment();
  try {
    insertAppointment(db, { id: "later", start: "10:00", end: "10:30" });
    assert.throws(
      () => db.prepare("UPDATE appointments SET start_time = ?, end_time = ? WHERE id = ?")
        .run("09:30", "10:00", "later"),
      /appointment_time_overlap/,
    );
  } finally {
    db.close();
  }
});

test("allows reprogramming an appointment when the new range is free", () => {
  const db = databaseWithLegacyAppointment();
  try {
    insertAppointment(db, { id: "later", start: "10:00", end: "10:30" });
    db.prepare("UPDATE appointments SET start_time = ?, end_time = ? WHERE id = ?")
      .run("09:35", "10:05", "later");
    const updated = db.prepare("SELECT start_time AS startTime, end_time AS endTime FROM appointments WHERE id = ?")
      .get("later");
    assert.equal(updated.startTime, "09:35");
    assert.equal(updated.endTime, "10:05");
  } finally {
    db.close();
  }
});
