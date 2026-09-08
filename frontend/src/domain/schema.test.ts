import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { hydrate } from "./hydrate";
import { SCHEMA, unwrap } from "./schema";

describe("schema 5 cycle days", () => {
  test("schema 4 envelope hydrates to cycle day 1", () => {
    expect(SCHEMA).toBe(7);
    const envelope = {
      app: "rent-split",
      schema: 4,
      savedAt: "2026-04-01T00:00:00.000Z",
      data: {
        currency: "£",
        rent: 1000,
        catchall: 0,
        catchallWeight: 0,
        rooms: [{ id: "bed1", name: "Bed", w: 3, l: 3, weight: 1, communal: false }],
        people: [{ id: "p1", name: "Ann", isPayer: true, archived: false }],
        bills: [{ id: "energy", name: "Energy", est: 10, payers: null }],
        months: {},
        ledger: [],
      },
    };
    const migrated = unwrap(envelope);
    expect(migrated && "data" in migrated && migrated.migrated).toBe(true);
    const state = freshHousehold();
    const { outcome } = hydrate(state, envelope);
    expect(outcome).toBe(true);
    expect(state.rentCycleStartDay).toBe(1);
    expect(state.bills.every((b) => b.cycleStartDay === 1)).toBe(true);
    expect(state.tenancyStart).toBe("2026-08-09");
  });

  test("schema 6 calendar stints become period-relative on the tenancy month", () => {
    const envelope = {
      app: "rent-split",
      schema: 6,
      savedAt: "2026-08-10T00:00:00.000Z",
      data: {
        currency: "£",
        rent: 3500,
        tenancyStart: "2026-08-09",
        catchall: 0,
        catchallWeight: 0,
        rooms: [
          { id: "bed1", name: "Bed 1", w: 3, l: 3, weight: 1, communal: false },
          { id: "bed2", name: "Bed 2", w: 3, l: 3, weight: 1, communal: false },
        ],
        people: [
          { id: "p1", name: "Ann", isPayer: true, archived: false },
          { id: "p2", name: "Bob", isPayer: false, archived: false },
        ],
        bills: [{ id: "energy", name: "Energy", est: 10, payers: null, cycleStartDay: 1 }],
        months: {
          "2026-08": {
            key: "2026-08",
            rent: 3500,
            lines: { energy: { est: 10, act: null } },
            oneOffs: [{ id: "oo1", name: "Old one-off", est: 5, act: null, payers: null }],
            stints: [
              { id: "s1", personId: "p1", roomId: "bed1", from: 9, to: 31 },
              { id: "s2", personId: "p2", roomId: "bed2", from: 9, to: 31 },
            ],
            collected: false,
            charged: null,
            chargedAt: "",
            note: "",
            config: null,
          },
          "2026-09": {
            key: "2026-09",
            rent: 3500,
            lines: { energy: { est: 10, act: null } },
            oneOffs: [],
            stints: [
              { id: "s3", personId: "p1", roomId: "bed1", from: 1, to: 30 },
              { id: "s4", personId: "p2", roomId: "bed2", from: 1, to: 8 },
            ],
            collected: false,
            charged: null,
            chargedAt: "",
            note: "",
            config: null,
          },
        },
        ledger: [],
      },
    };
    const state = freshHousehold();
    const { outcome } = hydrate(state, envelope);
    expect(outcome).toBe(true);
    expect(state.months["2026-08"]?.oneOffs).toEqual([]);
    expect(state.months["2026-08"]?.stints).toEqual([
      expect.objectContaining({ personId: "p1", roomId: "bed1", from: 1, to: 31 }),
      expect.objectContaining({ personId: "p2", roomId: "bed2", from: 1, to: 31 }),
    ]);
    expect(state.months["2026-09"]?.stints).toEqual([
      expect.objectContaining({ personId: "p1", roomId: "bed1", from: 1, to: 30 }),
    ]);
  });
});
