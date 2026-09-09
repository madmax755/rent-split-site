import { daySpanLabel, tenancyMonthLabel, tenancyPeriodDays, tenancyPeriodLabel } from "./dates";
import { money, payer, personName, plural } from "./format";
import { ensureMonth, sortedMonthKeys } from "./months";
import { deep } from "./clone";
import type {
  BedroomGap,
  CheckResult,
  ComputeMode,
  DayModel,
  HouseholdState,
  MonthCompute,
  MonthConfig,
  MonthLine,
  MonthRecord,
  PeriodCounts,
  Person,
  Stint,
} from "./types";

export const CONFIG_FIELDS = [
  "rent",
  "rentCycleStartDay",
  "tenancyStart",
  "rooms",
  "catchall",
  "catchallWeight",
  "bills",
  "people",
] as const;

export function captureConfig(state: HouseholdState): MonthConfig {
  return {
    rent: deep(state.rent),
    rentCycleStartDay: state.rentCycleStartDay,
    tenancyStart: state.tenancyStart,
    rooms: deep(state.rooms),
    catchall: deep(state.catchall),
    catchallWeight: deep(state.catchallWeight),
    bills: deep(state.bills),
    people: deep(state.people),
  };
}

export function withMonthConfig<T>(
  state: HouseholdState,
  M: MonthRecord | undefined,
  fn: () => T,
): T {
  if (!M || !M.config) return fn();
  const saved: Partial<HouseholdState> = {};
  CONFIG_FIELDS.forEach((k) => {
    saved[k] = state[k] as never;
    if (M.config && M.config[k] !== undefined) {
      (state as Record<string, unknown>)[k] = M.config[k];
    }
  });
  try {
    return fn();
  } finally {
    CONFIG_FIELDS.forEach((k) => {
      (state as Record<string, unknown>)[k] = saved[k];
    });
  }
}

function occupancyFromStints(
  stints: Stint[],
  d: number,
): { liable: string[]; rooms: Record<string, string[]> } {
  const liable: string[] = [];
  const rooms: Record<string, string[]> = {};
  stints.forEach((s) => {
    if (d < s.from || d > s.to) return;
    if (!liable.includes(s.personId)) liable.push(s.personId);
    if (!rooms[s.roomId]) rooms[s.roomId] = [];
    const occupants = rooms[s.roomId];
    if (occupants && !occupants.includes(s.personId)) occupants.push(s.personId);
  });
  return { liable, rooms };
}

export function buildDayModel(state: HouseholdState, key: string): DayModel[] {
  const M = state.months[key];
  if (!M) return [];
  return tenancyPeriodDays(key, state.tenancyStart).map((date, index) => {
    const { liable, rooms } = occupancyFromStints(M.stints || [], index + 1);
    return { key: date.key, d: date.d, liable, present: liable, rooms };
  });
}

export function chargeableDays(state: HouseholdState, key: string): DayModel[] {
  return buildDayModel(state, key);
}

export function periodCounts(state: HouseholdState, labelledKey: string): PeriodCounts {
  const days = chargeableDays(state, labelledKey);
  const liableDays: Record<string, number> = {};
  state.people.forEach((p) => {
    liableDays[p.id] = 0;
  });
  days.forEach((day) =>
    day.liable.forEach((id) => {
      if (id in liableDays) liableDays[id] = (liableDays[id] ?? 0) + 1;
    }),
  );
  return {
    liableDays,
    days,
    cycleStartDay: 1,
    periodLabel: tenancyPeriodLabel(labelledKey, state.tenancyStart),
    periodLength: days.length,
  };
}

export function bedroomGapsInner(state: HouseholdState, key: string): BedroomGap[] {
  const days = chargeableDays(state, key);
  const out: BedroomGap[] = [];
  state.rooms
    .filter((r) => !r.communal)
    .forEach((room) => {
      const empty: Array<{ key: string; d: number }> = [];
      days.forEach((day) => {
        if (!(day.rooms[room.id] || []).length) empty.push({ key: day.key, d: day.d });
      });
      if (empty.length) out.push({ roomId: room.id, name: room.name, days: empty });
    });
  return out;
}

