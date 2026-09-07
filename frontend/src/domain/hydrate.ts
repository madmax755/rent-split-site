import { deep } from "./clone";
import { todayKey } from "./dates";
import { addMonths } from "./dates";
import { ensureMonth } from "./months";
import { normalise } from "./normalise";
import { APP_ID, SCHEMA, unwrap } from "./schema";
import { SNAPSHOT_FIELDS, type DataEnvelope, type HouseholdState, type Snapshot } from "./types";
import { V1_ROOM_NAMES, V1_ROOM_RENAMES } from "./defaults";
import { serializeData } from "./snapshot";

export type HydrateOutcome = true | false | "tooNew";

export function serializeEnvelope(state: HouseholdState): DataEnvelope {
  return { app: APP_ID, schema: SCHEMA, savedAt: new Date().toISOString(), data: serializeData(state) };
}

export function hydrate(
  state: HouseholdState,
  o: unknown,
  migrateFromV1: (raw: Record<string, unknown>) => string[],
): { outcome: HydrateOutcome; loadNote: string; changed: boolean } {
  const r = unwrap(o);
  let loadNote = "";
  let lastHydrateChanged = false;
  if (!r) return { outcome: false, loadNote, changed: false };
  if ("tooNew" in r && r.tooNew) {
    loadNote = `This data was saved by a newer version of the app (format ${r.schema}; this build reads ${SCHEMA}). Nothing was loaded and nothing has been overwritten — update the page, or restore from an export.`;
    return { outcome: "tooNew", loadNote, changed: false };
  }
  if ("v1" in r && r.v1) {
    migrateFromV1(r.v1);
    return { outcome: true, loadNote, changed: true };
  }
  if (!("data" in r)) return { outcome: false, loadNote, changed: false };
  const d = r.data;
  SNAPSHOT_FIELDS.forEach((k) => {
    if (d[k] !== undefined) (state[k] as Snapshot[typeof k]) = deep(d[k]) as never;
  });
  if (Array.isArray(d.presets)) state.presets = d.presets as HouseholdState["presets"];
  if (d.activePresetName) state.activePresetName = d.activePresetName as string;
  if (typeof d.currentMonth === "string") state.currentMonth = d.currentMonth;
  if (d.sectionsOpen && typeof d.sectionsOpen === "object") {
    state.sectionsOpen = { ...state.sectionsOpen, ...(d.sectionsOpen as Record<string, boolean>) };
  }
  normalise(state);
  lastHydrateChanged = !!r.migrated;
  return { outcome: true, loadNote, changed: lastHydrateChanged };
}

type V1Bill = {
  id?: string;
  name?: string;
  mode?: string;
  flat?: number;
  headcount?: number[];
};

type V1Room = {
  id?: string;
  name?: string;
  w?: number;
  l?: number;
  weight?: number;
  communal?: boolean;
  assigned?: boolean[];
};

type V1Preset = { name?: string; snapshot?: unknown };

