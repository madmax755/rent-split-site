import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { bedroomGaps, computeMonth } from "./engine";
import { ensureMonth, seedStints } from "./months";
import type { HouseholdState, Stint } from "./types";

function stint(id: string, personId: string, roomId: string, from: number, to: number): Stint {
  return { id, personId, roomId, from, to };
}

function blankMonthRecord(
  key: string,
  stints: Stint[],
  billIds: string[],
): HouseholdState["months"][string] {
  const lines: HouseholdState["months"][string]["lines"] = {};
  billIds.forEach((id) => {
    lines[id] = { est: 300, act: 300 };
  });
  return {
    key,
    rent: 3000,
    lines,
    oneOffs: [],
    stints,
    collected: false,
    charged: null,
    chargedAt: "",
    note: "",
    config: null,
  };
}

function twoPersonState(): HouseholdState {
  const state = freshHousehold();
  state.tenancyStart = "2026-04-01";
  state.currentMonth = "2026-04";
  state.rent = 3000;
  state.rentCycleStartDay = 1;
  state.catchall = 0;
  state.catchallWeight = 0;
  state.people = [
    { id: "p1", name: "Ann", isPayer: true, archived: false },
    { id: "p2", name: "Bob", isPayer: false, archived: false },
  ];
  state.rooms = [
    { id: "bed1", name: "Bed 1", w: 3, l: 3, weight: 1, communal: false },
    { id: "bed2", name: "Bed 2", w: 3, l: 3, weight: 1, communal: false },
  ];
  state.bills = [{ id: "energy", name: "Energy", est: 300, payers: null, cycleStartDay: 1 }];
  state.months = {
    "2026-04": blankMonthRecord(
      "2026-04",
      [stint("s1", "p1", "bed1", 1, 30), stint("s2", "p2", "bed2", 1, 30)],
      ["energy"],
    ),
  };
  return state;
}

describe("tenancy-month split maths", () => {
  test("a 1st-of-month tenancy matches the calendar month", () => {
    const state = twoPersonState();
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.rentCounts.periodLength).toBe(30);
    expect(c.rentCounts.periodLabel).toBe("Tenancy period 1st Apr to 30th Apr");
    expect(c.rentCounts.liableDays.p1).toBe(30);
    expect(c.rentCounts.liableDays.p2).toBe(30);
    expect(c.rentShare.p1).toBe(150000);
    expect(c.rentShare.p2).toBe(150000);
    const energy = c.lines.find((l) => l.id === "energy");
    expect(energy?.periodLength).toBe(30);
    expect(energy?.units.p1).toBe(30);
    expect(energy?.units.p2).toBe(30);
    expect(energy?.shares.p1).toBe(15000);
    expect(energy?.shares.p2).toBe(15000);
  });

  test("August tenancy uses the full rent and early September days", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.rent = 3500;
    state.currentMonth = "2026-08";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 1, 31), stint("s2", "p2", "bed2", 1, 31)],
        ["energy"],
      ),
    };
    state.months["2026-08"]!.rent = 3500;

    const aug = computeMonth(state, "2026-08", "eff");
    expect(aug.rentCounts.periodLabel).toBe("Tenancy period 9th Aug to 8th Sep");
    expect(aug.rentCounts.periodLength).toBe(31);
    expect(aug.rentPence).toBe(350000);
    expect(aug.counts.days[0]).toMatchObject({ key: "2026-08", d: 9 });
    expect(aug.counts.days[aug.counts.days.length - 1]).toMatchObject({ key: "2026-09", d: 8 });
    expect(aug.counts.liableDays.p1).toBe(31);
    expect(aug.counts.liableDays.p2).toBe(31);
    expect((aug.rentShare.p1 ?? 0) + (aug.rentShare.p2 ?? 0)).toBe(350000);
    expect(state.months["2026-09"]).toBeUndefined();
  });

  test("a short stint in early September is charged on the August tenancy month", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 1, 31), stint("s2", "p2", "bed2", 24, 31)],
        ["energy"],
      ),
    };
    const aug = computeMonth(state, "2026-08", "eff");
    expect(aug.counts.liableDays.p1).toBe(31);
    expect(aug.counts.liableDays.p2).toBe(8);
    const energy = aug.lines.find((l) => l.id === "energy");
    expect(energy?.units.p1).toBe(31);
    expect(energy?.units.p2).toBe(8);
    expect((energy?.shares.p1 ?? 0) + (energy?.shares.p2 ?? 0)).toBe(energy?.amount);
  });

  test("days before the tenancy starts are not empty-bedroom gaps", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 1, 31), stint("s2", "p2", "bed2", 1, 31)],
        ["energy"],
      ),
    };
    expect(bedroomGaps(state, "2026-08")).toEqual([]);
  });

  test("a stint covering the period end becomes a full next tenancy month", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 1, 31), stint("s2", "p2", "bed2", 1, 31)],
        ["energy"],
      ),
    };
    ensureMonth(state, "2026-09");
    const september = state.months["2026-09"];
    expect(september?.stints).toEqual([
      expect.objectContaining({ personId: "p1", roomId: "bed1", from: 1, to: 30 }),
      expect.objectContaining({ personId: "p2", roomId: "bed2", from: 1, to: 30 }),
    ]);
  });

  test("seeding the first tenancy month covers the whole period", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {};
    ensureMonth(state, "2026-08");
    seedStints(state, "2026-08", true);
    expect(state.months["2026-08"]?.stints.every((s) => s.from === 1 && s.to === 31)).toBe(true);
  });

  test("a stint that ends before the period does not seed into the next tenancy month", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 1, 31), stint("s2", "p2", "bed2", 1, 24)],
        ["energy"],
      ),
    };
    ensureMonth(state, "2026-09");
    const september = state.months["2026-09"]?.stints ?? [];
    expect(september).toEqual([
      expect.objectContaining({ personId: "p1", roomId: "bed1", from: 1, to: 30 }),
    ]);
    expect(september.some((s) => s.personId === "p2")).toBe(false);
  });
});