export function bedroomGaps(state: HouseholdState, key: string): BedroomGap[] {
  return withMonthConfig(state, state.months[key], () => bedroomGapsInner(state, key));
}

export function weightedAreas(state: HouseholdState): {
  rooms: Array<(typeof state.rooms)[number] & { wa: number }>;
  ca: number;
  total: number;
} {
  const rooms = state.rooms.map((r) => ({
    ...r,
    wa: (+r.w || 0) * (+r.l || 0) * (typeof r.weight === "number" ? r.weight : 1),
  }));
  const ca =
    (+state.catchall || 0) * (typeof state.catchallWeight === "number" ? state.catchallWeight : 1);
  return { rooms, ca, total: rooms.reduce((s, r) => s + r.wa, 0) + ca };
}

export function distribute(
  weights: Record<string, number>,
  totalPence: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(weights).forEach((id) => {
    out[id] = 0;
  });
  const ids = Object.keys(weights).filter((id) => (weights[id] ?? 0) > 0);
  const sum = ids.reduce((s, i) => s + (weights[i] ?? 0), 0);
  if (sum <= 0 || !ids.length || !totalPence) return out;
  const exact: Record<string, number> = {};
  const frac: Record<string, number> = {};
  let assigned = 0;
  ids.forEach((id) => {
    exact[id] = (totalPence * (weights[id] ?? 0)) / sum;
    const fl = Math.floor(exact[id] ?? 0);
    out[id] = fl;
    frac[id] = (exact[id] ?? 0) - fl;
    assigned += fl;
  });
  let rem = Math.round(totalPence - assigned);
  const order = ids.slice().sort((a, b) => (frac[b] ?? 0) - (frac[a] ?? 0) || (a < b ? -1 : 1));
  let i = 0;
  while (rem > 0) {
    const id = order[i % order.length];
    if (id) out[id] = (out[id] ?? 0) + 1;
    rem--;
    i++;
  }
  while (rem < 0) {
    const id = order[i % order.length];
    if (id) out[id] = (out[id] ?? 0) - 1;
    rem++;
    i++;
  }
  return out;
}

export function monthAgreedRent(state: HouseholdState, key: string): number {
  const M = state.months[key];
  return typeof M?.rent === "number" ? M.rent : state.rent;
}

export function computeRent(
  state: HouseholdState,
  key: string,
  rentPence: number,
): {
  bedroom: Record<string, number>;
  shared: Record<string, number>;
  raw: Record<string, number>;
  warn: string[];
} {
  const days = chargeableDays(state, key);
  const D = days.length;
  const scope = "this tenancy month";
  const { rooms, ca, total } = weightedAreas(state);
  const rawBed: Record<string, number> = {};
  const rawShare: Record<string, number> = {};
  const warn: string[] = [];
  const seen: Record<string, boolean> = {};
  days.forEach((day) =>
    day.liable.forEach((id) => {
      seen[id] = true;
    }),
  );
  const anyLiable = Object.keys(seen);

  if (total <= 0) {
    return {
      bedroom: {},
      shared: {},
      raw: {},
      warn: ["No floor area has been entered, so rent cannot be allocated."],
    };
  }
  if (!anyLiable.length) {
    return {
      bedroom: {},
      shared: {},
      raw: {},
      warn: [`Nobody is down as being here ${scope} — add a stint on the Who's here tab.`],
    };
  }

  const orphanDays: Array<{ key: string; d: number }> = [];
  days.forEach((day) => {
    const liable = day.liable.length
      ? day.liable
      : (orphanDays.push({ key: day.key, d: day.d }), anyLiable);
    rooms.forEach((room) => {
      if (room.wa <= 0) return;
      const daily = (rentPence * (room.wa / total)) / D;
      let occ: string[];
      if (room.communal) occ = liable;
      else {
        occ = (day.rooms[room.id] || []).filter((id) => liable.includes(id));
        if (!occ.length) occ = liable;
      }
      const each = daily / occ.length;
      occ.forEach((id) => {
        if (room.communal) rawShare[id] = (rawShare[id] || 0) + each;
        else rawBed[id] = (rawBed[id] || 0) + each;
      });
    });
    if (ca > 0) {
      const each = (rentPence * (ca / total)) / D / liable.length;
      liable.forEach((id) => {
        rawShare[id] = (rawShare[id] || 0) + each;
      });
    }
  });

  if (orphanDays.length) {
    warn.push(
      `Nobody is down as being here on ${plural(orphanDays.length, "day")} (${daySpanLabel(orphanDays)}). Those days were charged to everyone who was here at some point in ${scope}.`,
    );
  }

  const raw: Record<string, number> = {};
  [...new Set([...Object.keys(rawBed), ...Object.keys(rawShare)])].forEach((id) => {
    raw[id] = (rawBed[id] || 0) + (rawShare[id] || 0);
  });
  const totalShare = distribute(raw, rentPence);
  const bedroom: Record<string, number> = {};
  const shared: Record<string, number> = {};
  Object.keys(totalShare).forEach((id) => {
    const b = rawBed[id] || 0;
    const s = rawShare[id] || 0;
    const denom = b + s;
    const share = totalShare[id] ?? 0;
    bedroom[id] = denom > 0 ? Math.round((share * b) / denom) : 0;
    shared[id] = share - (bedroom[id] ?? 0);
  });
  return { bedroom, shared, raw: totalShare, warn };
}

