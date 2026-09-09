import { describe, expect, test } from "bun:test";
import { freshHousehold } from "./defaults";
import { bedroomGaps, computeBalances, computeMonth, distribute, runChecks } from "./engine";
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

function sum(values: Record<string, number> | number[]): number {
  const list = Array.isArray(values) ? values : Object.values(values);
  return list.reduce((s, v) => s + v, 0);
}

function threePersonHouse(): HouseholdState {
  const state = twoPersonState();
  state.people.push({ id: "p3", name: "Vic", isPayer: false, archived: false });
  return state;
}

describe("penny distribution", () => {
  test("largest remainder assigns leftover pennies and still totals exactly", () => {
    const shares = distribute({ a: 1, b: 1, c: 1 }, 100);
    expect(sum(shares)).toBe(100);
    expect(shares.a).toBe(34);
    expect(shares.b).toBe(33);
    expect(shares.c).toBe(33);
  });

  test("zero and empty weights pay nothing", () => {
    expect(distribute({ a: 0, b: 0 }, 999)).toEqual({ a: 0, b: 0 });
    expect(distribute({ a: 2, b: 0 }, 0)).toEqual({ a: 0, b: 0 });
  });
});

describe("rent and bill split maths", () => {
  test("equal rooms and full-month stints split rent and bills in half", () => {
    const c = computeMonth(twoPersonState(), "2026-04", "eff");
    expect(c.rentPence).toBe(300000);
    expect(c.rentShare.p1).toBe(150000);
    expect(c.rentShare.p2).toBe(150000);
    expect(c.bedroom.p1).toBe(150000);
    expect(c.shared.p1).toBe(0);
    expect(sum(c.rentShare)).toBe(c.rentPence);
    expect(sum(c.totals)).toBe(c.grand);
    expect(runChecks(twoPersonState()).every((r) => r.ok)).toBe(true);
  });

  test("a 10-day roommate takes half the bedroom those days only, not by person-days", () => {
    const state = threePersonHouse();
    state.catchall = 0;
    state.months["2026-04"] = blankMonthRecord(
      "2026-04",
      [
        stint("s1", "p1", "bed1", 1, 30),
        stint("s2", "p2", "bed2", 1, 30),
        stint("s3", "p3", "bed1", 1, 10),
      ],
      ["energy"],
    );
    const c = computeMonth(state, "2026-04", "eff");
    // Each room is half of £3,000 → 5,000p/day. Shared 10 days → visitor 25,000p.
    expect(c.rentShare.p3).toBe(25000);
    expect(c.rentShare.p1).toBe(125000);
    expect(c.rentShare.p2).toBe(150000);
    expect(sum(c.rentShare)).toBe(300000);
    // Person-days would have charged the visitor 7.5 days (30k). Day-by-day is 5.
    expect(c.rentShare.p3).toBeLessThan(Math.round((10 / 40) * 300000));
  });

  test("bills split by person-days, with leftover pennies on the largest remainder", () => {
    const state = threePersonHouse();
    state.months["2026-04"] = blankMonthRecord(
      "2026-04",
      [
        stint("s1", "p1", "bed1", 1, 30),
        stint("s2", "p2", "bed2", 1, 30),
        stint("s3", "p3", "bed1", 1, 10),
      ],
      ["energy"],
    );
    const c = computeMonth(state, "2026-04", "eff");
    const energy = c.lines.find((l) => l.id === "energy");
    expect(energy?.amount).toBe(30000);
    expect(energy?.units).toEqual({ p1: 30, p2: 30, p3: 10 });
    // 30/70 × 30,000 = 12,857.14… ; 10/70 × 30,000 = 4,285.71… Vic gets the penny.
    expect(energy?.shares.p1).toBe(12857);
    expect(energy?.shares.p2).toBe(12857);
    expect(energy?.shares.p3).toBe(4286);
    expect(sum(energy?.shares ?? {})).toBe(30000);
  });

  test("restricted payers keep everyone else off that bill", () => {
    const state = twoPersonState();
    const energy = state.bills[0];
    if (energy) energy.payers = ["p1"];
    const c = computeMonth(state, "2026-04", "eff");
    const line = c.lines.find((l) => l.id === "energy");
    expect(line?.shares.p1).toBe(30000);
    expect(line?.shares.p2).toBe(0);
    expect(line?.how.p2).toBe("not a payer");
  });

  test("an empty bedroom's rent is spread across whoever is liable that day", () => {
    const state = twoPersonState();
    state.months["2026-04"] = blankMonthRecord(
      "2026-04",
      [stint("s1", "p1", "bed1", 1, 30)],
      ["energy"],
    );
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.rentShare.p1).toBe(300000);
    expect(c.warn).toEqual([]);
    expect(bedroomGaps(state, "2026-04").some((g) => g.roomId === "bed2")).toBe(true);
  });

  test("an empty third bedroom is split between everyone liable that day", () => {
    const state = twoPersonState();
    state.rooms.push({ id: "bed3", name: "Bed 3", w: 3, l: 3, weight: 1, communal: false });
    const c = computeMonth(state, "2026-04", "eff");
    // Three equal rooms, two occupants: each pays 1.5 rooms = £1,500.
    expect(c.rentShare.p1).toBe(150000);
    expect(c.rentShare.p2).toBe(150000);
    expect(sum(c.rentShare)).toBe(300000);
    expect(bedroomGaps(state, "2026-04").map((g) => g.roomId)).toEqual(["bed3"]);
  });

  test("one-off expenses on the month record are not split", () => {
    const state = twoPersonState();
    const month = state.months["2026-04"];
    if (month) {
      month.oneOffs = [{ id: "oo1", name: "Takeaway", est: 40, act: 40, payers: null }];
    }
    const c = computeMonth(state, "2026-04", "eff");
    expect(c.lines.some((l) => l.id === "oo1")).toBe(false);
    expect(c.grand).toBe(330000);
  });

  test("default rooms and a full August tenancy still reconcile to the penny", () => {
    const state = freshHousehold();
    state.tenancyStart = "2026-08-09";
    state.currentMonth = "2026-08";
    state.months = {};
    ensureMonth(state, "2026-08");
    seedStints(state, "2026-08", true);
    const c = computeMonth(state, "2026-08", "eff");
    expect(c.rentCounts.periodLength).toBe(31);
    expect(sum(c.rentShare)).toBe(c.rentPence);
    expect(sum(c.totals)).toBe(c.grand);
    c.lines.forEach((line) => {
      expect(sum(line.shares)).toBe(line.amount);
    });
    expect(runChecks(state).every((r) => r.ok)).toBe(true);
  });
});

