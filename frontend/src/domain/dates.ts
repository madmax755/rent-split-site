const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseKey(key: string): { y: number; m: number } {
  const [yRaw, mRaw] = String(key).split("-");
  return { y: Number(yRaw), m: Number(mRaw) };
}

export function daysInMonth(key: string): number {
  const { y, m } = parseKey(key);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(key: string, short = false): string {
  const { y, m } = parseKey(key);
  if (!y || !m) return "—";
  const nm = MONTH_NAMES[m - 1] ?? "";
  return short ? `${nm.slice(0, 3)} ${String(y).slice(2)}` : `${nm} ${y}`;
}

export function addMonths(key: string, n: number): string {
  const { y, m } = parseKey(key);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dayDate(key: string, day: number): Date {
  const { y, m } = parseKey(key);
  return new Date(y, m - 1, day);
}

export function isoOf(key: string, day: number): string {
  const { y, m } = parseKey(key);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type PeriodBounds = {
  startKey: string;
  startDay: number;
  endKey: string;
  endDay: number;
  length: number;
};

export function clampCycleDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.round(day)));
}

export function cycleDayInMonth(key: string, cycleDay: number): number {
  return Math.min(clampCycleDay(cycleDay), daysInMonth(key));
}

export type IsoDateParts = { key: string; day: number };

export function parseIsoDate(iso: string): IsoDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = Number(match[3]);
  if (!y || m < 1 || m > 12 || !day) return null;
  const key = `${y}-${String(m).padStart(2, "0")}`;
  const dim = daysInMonth(key);
  if (day < 1 || day > dim) return null;
  return { key, day };
}

export function clampTenancyStart(iso: string, fallback: string): string {
  return parseIsoDate(iso) ? iso : fallback;
}

export function tenancyMonthKey(tenancyStart: string, fallback = "2026-08"): string {
  return parseIsoDate(tenancyStart)?.key ?? fallback;
}

export function firstChargeableDay(monthKey: string, tenancyStart: string): number {
  const start = parseIsoDate(tenancyStart);
  const dim = daysInMonth(monthKey);
  if (!start) return 1;
  if (monthKey < start.key) return dim + 1;
  if (monthKey === start.key) return start.day;
  return 1;
}

export function chargeableDayCount(monthKey: string, tenancyStart: string): number {
  const dim = daysInMonth(monthKey);
  const from = firstChargeableDay(monthKey, tenancyStart);
  if (from > dim) return 0;
  return dim - from + 1;
}

export function calendarRangeLabel(monthKey: string, tenancyStart: string): string {
  const dim = daysInMonth(monthKey);
  const from = firstChargeableDay(monthKey, tenancyStart);
  if (from > dim) return monthLabel(monthKey);
  return `${dayMonthLabel(monthKey, from)} – ${dayMonthLabel(monthKey, dim)}`;
}

export function periodBounds(monthKey: string, cycleDay: number): PeriodBounds {
  const startDay = cycleDayInMonth(monthKey, cycleDay);
  const endKey = addMonths(monthKey, 1);
  const endDay = cycleDayInMonth(endKey, cycleDay);
  const length = daysInMonth(monthKey) - startDay + 1 + (endDay - 1);
  return { startKey: monthKey, startDay, endKey, endDay, length };
}

export function iteratePeriodDays(bounds: PeriodBounds): Array<{ key: string; d: number }> {
  const out: Array<{ key: string; d: number }> = [];
  let key = bounds.startKey;
  let d = bounds.startDay;
  for (let i = 0; i < bounds.length; i++) {
    out.push({ key, d });
    d += 1;
    if (d > daysInMonth(key)) {
      key = addMonths(key, 1);
      d = 1;
    }
  }
  return out;
}

export function ordinal(n: number): string {
  const v = Math.abs(Math.round(n)) % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (v % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function monthNameShort(key: string): string {
  const { m } = parseKey(key);
  return (MONTH_NAMES[m - 1] ?? "").slice(0, 3);
}

export function dayMonthLabel(key: string, day: number, withYear = false): string {
  const { y } = parseKey(key);
  const base = `${day} ${monthNameShort(key)}`;
  return withYear ? `${base} ${y}` : base;
}

export function inclusivePeriodEnd(bounds: PeriodBounds): { key: string; day: number } {
  if (bounds.endDay <= 1) {
    return { key: bounds.startKey, day: daysInMonth(bounds.startKey) };
  }
  return { key: bounds.endKey, day: bounds.endDay - 1 };
}

export function periodLabel(monthKey: string, cycleDay: number): string {
  const bounds = periodBounds(monthKey, cycleDay);
  const end = inclusivePeriodEnd(bounds);
  const startYear = parseKey(bounds.startKey).y;
  const endYear = parseKey(end.key).y;
  const crossYear = startYear !== endYear;
  return `${dayMonthLabel(bounds.startKey, bounds.startDay, crossYear)} – ${dayMonthLabel(end.key, end.day, crossYear)}`;
}

export function cyclePhrase(cycleDay: number): string {
  const day = clampCycleDay(cycleDay);
  return `${ordinal(day)}–${ordinal(day)}`;
}

export function daySpanLabel(days: Array<{ key: string; d: number }>): string {
  if (!days.length) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < days.length) {
    const start = days[i];
    if (!start) break;
    let j = i;
    while (j + 1 < days.length) {
      const next = days[j + 1];
      const cur = days[j];
      if (!next || !cur) break;
      if (next.key !== start.key || next.d !== cur.d + 1) break;
      j += 1;
    }
    const end = days[j];
    if (!end) break;
    const month = monthNameShort(start.key);
    parts.push(start.d === end.d ? `${month} ${start.d}` : `${month} ${start.d}–${end.d}`);
    i = j + 1;
  }
  return parts.join(", ");
}
