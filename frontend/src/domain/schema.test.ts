import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { hydrate } from "./hydrate";
import { SCHEMA, unwrap } from "./schema";

describe("schema 5 cycle days", () => {
  test("schema 4 envelope hydrates to cycle day 1", () => {
    expect(SCHEMA).toBe(5);
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
  });
});
