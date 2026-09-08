import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { allocateCalendarRent, bedroomGaps, computeMonth } from "./engine";
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

describe("calendar-month split maths", () => {
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

  test("payment cycle does not pull in next month's stints", () => {
    const state = twoPersonState();
    state.rentCycleStartDay = 8;
    state.bills[0]!.cycleStartDay = 15;
    state.months["2026-04"]!.stints = [stint("s1", "p1", "bed1", 1, 30)];
    state.months["2026-05"] = blankMonthRecord(
      "2026-05",
      [stint("s3", "p1", "bed1", 1, 7), stint("s4", "p2", "bed2", 1, 7)],
      ["energy"],
    );
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.rentCounts.periodLabel).toBe("1 Apr – 30 Apr");
    expect(c.rentCounts.liableDays.p1).toBe(30);
    expect(c.rentCounts.liableDays.p2).toBe(0);
    const energy = c.lines.find((l) => l.id === "energy");
    expect(energy?.units.p1).toBe(30);
    expect(energy?.units.p2).toBe(0);
    expect(c.rentShare.p1).toBe(c.rentPence);
    expect(c.rentShare.p2 ?? 0).toBe(0);
  });

  test("missing next month is irrelevant to this month's rent", () => {
    const state = twoPersonState();
    state.rentCycleStartDay = 8;
    state.months["2026-04"]!.stints = [stint("s1", "p1", "bed1", 1, 30)];
    const c = computeMonth(state, "2026-04", "eff");
    expect(state.months["2026-05"]).toBeUndefined();
    expect(c.rentCounts.liableDays.p1).toBe(30);
    expect(c.rentCounts.liableDays.p2).toBe(0);
    expect(c.rentShare.p1).toBe(c.rentPence);
  });
});

describe("tenancy start pro rata", () => {
  test("9 August prorates August and carries the leftover into September", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.rent = 3500;
    state.currentMonth = "2026-08";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 9, 31), stint("s2", "p2", "bed2", 9, 31)],
        ["energy"],
      ),
      "2026-09": blankMonthRecord(
        "2026-09",
        [stint("s3", "p1", "bed1", 1, 30), stint("s4", "p2", "bed2", 1, 30)],
        ["energy"],
      ),
    };
    state.months["2026-08"]!.rent = 3500;
    state.months["2026-09"]!.rent = 3500;

    const aug = allocateCalendarRent(state, "2026-08");
    expect(aug.calendarDays).toBe(31);
    expect(aug.chargeableDays).toBe(23);
    expect(aug.agreedPence).toBe(350000);
    expect(aug.chargedPence + aug.carryOutPence).toBe(350000);
    expect(aug.carryInPence).toBe(0);
    expect(aug.chargedPence).toBe(Math.round((350000 * 23) / 31));

    const sep = allocateCalendarRent(state, "2026-09");
    expect(sep.carryInPence).toBe(aug.carryOutPence);
    expect(sep.chargedPence).toBe(350000 + aug.carryOutPence);
    expect(sep.carryOutPence).toBe(0);

    const augMonth = computeMonth(state, "2026-08", "eff");
    expect(augMonth.rentPence).toBe(aug.chargedPence);
    expect(augMonth.counts.days[0]?.d).toBe(9);
    expect(augMonth.counts.liableDays.p1).toBe(23);
    expect((augMonth.rentShare.p1 ?? 0) + (augMonth.rentShare.p2 ?? 0)).toBe(augMonth.rentPence);

    const sepMonth = computeMonth(state, "2026-09", "eff");
    expect(sepMonth.rentPence).toBe(sep.chargedPence);
    expect(sepMonth.counts.days[0]?.d).toBe(1);
    expect(sepMonth.counts.liableDays.p1).toBe(30);
    expect((sepMonth.rentShare.p1 ?? 0) + (sepMonth.rentShare.p2 ?? 0)).toBe(sepMonth.rentPence);
  });

  test("days before the tenancy starts are not empty-bedroom gaps", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 9, 31), stint("s2", "p2", "bed2", 9, 31)],
        ["energy"],
      ),
    };
    expect(bedroomGaps(state, "2026-08")).toEqual([]);
  });

  test("a stint covering the first month end becomes a full calendar month next month", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {
      "2026-08": blankMonthRecord(
        "2026-08",
        [stint("s1", "p1", "bed1", 9, 31), stint("s2", "p2", "bed2", 9, 31)],
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

  test("seeding the first month starts on the tenancy start day", () => {
    const state = twoPersonState();
    state.tenancyStart = "2026-08-09";
    state.months = {};
    ensureMonth(state, "2026-08");
    seedStints(state, "2026-08", true);
    expect(state.months["2026-08"]?.stints.every((s) => s.from === 9 && s.to === 31)).toBe(true);
  });
});
