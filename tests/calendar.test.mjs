import test from "node:test";
import assert from "node:assert/strict";

import {
  addCalendarDays,
  calendarDates,
  calendarRange,
  dateInTimeZone,
  shiftCalendarAnchor,
  startOfCalendarWeek,
} from "../app/calendar.ts";

test("la semana de agenda comienza el lunes incluso al cruzar de mes", () => {
  assert.equal(startOfCalendarWeek("2026-08-02"), "2026-07-27");
  assert.deepEqual(calendarRange("2026-08-02", "week"), { from: "2026-07-27", to: "2026-08-02" });
});

test("la vista mensual siempre entrega una cuadrícula completa de 42 días", () => {
  const range = calendarRange("2026-08-15", "month");
  const dates = calendarDates(range.from, range.to);
  assert.deepEqual(range, { from: "2026-07-27", to: "2026-09-06" });
  assert.equal(dates.length, 42);
  assert.equal(dates[0], "2026-07-27");
  assert.equal(dates.at(-1), "2026-09-06");
});

test("la navegación respeta cambios de año y meses bisiestos", () => {
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftCalendarAnchor("2026-12-18", "month", 1), "2027-01-01");
  assert.equal(shiftCalendarAnchor("2026-08-02", "day", -1), "2026-08-01");
});

test("hoy se calcula con la zona horaria del negocio", () => {
  assert.equal(dateInTimeZone("America/Caracas", new Date("2026-08-02T02:30:00Z")), "2026-08-01");
});
