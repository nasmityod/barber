export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";

export function generateRecurringDates(startDate:string,endDate:string,frequency:RecurrenceFrequency) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) return [];
  const dates:string[] = [];
  const stepDays = frequency === "weekly" ? 7 : frequency === "biweekly" ? 14 : 0;
  const anchor = parseDate(startDate);
  for (let occurrence = 0; occurrence < 52; occurrence += 1) {
    const next = stepDays
      ? formatDate(new Date(Date.UTC(anchor.year,anchor.month-1,anchor.day+occurrence*stepDays)))
      : monthlyDate(anchor,occurrence);
    if (next > endDate) break;
    dates.push(next);
  }
  return dates;
}

export function nextRecurringDate(startDate:string,frequency:RecurrenceFrequency,count:number) {
  const anchor = parseDate(startDate);
  if (frequency === "monthly") return monthlyDate(anchor,count);
  return formatDate(new Date(Date.UTC(anchor.year,anchor.month-1,anchor.day+count*(frequency==="weekly"?7:14))));
}

function isIsoDate(value:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = parseDate(value);
  return formatDate(new Date(Date.UTC(parsed.year,parsed.month-1,parsed.day))) === value;
}

function parseDate(value:string) {
  return {year:Number(value.slice(0,4)),month:Number(value.slice(5,7)),day:Number(value.slice(8,10))};
}

function monthlyDate(anchor:ReturnType<typeof parseDate>,offset:number) {
  const monthIndex = anchor.month-1+offset;
  const year = anchor.year+Math.floor(monthIndex/12);
  const month = ((monthIndex%12)+12)%12;
  const lastDay = new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return formatDate(new Date(Date.UTC(year,month,Math.min(anchor.day,lastDay))));
}

function formatDate(value:Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,"0")}-${String(value.getUTCDate()).padStart(2,"0")}`;
}
