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

test("persists business settings and isolates resources by business", () => {
  const db = migratedDatabase();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('business_settings','resources') ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(tables, ["business_settings", "resources"]);
    assert.ok(db.prepare("PRAGMA table_info(appointments)").all().some((row) => row.name === "resource_id"));

    db.exec(`INSERT INTO businesses (id,name,slug) VALUES ('one','One','one'),('two','Two','two');
      INSERT INTO business_settings (business_id,updated_at) VALUES ('one','2030-01-01T00:00:00Z');
      INSERT INTO resources (id,business_id,name,service_ids,professional_ids,created_at,updated_at)
      VALUES ('resource-one','one','Silla principal','[]','[]','2030-01-01','2030-01-01'),
             ('resource-two','two','Silla principal','[]','[]','2030-01-01','2030-01-01');`);
    assert.equal(db.prepare("SELECT payment_methods FROM business_settings WHERE business_id='one'").get().payment_methods, '["cash","card","transfer","mobile"]');
    assert.throws(() => db.exec("INSERT INTO resources (id,business_id,name,created_at,updated_at) VALUES ('duplicate','one','Silla principal','2030-01-01','2030-01-01')"), /UNIQUE/);
  } finally {
    db.close();
  }
});

test("rejects active appointment overlap on the same resource and allows cancelled history", () => {
  const db = migratedDatabase();
  try {
    db.exec(`INSERT INTO businesses (id,name,slug) VALUES ('one','One','one');
      INSERT INTO clients (id,business_id,name,email,phone,created_at) VALUES ('client','one','Client','client@example.com','+581234567','2030-01-01');
      INSERT INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('service','one','Service','General',30,1000);
      INSERT INTO professionals (id,business_id,name,specialty) VALUES ('professional','one','Professional','General');
      INSERT INTO resources (id,business_id,name,created_at,updated_at) VALUES ('resource','one','Silla','2030-01-01','2030-01-01');
      INSERT INTO appointments (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,resource_id,created_at)
      VALUES ('first','one','client','service','professional','2030-01-01','09:00','09:30','programada','panel','',1000,'resource','2030-01-01');`);
    assert.throws(() => db.exec(`INSERT INTO appointments (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,resource_id,created_at)
      VALUES ('overlap','one','client','service','professional','2030-01-01','09:15','09:45','programada','panel','',1000,'resource','2030-01-01')`), /resource_time_overlap/);
    db.exec(`INSERT INTO appointments (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,resource_id,created_at)
      VALUES ('cancelled','one','client','service','professional','2030-01-01','09:15','09:45','cancelada','panel','',1000,'resource','2030-01-01');`);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE resource_id='resource'").get().count, 2);
  } finally {
    db.close();
  }
});
