import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../drizzle/0005_time_block_guards.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

function createDatabase() {
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
  db.exec(`CREATE TABLE time_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    block_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  )`);
  db.exec(migration);
  return db;
}

function insertAppointment(db, { id, professional = "professional", start, end, status = "programada" }) {
  db.prepare(`INSERT INTO appointments
    (id, business_id, professional_id, appointment_date, start_time, end_time, status)
    VALUES (?, 'business', ?, '2030-01-02', ?, ?, ?)`)
    .run(id, professional, start, end, status);
}

function insertBlock(db, { id, professional = "professional", start, end }) {
  db.prepare(`INSERT INTO time_blocks
    (id, business_id, professional_id, block_date, start_time, end_time)
    VALUES (?, 'business', ?, '2030-01-02', ?, ?)`)
    .run(id, professional, start, end);
}

test("rejects a block that overlaps an active appointment", () => {
  const db = createDatabase();
  try {
    insertAppointment(db, { id: "appointment", start: "09:00", end: "09:35" });
    assert.throws(
      () => insertBlock(db, { id: "blocked", start: "09:30", end: "10:00" }),
      /time_block_appointment_overlap/,
    );
    insertBlock(db, { id: "adjacent", start: "09:35", end: "10:00" });
  } finally {
    db.close();
  }
});

test("rejects an appointment that overlaps a block and allows another professional", () => {
  const db = createDatabase();
  try {
    insertBlock(db, { id: "blocked", start: "10:00", end: "10:30" });
    assert.throws(
      () => insertAppointment(db, { id: "appointment", start: "10:15", end: "10:45" }),
      /appointment_time_block_overlap/,
    );
    insertAppointment(db, { id: "other", professional: "professional-2", start: "10:15", end: "10:45" });
  } finally {
    db.close();
  }
});

test("rejects overlapping blocks but ignores cancelled appointments", () => {
  const db = createDatabase();
  try {
    insertAppointment(db, { id: "cancelled", start: "11:00", end: "11:30", status: "cancelada" });
    insertBlock(db, { id: "first", start: "11:00", end: "11:30" });
    assert.throws(
      () => insertBlock(db, { id: "second", start: "11:15", end: "11:45" }),
      /time_block_overlap/,
    );
  } finally {
    db.close();
  }
});

test("protects future block and appointment updates", () => {
  const db = createDatabase();
  try {
    insertAppointment(db, { id: "appointment", start: "12:00", end: "12:30" });
    insertBlock(db, { id: "blocked", start: "13:00", end: "13:30" });
    assert.throws(
      () => db.prepare("UPDATE time_blocks SET start_time = '12:15', end_time = '12:45' WHERE id = 'blocked'").run(),
      /time_block_appointment_overlap/,
    );
    assert.throws(
      () => db.prepare("UPDATE appointments SET start_time = '13:15', end_time = '13:45' WHERE id = 'appointment'").run(),
      /appointment_time_block_overlap/,
    );
  } finally {
    db.close();
  }
});
