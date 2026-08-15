import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort()) {
    db.exec(readFileSync(`drizzle/${file}`, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return db;
}

test("stores public booking settings and one expiring portal token per appointment", () => {
  const db = migratedDatabase();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('booking_page_settings','appointment_portal_tokens') ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(tables, ["appointment_portal_tokens", "booking_page_settings"]);
    db.exec(`INSERT INTO businesses (id,name,slug,timezone,currency) VALUES ('one','One','one','America/Caracas','USD');
      INSERT INTO booking_page_settings (business_id,updated_at) VALUES ('one','2030-01-01T00:00:00Z');
      INSERT INTO clients (id,business_id,name,email,phone,created_at) VALUES ('client','one','Client','client@example.com','+581234567','2030-01-01');
      INSERT INTO services (id,business_id,name,category,duration_minutes,price_cents) VALUES ('service','one','Service','General',30,1000);
      INSERT INTO professionals (id,business_id,name,specialty) VALUES ('professional','one','Professional','General');
      INSERT INTO appointments (id,business_id,client_id,service_id,professional_id,appointment_date,start_time,end_time,status,source,notes,total_cents,created_at)
      VALUES ('appointment','one','client','service','professional','2030-01-01','09:00','09:30','confirmada','online','',1000,'2030-01-01');`);
    const token = createHash("sha256").update("test-token").digest("hex");
    db.prepare("INSERT INTO appointment_portal_tokens (token_hash,business_id,appointment_id,expires_at,created_at) VALUES (?,?,?,?,?)")
      .run(token, "one", "appointment", "2030-01-03T00:00:00Z", "2030-01-01T00:00:00Z");
    assert.equal(db.prepare("SELECT expires_at FROM appointment_portal_tokens WHERE token_hash=?").get(token).expires_at, "2030-01-03T00:00:00Z");
    assert.throws(() => db.prepare("INSERT INTO appointment_portal_tokens (token_hash,business_id,appointment_id,expires_at,created_at) VALUES (?,?,?,?,?)").run("another", "one", "appointment", "2030-01-04", "2030-01-01"), /UNIQUE/);
  } finally {
    db.close();
  }
});
