import { deep } from "./clone";
import {
  DEFAULT_BILLS,
  DEFAULT_CATCHALL,
  DEFAULT_CATCHALL_WEIGHT,
  DEFAULT_PEOPLE,
  DEFAULT_RENT,
  DEFAULT_ROOMS,
} from "./defaults";
import { SNAPSHOT_FIELDS, type HouseholdState, type Snapshot } from "./types";

export function snapshotCurrent(state: HouseholdState): Snapshot {
  const s = {} as Snapshot;
  SNAPSHOT_FIELDS.forEach((k) => {
    s[k] = deep(state[k]) as never;
  });
  return s;
}

export function applySnapshot(state: HouseholdState, snap: Snapshot): void {
  SNAPSHOT_FIELDS.forEach((k) => {
    if (snap[k] !== undefined) (state[k] as Snapshot[typeof k]) = deep(snap[k]) as never;
  });
}

export function resetHousehold(state: HouseholdState): void {
  state.currency = "£";
  state.rent = DEFAULT_RENT;
  state.catchall = DEFAULT_CATCHALL;
  state.catchallWeight = DEFAULT_CATCHALL_WEIGHT;
  state.rooms = DEFAULT_ROOMS.map((r) => ({ ...r }));
  state.people = DEFAULT_PEOPLE.map((p) => ({ ...p }));
  state.bills = DEFAULT_BILLS.map((b) => ({ ...b }));
  state.months = {};
  state.ledger = [];
  state.activePresetName = null;
}

export function serializeData(state: HouseholdState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  SNAPSHOT_FIELDS.forEach((k) => {
    out[k] = state[k];
  });
  out.presets = state.presets;
  out.activePresetName = state.activePresetName;
  out.currentMonth = state.currentMonth;
  out.sectionsOpen = state.sectionsOpen;
  return out;
}