describe("true-ups and settlements", () => {
  test("true-up is realised share minus what was locked, payer excluded", () => {
    const state = twoPersonState();
    const month = state.months["2026-04"];
    if (!month) throw new Error("missing month");
    month.collected = true;
    month.charged = computeMonth(state, "2026-04", "est").totals;
    month.lines.energy = { est: 300, act: 350 };
    const { bal, items } = computeBalances(state);
    // Energy +£50, Bob is half of person-days → +£25. Ann is the payer, skipped.
    expect(bal.p2).toBe(2500);
    expect(bal.p1).toBeUndefined();
    expect(items).toEqual([
      expect.objectContaining({
        type: "trueup",
        personId: "p2",
        amount: 2500,
        monthKey: "2026-04",
      }),
    ]);
  });

  test("a signed settlement reduces the running balance toward zero", () => {
    const state = twoPersonState();
    const month = state.months["2026-04"];
    if (!month) throw new Error("missing month");
    month.collected = true;
    month.charged = computeMonth(state, "2026-04", "est").totals;
    month.lines.energy = { est: 300, act: 350 };
    state.ledger = [
      {
        id: "lg1",
        personId: "p2",
        monthKey: "",
        type: "settle",
        amount: 2500,
        date: "2026-05-01",
        note: "Bob paid Ann",
      },
    ];
    const { bal } = computeBalances(state);
    expect(bal.p2).toBe(0);
  });

  test("refund settlements use a negative amount", () => {
    const state = twoPersonState();
    const month = state.months["2026-04"];
    if (!month) throw new Error("missing month");
    month.collected = true;
    month.charged = computeMonth(state, "2026-04", "est").totals;
    month.lines.energy = { est: 300, act: 250 };
    const before = computeBalances(state);
    expect(before.bal.p2).toBe(-2500);
    state.ledger = [
      {
        id: "lg1",
        personId: "p2",
        monthKey: "",
        type: "settle",
        amount: -2500,
        date: "2026-05-01",
        note: "Ann refunded Bob",
      },
    ];
    expect(computeBalances(state).bal.p2).toBe(0);
  });

  test("no true-up until the month is locked and at least one bill is realised", () => {
    const state = twoPersonState();
    const month = state.months["2026-04"];
    if (!month) throw new Error("missing month");
    month.lines.energy = { est: 300, act: 350 };
    expect(computeBalances(state).items).toEqual([]);
    month.collected = true;
    month.charged = { p1: 165000, p2: 165000 };
    month.lines.energy = { est: 300, act: null };
    expect(computeBalances(state).items).toEqual([]);
  });
});
