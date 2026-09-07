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
