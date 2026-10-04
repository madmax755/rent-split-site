import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { hydrate, serializeEnvelope } from "./hydrate";
import { ensureMonth } from "./months";
import { normalise } from "./normalise";
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
    expect(state.tenancyStart).toBe("2000-01-01");
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

  test("month-end calendar stints spill into an empty next month shell", () => {
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
        rooms: [{ id: "bed1", name: "Bed 1", w: 3, l: 3, weight: 1, communal: false }],
        people: [{ id: "p1", name: "Ann", isPayer: true, archived: false }],
        bills: [{ id: "energy", name: "Energy", est: 10, payers: null, cycleStartDay: 1 }],
        months: {
          "2026-08": {
            key: "2026-08",
            rent: 3500,
            lines: { energy: { est: 10, act: null } },
            oneOffs: [],
            stints: [{ id: "s1", personId: "p1", roomId: "bed1", from: 9, to: 31 }],
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
            stints: [],
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
    expect(hydrate(state, envelope).outcome).toBe(true);
    expect(state.months["2026-08"]?.stints).toEqual([
      expect.objectContaining({ personId: "p1", roomId: "bed1", from: 1, to: 31 }),
    ]);
  });

  test("a calendar stint that lands in two tenancy months gets a distinct id in each", () => {
    const month = (key: string, stints: Array<Record<string, unknown>>) => ({
      key,
      rent: 3500,
      lines: { energy: { est: 10, act: null } },
      oneOffs: [],
      stints,
      collected: false,
      charged: null,
      chargedAt: "",
      note: "",
      config: null,
    });
    const envelope = {
      app: "rent-split",
      schema: 6,
      savedAt: "2026-10-03T00:00:00.000Z",
      data: {
        currency: "£",
        rent: 3500,
        tenancyStart: "2026-08-09",
        catchall: 0,
        catchallWeight: 0,
        rooms: [{ id: "bed1", name: "Bed 1", w: 3, l: 3, weight: 1, communal: false }],
        people: [{ id: "p1", name: "Ann", isPayer: true, archived: false }],
        bills: [{ id: "energy", name: "Energy", est: 10, payers: null, cycleStartDay: 1 }],
        months: {
          "2026-08": month("2026-08", [{ id: "aug", personId: "p1", roomId: "bed1", from: 24, to: 31 }]),
          "2026-09": month("2026-09", [{ id: "sep", personId: "p1", roomId: "bed1", from: 1, to: 25 }]),
          "2026-10": month("2026-10", [{ id: "oct", personId: "p1", roomId: "bed1", from: 1, to: 31 }]),
        },
        ledger: [],
      },
    };
    const state = freshHousehold();
    expect(hydrate(state, envelope).outcome).toBe(true);
    const all = Object.values(state.months).flatMap((m) => m.stints.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    const september = state.months["2026-09"]?.stints ?? [];
    expect(september.map((s) => [s.from, s.to])).toEqual([
      [1, 17],
      [23, 30],
    ]);
  });

  test("an upgraded household loads again without being converted twice", () => {
    const state = freshHousehold();
    state.tenancyStart = "2026-08-09";
    ensureMonth(state, "2026-09").stints = [
      { id: "s1", personId: state.people[0]?.id ?? "p1", roomId: "bed1", from: 1, to: 25 },
    ];
    const saved = JSON.parse(JSON.stringify(serializeEnvelope(state))) as unknown;
    const again = freshHousehold();
    const result = hydrate(again, saved);
    expect(result.changed).toBe(false);
    expect(again.months["2026-09"]?.stints).toEqual([
      expect.objectContaining({ id: "s1", from: 1, to: 25 }),
    ]);
  });

  test("normalise gives a duplicated stint id a fresh one", () => {
    const state = freshHousehold();
    const personId = state.people[0]?.id ?? "p1";
    const key = state.currentMonth;
    ensureMonth(state, key).stints = [
      { id: "dup", personId, roomId: "bed1", from: 1, to: 5 },
      { id: "dup", personId, roomId: "bed1", from: 8, to: 9 },
    ];
    normalise(state);
    const ids = state.months[key]?.stints.map((s) => s.id) ?? [];
    expect(ids[0]).toBe("dup");
    expect(ids[1]).not.toBe("dup");
  });

  test("hydrate leaves the viewing month alone", () => {
    const state = freshHousehold();
    state.currentMonth = "2026-09";
    const envelope = {
      app: "rent-split",
      schema: SCHEMA,
      savedAt: "2026-09-01T00:00:00.000Z",
      data: {
        currency: "£",
        rent: 1000,
        tenancyStart: "2026-08-09",
        catchall: 0,
        catchallWeight: 0,
        rooms: [{ id: "bed1", name: "Bed", w: 3, l: 3, weight: 1, communal: false }],
        people: [{ id: "p1", name: "Ann", isPayer: true, archived: false }],
        bills: [{ id: "energy", name: "Energy", est: 10, payers: null, cycleStartDay: 1 }],
        months: {},
        ledger: [],
        currentMonth: "2026-08",
      },
    };
    expect(hydrate(state, envelope).outcome).toBe(true);
    expect(state.currentMonth).toBe("2026-09");
  });
});
