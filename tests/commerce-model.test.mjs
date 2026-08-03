import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = ["0013_puzzling_madelyne_pryor.sql", "0014_bent_absorbing_man.sql"]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"))
  .join("\n").replaceAll("--> statement-breakpoint", "");

test("creates the commerce tables, tips, and reusable product SKU rules", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE payments (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, appointment_id TEXT NOT NULL,
      cash_session_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed', reference TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, voided_by TEXT, voided_at TEXT,
      void_reason TEXT NOT NULL DEFAULT ''
    )`);
    db.exec(migration);
    db.prepare(`INSERT INTO products
      (id,business_id,name,sku,category,price_cents,cost_cents,stock_quantity,minimum_stock,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("one", "biz", "Pomada", "", "Styling", 1200, 500, 4, 1, "2030-01-01");
    db.prepare(`INSERT INTO products
      (id,business_id,name,sku,category,price_cents,cost_cents,stock_quantity,minimum_stock,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("two", "biz", "Cera", "", "Styling", 900, 300, 2, 1, "2030-01-01");
    db.prepare(`INSERT INTO products
      (id,business_id,name,sku,category,price_cents,cost_cents,stock_quantity,minimum_stock,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("three", "biz", "Gel", "SKU-1", "Styling", 700, 200, 1, 1, "2030-01-01");
    assert.throws(() => db.prepare(`INSERT INTO products
      (id,business_id,name,sku,category,price_cents,cost_cents,stock_quantity,minimum_stock,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("four", "biz", "Otro gel", "SKU-1", "Styling", 700, 200, 1, 1, "2030-01-01"));
    db.prepare(`INSERT INTO payments
      (id,business_id,appointment_id,cash_session_id,amount_cents,method,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run("payment", "biz", "appointment", "session", 1000, "efectivo", "user", "2030-01-01");
    assert.equal(db.prepare("SELECT tip_cents FROM payments WHERE id = ?").get("payment").tip_cents, 0);
    assert.equal(db.prepare("PRAGMA table_info(payments)").all().some((column) => column.name === "tip_cents"), true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_sales").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM receipts").get().count, 0);
    assert.throws(() => db.prepare("UPDATE products SET stock_quantity = -1 WHERE id = ?").run("one"), /product_stock_negative/);
  } finally {
    db.close();
  }
});
