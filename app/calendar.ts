export type CalendarView = "day" | "week" | "month";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function asUtcDate(date: string) {
  if (!DATE_PATTERN.test(date)) throw new Error("Fecha de calendario no válida.");
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error("Fecha de calendario no válida.");
  }
  return value;
}

function toCalendarDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, amount: number) {
  const value = asUtcDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return toCalendarDate(value);
}

export function startOfCalendarWeek(date: string) {
  const value = asUtcDate(date);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  return addCalendarDays(date, -daysSinceMonday);
}

export function calendarRange(anchorDate: string, view: CalendarView) {
  if (view === "day") return { from: anchorDate, to: anchorDate };
  if (view === "week") {
    const from = startOfCalendarWeek(anchorDate);
    return { from, to: addCalendarDays(from, 6) };
  }
  const monthStart = `${anchorDate.slice(0, 7)}-01`;
  const from = startOfCalendarWeek(monthStart);
  return { from, to: addCalendarDays(from, 41) };
}

export function calendarDates(from: string, to: string) {
  const dates: string[] = [];
  let current = from;
  while (current <= to && dates.length < 62) {
    dates.push(current);
    current = addCalendarDays(current, 1);
  }
  return dates;
}

export function shiftCalendarAnchor(anchorDate: string, view: CalendarView, direction: -1 | 1) {
  if (view === "day") return addCalendarDays(anchorDate, direction);
  if (view === "week") return addCalendarDays(anchorDate, direction * 7);
  const value = asUtcDate(anchorDate);
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return toCalendarDate(value);
}

export function dateInTimeZone(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
