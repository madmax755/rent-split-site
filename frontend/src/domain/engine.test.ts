import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { computeMonth } from "./engine";
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

describe("period split maths", () => {
  test("day 1 matches calendar-month shares", () => {
    const state = twoPersonState();
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.rentCounts.periodLength).toBe(30);
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
    expect(state.months["2026-05"]).toBeUndefined();
  });

  test("day 8 rent vs day 1 bills uses different occupancy windows", () => {
    const state = twoPersonState();
    state.rentCycleStartDay = 8;
    state.bills[0]!.cycleStartDay = 1;
    state.months["2026-04"]!.stints = [stint("s1", "p1", "bed1", 1, 30)];
    state.months["2026-05"] = blankMonthRecord(
      "2026-05",
      [stint("s3", "p1", "bed1", 1, 7), stint("s4", "p2", "bed2", 1, 7)],
      ["energy"],
    );
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.rentCounts.periodLabel).toBe("8 Apr – 7 May");
    expect(c.rentCounts.liableDays.p1).toBe(30);
    expect(c.rentCounts.liableDays.p2).toBe(7);
    const energy = c.lines.find((l) => l.id === "energy");
    expect(energy?.periodLabel).toBe("1 Apr – 30 Apr");
    expect(energy?.units.p1).toBe(30);
    expect(energy?.units.p2).toBe(0);
    expect(c.rentShare.p1).toBeGreaterThan(c.rentShare.p2 ?? 0);
    expect((c.rentShare.p1 ?? 0) + (c.rentShare.p2 ?? 0)).toBe(c.rentPence);
  });

  test("missing next month projects this month's stints", () => {
    const state = twoPersonState();
    state.rentCycleStartDay = 8;
    state.months["2026-04"]!.stints = [stint("s1", "p1", "bed1", 1, 30)];
    const c = computeMonth(state, "2026-04", "eff");
    expect(state.months["2026-05"]).toBeUndefined();
    expect(c.rentCounts.liableDays.p1).toBe(30);
    expect(c.rentCounts.liableDays.p2).toBe(0);
    expect(c.rentShare.p1).toBe(c.rentPence);
  });

  test("existing next month wins over projection, even when empty", () => {
    const state = twoPersonState();
    state.rentCycleStartDay = 8;
    state.months["2026-04"]!.stints = [stint("s1", "p1", "bed1", 1, 30)];
    state.months["2026-05"] = blankMonthRecord("2026-05", [], ["energy"]);
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.rentCounts.liableDays.p1).toBe(23);
    expect(c.rentShare.p1).toBe(c.rentPence);
  });
});