export function dayCounts(state: HouseholdState, key: string): MonthCompute["counts"] {
  const days = chargeableDays(state, key);
  const liableDays: Record<string, number> = {};
  state.people.forEach((p) => {
    liableDays[p.id] = 0;
  });
  days.forEach((day) =>
    day.liable.forEach((id) => {
      if (id in liableDays) liableDays[id] = (liableDays[id] ?? 0) + 1;
    }),
  );
  return { nights: liableDays, liableDays, days };
}

export function billUnits(
  state: HouseholdState,
  payers: string[] | null | undefined,
  counts: { liableDays: Record<string, number> },
): { units: Record<string, number>; how: Record<string, string>; sum: number; fallback: boolean } {
  const { liableDays } = counts;
  const units: Record<string, number> = {};
  const how: Record<string, string> = {};
  state.people.forEach((p) => {
    if (payers && payers.length && !payers.includes(p.id)) {
      units[p.id] = 0;
      how[p.id] = "not a payer";
      return;
    }
    units[p.id] = liableDays[p.id] || 0;
    how[p.id] = "days";
  });
  let sum = Object.values(units).reduce((s, v) => s + v, 0);
  let fallback = false;
  if (sum <= 0) {
    fallback = true;
    const eligible =
      payers && payers.length
        ? state.people.filter((p) => payers.includes(p.id))
        : state.people.filter((p) => !p.archived);
    eligible.forEach((p) => {
      units[p.id] = 1;
      how[p.id] = "split equally (nobody was here)";
    });
    sum = eligible.length;
  }
  return { units, how, sum, fallback };
}

export function amountOf(line: MonthLine | undefined, mode: ComputeMode): number {
  if (!line) return 0;
  if (mode === "est") return +line.est || 0;
  return typeof line.act === "number" ? line.act : +line.est || 0;
}

export function monthHasActuals(M: MonthRecord | undefined): boolean {
  if (!M) return false;
  return Object.values(M.lines || {}).some((l) => typeof l.act === "number");
}

export function monthAllActual(state: HouseholdState, M: MonthRecord | undefined): boolean {
  if (!M) return false;
  const lines = state.bills.map((b) => M.lines[b.id]);
  return lines.length > 0 && lines.every((l) => l && typeof l.act === "number");
}

export function monthStatus(
  state: HouseholdState,
  key: string,
): "projected" | "collecting" | "reconciled" {
  const M = state.months[key];
  if (!M) return "projected";
  if (monthAllActual(state, M)) return "reconciled";
  if (M.collected) return "collecting";
  return "projected";
}