export function migrateFromV1(state: HouseholdState, o: Record<string, unknown>): string[] {
  const notes: string[] = [];

  if (typeof o.rent === "number") state.rent = o.rent;
  if (typeof o.catchall === "number") state.catchall = o.catchall;
  if (typeof o.catchallWeight === "number") state.catchallWeight = o.catchallWeight;
  if (typeof o.currency === "string") state.currency = o.currency;

  if (Array.isArray(o.rooms) && o.rooms.length) {
    state.rooms = (o.rooms as V1Room[]).map((r) => {
      const id = V1_ROOM_RENAMES[r.id ?? ""] || r.id || "";
      return {
        id,
        name: V1_ROOM_NAMES[id] || r.name || id,
        w: +r.w! || 0,
        l: +r.l! || 0,
        weight: typeof r.weight === "number" ? r.weight : 1,
        communal: !!r.communal,
      };
    });
    notes.push(`${state.rooms.length} rooms`);
  }

  const names = Array.isArray(o.people) ? (o.people as string[]) : [];
  const assignedRoom = (idx: number): string => {
    const rooms = Array.isArray(o.rooms) ? (o.rooms as V1Room[]) : [];
    const room = rooms.find((r) => !r.communal && Array.isArray(r.assigned) && r.assigned[idx]);
    if (!room) return state.rooms.find((r) => !r.communal)?.id || "bed1";
    return V1_ROOM_RENAMES[room.id ?? ""] || room.id || "bed1";
  };
  const migrated: Array<{ id: string; name: string; isPayer: boolean; archived: boolean; _room: string }> = [];
  names.forEach((nm, i) => {
    if (!nm || !nm.trim()) return;
    migrated.push({
      id: `p${i + 1}`,
      name: nm.trim(),
      isPayer: false,
      archived: false,
      _room: assignedRoom(i),
    });
  });
  if (migrated.length) {
    state.people = migrated.map(({ _room: _, ...p }) => p);
    const payerPerson = migrated.find((p) => /^(ach|arch|achyut)/i.test(p.name)) || migrated[0];
    if (payerPerson) {
      const live = state.people.find((p) => p.id === payerPerson.id);
      if (live) live.isPayer = true;
    }
    notes.push(`${migrated.length} people`);
  }

  const seedRooms: Record<string, string> = {};
  migrated.forEach((p) => {
    if (p._room) seedRooms[p.id] = p._room;
  });
  state._seedRooms = seedRooms;

  if (Array.isArray(o.bills) && o.bills.length) {
    const headcount = Math.max(1, Math.min(state.people.length, 5));
    const monthlyOf = (b: V1Bill | undefined): number => {
      if (!b) return 0;
      if (b.mode === "flat") return +b.flat! || 0;
      const arr = Array.isArray(b.headcount) ? b.headcount : [];
      return +arr[headcount - 1]! || +b.flat! || 0;
    };
    const find = (id: string) => (o.bills as V1Bill[]).find((b) => b.id === id);
    const gas = find("gas");
    const electric = find("electric");
    const bills: HouseholdState["bills"] = [];
    if (gas || electric) {
      bills.push({
        id: "energy",
        name: "Energy (gas & electric)",
        est: Math.round((monthlyOf(gas) + monthlyOf(electric)) * 100) / 100,
        payers: null,
      });
      notes.push("gas + electric merged into Energy");
    }
    (o.bills as V1Bill[]).forEach((b) => {
      if (b.id === "gas" || b.id === "electric") return;
      bills.push({ id: b.id ?? "", name: b.name || b.id || "", est: monthlyOf(b), payers: null });
    });
    bills.push({ id: "insurance", name: "Renters insurance", est: 15, payers: null });
    notes.push("renters insurance added");
    if (typeof o.councilTax === "number") {
      bills.push({ id: "counciltax", name: "Council tax", est: o.councilTax, payers: null });
    }
    state.bills = bills;
  }

  if (Array.isArray(o.presets)) {
    state.presets = (o.presets as V1Preset[]).map((p) => ({
      name: p.name || "Untitled",
      snapshot: null,
      legacy: p.snapshot || null,
    }));
  }

  let from = typeof o.windowFrom === "string" ? o.windowFrom.slice(0, 7) : "";
  let to = typeof o.windowTo === "string" ? o.windowTo.slice(0, 7) : "";
  const here = todayKey();
  if (!/^\d{4}-\d{2}$/.test(from)) from = here;
  if (!/^\d{4}-\d{2}$/.test(to)) to = here;
  if (from > here) from = here;
  if (to < here) to = here;
  let k = from;
  let guard = 0;
  while (k <= to && guard++ < 60) {
    ensureMonth(state, k);
    k = addMonths(k, 1);
  }
  state.currentMonth = here;
  ensureMonth(state, here);

  normalise(state);
  return notes;
}
