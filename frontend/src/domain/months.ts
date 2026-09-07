import { uid } from "./ids";
import { addMonths, daysInMonth } from "./dates";
import { DEFAULT_ROOM_OF } from "./defaults";
import type { HouseholdState, MonthRecord, Stint } from "./types";

export function sortedMonthKeys(state: HouseholdState): string[] {
  return Object.keys(state.months).sort();
}

export function lastRoomOf(state: HouseholdState, personId: string): string {
  const keys = sortedMonthKeys(state).reverse();
  for (const k of keys) {
    const month = state.months[k];
    if (!month) continue;
    const st = (month.stints || []).filter((x) => x.personId === personId).pop();
    if (st) return st.roomId;
  }
  if (DEFAULT_ROOM_OF[personId]) return DEFAULT_ROOM_OF[personId];
  const bedrooms = state.rooms.filter((r) => !r.communal);
  return bedrooms[0]?.id ?? state.rooms[0]?.id ?? "";
}

export function blankMonth(state: HouseholdState, key: string): MonthRecord {
  const lines: MonthRecord["lines"] = {};
  state.bills.forEach((b) => {
    lines[b.id] = { est: b.est ?? 0, act: null };
  });
  return {
    key,
    rent: null,
    lines,
    oneOffs: [],
    stints: [],
    collected: false,
    charged: null,
    chargedAt: "",
    note: "",
    config: null,
  };
}

export function seedStints(state: HouseholdState, key: string, fromScratch = false): void {
  const M = state.months[key];
  if (!M) return;
  const D = daysInMonth(key);
  const earlier = fromScratch
    ? []
    : sortedMonthKeys(state).filter((k) => k < key && (state.months[k]?.stints || []).length);
  const prevKey = earlier.length ? earlier[earlier.length - 1] : null;
  const prev = prevKey ? state.months[prevKey] : null;
  if (prev && (prev.stints || []).length && prevKey) {
    const prevD = daysInMonth(prevKey);
    M.stints = prev.stints
      .filter((st) => state.people.some((p) => p.id === st.personId && !p.archived))
      .map(
        (st): Stint => ({
          id: uid("st"),
          personId: st.personId,
          roomId: st.roomId,
          from: Math.min(D, st.from),
          to: st.to >= prevD ? D : Math.min(D, st.to),
        }),
      );
    if (M.stints.length) return;
  }
  M.stints = state.people
    .filter((p) => !p.archived)
    .map((p) => ({
      id: uid("st"),
      personId: p.id,
      roomId: lastRoomOf(state, p.id),
      from: 1,
      to: D,
    }));
}

export function ensureMonth(state: HouseholdState, key: string): MonthRecord {
  if (!state.months[key]) {
    state.months[key] = blankMonth(state, key);
    const prev = state.months[addMonths(key, -1)];
    if (prev) {
      state.bills.forEach((b) => {
        const pl = prev.lines[b.id];
        const line = state.months[key]?.lines[b.id];
        if (pl && typeof pl.act === "number" && line) line.est = pl.act;
      });
    }
    seedStints(state, key);
  }
  const month = state.months[key];
  if (!month) throw new Error(`Month ${key} missing after ensure`);
  return month;
}