export function computeMonthInner(
  state: HouseholdState,
  key: string,
  mode: ComputeMode,
  M: MonthRecord,
): MonthCompute {
  const counts = dayCounts(state, key);
  const rentCounts = periodCounts(state, key);
  const rentAmount = monthAgreedRent(state, key);
  const rentPence = Math.round(rentAmount * 100);
  const r = computeRent(state, key, rentPence);

  const totals: Record<string, number> = {};
  const rentTotals: Record<string, number> = {};
  const billTotals: Record<string, number> = {};
  state.people.forEach((p) => {
    totals[p.id] = 0;
    rentTotals[p.id] = 0;
    billTotals[p.id] = 0;
  });
  Object.keys(r.raw).forEach((id) => {
    if (!(id in totals)) {
      totals[id] = 0;
      rentTotals[id] = 0;
      billTotals[id] = 0;
    }
    totals[id] = (totals[id] ?? 0) + (r.raw[id] ?? 0);
    rentTotals[id] = (rentTotals[id] ?? 0) + (r.raw[id] ?? 0);
  });

  const lines: MonthCompute["lines"] = [];
  const allLines = state.bills.map((b) => ({
    def: b,
    line: M.lines[b.id] || { est: b.est ?? 0, act: null },
  }));

  allLines.forEach(({ def, line }) => {
    const amt = Math.round(amountOf(line, mode) * 100);
    const lineCounts = periodCounts(state, key);
    const u = billUnits(state, def.payers, lineCounts);
    const shares = distribute(u.units, amt);
    Object.keys(shares).forEach((id) => {
      if (!(id in totals)) {
        totals[id] = 0;
        rentTotals[id] = 0;
        billTotals[id] = 0;
      }
      totals[id] = (totals[id] ?? 0) + (shares[id] ?? 0);
      billTotals[id] = (billTotals[id] ?? 0) + (shares[id] ?? 0);
    });
    lines.push({
      id: def.id,
      name: def.name,
      oneOff: false,
      amount: amt,
      shares,
      units: u.units,
      how: u.how,
      unitSum: u.sum,
      fallback: u.fallback,
      isActual: typeof line.act === "number",
      est: Math.round((+line.est || 0) * 100),
      act: typeof line.act === "number" ? Math.round(line.act * 100) : null,
      cycleStartDay: 1,
      periodLabel: lineCounts.periodLabel,
      periodLength: lineCounts.periodLength,
    });
  });

  const billsTotalPence = lines.reduce((s, l) => s + l.amount, 0);
  return {
    key,
    mode,
    counts,
    rentCounts,
    rentPence,
    rentAmount,
    chargeableDays: rentCounts.periodLength,
    bedroom: r.bedroom,
    shared: r.shared,
    rentShare: r.raw,
    warn: r.warn,
    lines,
    totals,
    rentTotals,
    billTotals,
    grand: rentPence + billsTotalPence,
    billsTotalPence,
  };
}

export function computeMonth(state: HouseholdState, key: string, mode: ComputeMode): MonthCompute {
  const M = ensureMonth(state, key);
  return withMonthConfig(state, M, () => computeMonthInner(state, key, mode, M));
}

export function chargedFor(state: HouseholdState, key: string): Record<string, number> {
  const M = state.months[key];
  if (M && M.charged && typeof M.charged === "object") return M.charged;
  return computeMonth(state, key, "est").totals;
}

