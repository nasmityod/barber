import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { generateRecurringDates, nextRecurringDate } from "../app/recurrence.ts";

const migration = readFileSync(new URL("../drizzle/0012_cloudy_namora.sql",import.meta.url),"utf8")
  .replaceAll("--> statement-breakpoint","");

test("genera series semanales y quincenales dentro del rango",()=>{
  assert.deepEqual(generateRecurringDates("2030-01-07","2030-02-04","weekly"),[
    "2030-01-07","2030-01-14","2030-01-21","2030-01-28","2030-02-04",
  ]);
  assert.deepEqual(generateRecurringDates("2030-01-07","2030-02-04","biweekly"),[
    "2030-01-07","2030-01-21","2030-02-04",
  ]);
});

test("la frecuencia mensual conserva el día ancla cuando el mes lo permite",()=>{
  assert.deepEqual(generateRecurringDates("2028-01-31","2028-04-30","monthly"),[
    "2028-01-31","2028-02-29","2028-03-31","2028-04-30",
  ]);
  assert.equal(nextRecurringDate("2028-01-31","monthly",4),"2028-05-31");
});

test("limita una serie a 52 ocurrencias",()=>{
  const dates=generateRecurringDates("2030-01-01","2032-01-01","weekly");
  assert.equal(dates.length,52);
  assert.equal(dates[0],"2030-01-01");
});

test("la migración persiste la serie y relaciona sus ocurrencias",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(`CREATE TABLE appointments (
      id TEXT PRIMARY KEY NOT NULL,business_id TEXT NOT NULL,appointment_date TEXT NOT NULL
    )`);
    db.exec(migration);
    const columns=db.prepare("PRAGMA table_info(appointments)").all().map((column)=>column.name);
    assert.ok(columns.includes("recurring_series_id"));
    assert.ok(columns.includes("occurrence_number"));
    const insert=db.prepare(`INSERT INTO recurring_appointment_series
      (id,business_id,client_id,service_id,professional_id,frequency,start_date,end_date,start_time,
       idempotency_hash,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run("series","business","client","service","professional","weekly","2030-01-07","2030-02-04","09:00","request","user","now","now");
    assert.throws(()=>insert.run("series-2","business","client","service","professional","weekly","2030-01-07","2030-02-04","09:00","request","user","now","now"),/UNIQUE constraint/);
    const stored=db.prepare("SELECT status,notes FROM recurring_appointment_series WHERE id = ?").get("series");
    assert.equal(stored.status,"active");
    assert.equal(stored.notes,"");
  }finally{db.close()}
});
