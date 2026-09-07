import { PERSON_COLORS } from "./defaults";
import type { HouseholdState, Person } from "./types";

export function fmtNum(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function money(currency: string, pence: number): string {
  if (!Number.isFinite(pence)) return "—";
  return (
    currency +
    (pence / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function money0(currency: string, pence: number): string {
  if (!Number.isFinite(pence)) return "—";
  return currency + Math.round(pence / 100).toLocaleString();
}

export function signedMoney(currency: string, pence: number): string {
  return (pence > 0 ? "+" : pence < 0 ? "−" : "") + money(currency, Math.abs(pence));
}

export function initials(name: string): string {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 1).toUpperCase();
  const last = parts[parts.length - 1];
  if (!last) return first.slice(0, 1).toUpperCase();
  return (first[0] + last[0]).toUpperCase();
}

export function personById(state: HouseholdState, id: string): Person | null {
  return state.people.find((p) => p.id === id) ?? null;
}

export function personName(state: HouseholdState, id: string): string {
  const p = personById(state, id);
  return p ? p.name : "(removed)";
}

export function personColor(state: HouseholdState, id: string): string {
  const i = state.people.findIndex((p) => p.id === id);
  const colour = PERSON_COLORS[(i < 0 ? 0 : i) % PERSON_COLORS.length];
  return colour ?? PERSON_COLORS[0] ?? "#ff9f0a";
}

export function payer(state: HouseholdState): Person {
  return (
    state.people.find((p) => p.isPayer) ??
    state.people[0] ?? { name: "the payer", id: "", isPayer: true, archived: false }
  );
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

export function rangeText(nums: number[]): string {
  const parts: string[] = [];
  let a: number | null = null;
  let b: number | null = null;
  nums.forEach((d) => {
    if (a === null || b === null) {
      a = b = d;
      return;
    }
    if (d === b + 1) {
      b = d;
      return;
    }
    parts.push(a === b ? `${a}` : `${a}–${b}`);
    a = b = d;
  });
  if (a !== null && b !== null) parts.push(a === b ? `${a}` : `${a}–${b}`);
  return parts.join(", ");
}