export function computeBalances(state: HouseholdState): {
  bal: Record<string, number>;
  items: Array<{
    type: string;
    monthKey: string;
    personId: string;
    amount: number;
    date: string;
    note?: string;
    id?: string;
  }>;
  known: string[];
} {
  const bal: Record<string, number> = {};
  const items: Array<{
    type: string;
    monthKey: string;
    personId: string;
    amount: number;
    date: string;
    note?: string;
    id?: string;
  }> = [];
  const known = new Set(state.people.map((p) => p.id));
  const payerId = (state.people.find((p) => p.isPayer) as Person | undefined)?.id;

  sortedMonthKeys(state).forEach((k) => {
    const M = state.months[k];
    if (!M?.collected || !monthHasActuals(M)) return;
    const charged = chargedFor(state, k);
    const eff = computeMonth(state, k, "eff").totals;
    const ids = new Set([...Object.keys(charged), ...Object.keys(eff)]);
    ids.forEach((id) => {
      if (id === payerId) return;
      const v = Math.round((eff[id] || 0) - (charged[id] || 0));
      if (!v) return;
      bal[id] = (bal[id] || 0) + v;
      items.push({ type: "trueup", monthKey: k, personId: id, amount: v, date: M.chargedAt || "" });
      known.add(id);
    });
  });

  (state.ledger || []).forEach((e) => {
    if (e.personId === payerId) return;
    const amt = Math.round(+e.amount || 0);
    bal[e.personId] = (bal[e.personId] || 0) - amt;
    items.push({
      type: e.type || "settle",
      monthKey: e.monthKey || "",
      personId: e.personId,
      amount: -amt,
      date: e.date || "",
      note: e.note || "",
      id: e.id,
    });
    known.add(e.personId);
  });

  items.sort(
    (a, b) =>
      (b.monthKey || "").localeCompare(a.monthKey || "") ||
      (b.date || "").localeCompare(a.date || ""),
  );
  return { bal, items, known: [...known] };
}

export function runChecks(state: HouseholdState): CheckResult[] {
  const results: CheckResult[] = [];
  sortedMonthKeys(state).forEach((k) => {
    const c = computeMonth(state, k, "eff");
    const rentSum = Object.values(c.rentShare).reduce((s, v) => s + v, 0);
    const problems: string[] = [];
    if (rentSum !== c.rentPence) {
      problems.push(
        `rent shares add to ${money(state.currency, rentSum)}, not ${money(state.currency, c.rentPence)}`,
      );
    }
    c.lines.forEach((l) => {
      const s = Object.values(l.shares).reduce((a, v) => a + v, 0);
      if (s !== l.amount) {
        problems.push(
          `${l.name} shares add to ${money(state.currency, s)}, not ${money(state.currency, l.amount)}`,
        );
      }
    });
    Object.keys(c.rentShare).forEach((id) => {
      if ((c.bedroom[id] || 0) + (c.shared[id] || 0) !== c.rentShare[id]) {
        problems.push(
          `${personName(state, id)}'s bedroom and shared parts don't add to their rent`,
        );
      }
    });
    results.push({ key: k, ok: problems.length === 0, problems, warn: c.warn });
  });
  return results;
}

export function monthSummaryText(state: HouseholdState, key: string): string {
  ensureMonth(state, key);
  const c = computeMonth(state, key, "eff");
  const pay = payer(state);
  const lines: string[] = [];
  lines.push(`${tenancyMonthLabel(key)} — rent & bills`);
  lines.push("");
  lines.push(`Rent ${money(state.currency, c.rentPence)}`);
  c.lines.forEach((l) =>
    lines.push(`${l.name} ${money(state.currency, l.amount)}${l.isActual ? "" : " (estimate)"}`),
  );
  lines.push(`Total ${money(state.currency, c.grand)}`);
  lines.push("");
  state.people.forEach((p) => {
    const t = c.totals[p.id] || 0;
    if (!t) return;
    const n = c.counts.liableDays[p.id] || 0;
    const denom = c.chargeableDays;
    lines.push(
      `${p.name}: ${money(state.currency, t)}  (${n} of ${denom} days here · ${c.rentCounts.periodLabel})`,
    );
  });
  const { bal } = computeBalances(state);
  const owing = state.people.filter((p) => !p.isPayer && Math.abs(bal[p.id] || 0) >= 1);
  if (owing.length) {
    lines.push("");
    lines.push("Running balances:");
    owing.forEach((p) => {
      const v = bal[p.id] ?? 0;
      lines.push(
        v > 0
          ? `${p.name} owes ${pay.name} ${money(state.currency, v)}`
          : `${pay.name} owes ${p.name} ${money(state.currency, -v)}`,
      );
    });
  }
  lines.push("");
  lines.push(
    `Everything is paid by ${pay.name}. Rent splits by weighted room area; every bill splits across the days each person was here. Same rule for everybody.`,
  );
  return lines.join("\n");
}
