import type { HouseholdState } from "./types";

export const APP_ID = "rent-split" as const;
export const SCHEMA = 4;
export const STORAGE_KEY = "rent-split";
export const BACKUP_KEY = "rent-split.previous";
export const LEGACY_KEYS = ["rent-split-v2"];
export const V1_KEYS = ["rent-split-apple-v1", "rent-split-thomas-more-v5"];

type MigrationFn = (d: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, MigrationFn> = {
  3: function (d) {
    const people = Array.isArray(d.people) ? d.people : [];
    people.forEach((p) => {
      if (p && typeof p === "object") {
        const rec = p as Record<string, unknown>;
        delete rec.role;
        delete rec.awayBasis;
        delete rec.fixedBasis;
        delete rec.moveIn;
        delete rec.moveOut;
        delete rec.roomId;
      }
    });
    const bills = Array.isArray(d.bills) ? d.bills : [];
    bills.forEach((b) => {
      if (b && typeof b === "object") delete (b as Record<string, unknown>).kind;
    });
    const months = d.months && typeof d.months === "object" ? (d.months as Record<string, unknown>) : {};
    Object.values(months).forEach((M) => {
      if (!M || typeof M !== "object") return;
      const rec = M as Record<string, unknown>;
      const stints = Array.isArray(rec.stints) ? rec.stints : [];
      stints.forEach((st) => {
        if (st && typeof st === "object") delete (st as Record<string, unknown>).here;
      });
      const oneOffs = Array.isArray(rec.oneOffs) ? rec.oneOffs : [];
      oneOffs.forEach((x) => {
        if (x && typeof x === "object") delete (x as Record<string, unknown>).kind;
      });
    });
    return d;
  },
  2: function (d) {
    const map: Record<string, string> = { prorated: "all", full: "all", exempt: "visitor" };
    const people = Array.isArray(d.people) ? d.people : [];
    people.forEach((p) => {
      if (!p || typeof p !== "object") return;
      const rec = p as Record<string, unknown>;
      if (rec.awayBasis === undefined) {
        const fb = typeof rec.fixedBasis === "string" ? rec.fixedBasis : "";
        rec.awayBasis = map[fb] || "all";
      }
      delete rec.fixedBasis;
    });
    const names: Record<string, string> = {
      bed1: "Master Bedroom",
      bed2: "2nd Bedroom",
      bed3: "3rd Bedroom",
    };
    const rooms = Array.isArray(d.rooms) ? d.rooms : [];
    rooms.forEach((r) => {
      if (!r || typeof r !== "object") return;
      const rec = r as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : "";
      if (names[id]) rec.name = names[id];
    });
    return d;
  },
};

export type UnwrapResult =
  | { tooNew: true; schema: number }
  | { v1: Record<string, unknown> }
  | { data: Record<string, unknown>; schema: number; migrated: boolean }
  | null;

export function unwrap(o: unknown): UnwrapResult {
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  let schema: number;
  let data: Record<string, unknown>;
  if (rec.app === APP_ID && typeof rec.schema === "number") {
    schema = rec.schema;
    data = (rec.data && typeof rec.data === "object" ? rec.data : {}) as Record<string, unknown>;
  } else if (rec.months || (rec.v === 2 && rec.people)) {
    schema = 2;
    data = rec;
  } else if (rec.people || rec.rooms) {
    return { v1: rec };
  } else {
    return null;
  }
  if (schema > SCHEMA) return { tooNew: true, schema };
  const fromSchema = schema;
  while (schema < SCHEMA) {
    const step = MIGRATIONS[schema];
    if (step) {
      try {
        data = step(data) || data;
      } catch {
        /* keep going */
      }
    }
    schema += 1;
  }
  return { data, schema, migrated: schema !== fromSchema };
}
