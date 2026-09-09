import { describe, expect, test } from "bun:test";
import {
  calendarRangeLabel,
  chargeableDayCount,
  clampCycleDay,
  firstChargeableDay,
  inclusivePeriodEnd,
  isoToPeriodDay,
  iteratePeriodDays,
  parseIsoDate,
  periodBounds,
  periodDayIso,
  periodLabel,
  tenancyMonthLabel,
  tenancyOwnerKey,
  tenancyPeriodLabel,
  tenancyPeriodLength,
} from "./dates";

describe("cycle day helpers", () => {
  test("clampCycleDay keeps 1–31", () => {
    expect(clampCycleDay(1)).toBe(1);
    expect(clampCycleDay(31)).toBe(31);
    expect(clampCycleDay(0)).toBe(1);
    expect(clampCycleDay(99)).toBe(31);
    expect(clampCycleDay(Number.NaN)).toBe(1);
  });

  test("day 1 is the calendar month", () => {
    const april = periodBounds("2026-04", 1);
    expect(april.startKey).toBe("2026-04");
    expect(april.startDay).toBe(1);
    expect(april.endKey).toBe("2026-05");
    expect(april.endDay).toBe(1);
    expect(april.length).toBe(30);
    expect(iteratePeriodDays(april)).toHaveLength(30);
    expect(periodLabel("2026-04", 1)).toBe("1 Apr – 30 Apr");
  });

  test("day 8 runs 8 Apr – 7 May", () => {
    const april = periodBounds("2026-04", 8);
    expect(april.startDay).toBe(8);
    expect(april.endDay).toBe(8);
    expect(april.length).toBe(30);
    const days = iteratePeriodDays(april);
    expect(days[0]).toEqual({ key: "2026-04", d: 8 });
    expect(days[days.length - 1]).toEqual({ key: "2026-05", d: 7 });
    expect(periodLabel("2026-04", 8)).toBe("8 Apr – 7 May");
  });

  test("cycle day 31 in January and February has no gap or overlap", () => {
    const jan = periodBounds("2026-01", 31);
    const feb = periodBounds("2026-02", 31);
    expect(jan.startDay).toBe(31);
    expect(jan.endDay).toBe(28);
    expect(jan.length).toBe(28);
    expect(inclusivePeriodEnd(jan)).toEqual({ key: "2026-02", day: 27 });
    expect(feb.startDay).toBe(28);
    expect(feb.endDay).toBe(31);
    expect(feb.length).toBe(31);
    const janDays = iteratePeriodDays(jan);
    const febDays = iteratePeriodDays(feb);
    expect(janDays[janDays.length - 1]).toEqual({ key: "2026-02", d: 27 });
    expect(febDays[0]).toEqual({ key: "2026-02", d: 28 });
    const seen = new Set(janDays.concat(febDays).map((d) => `${d.key}-${d.d}`));
    expect(seen.size).toBe(janDays.length + febDays.length);
  });
});

describe("tenancy start helpers", () => {
  test("parseIsoDate rejects impossible days", () => {
    expect(parseIsoDate("2026-08-09")).toEqual({ key: "2026-08", day: 9 });
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
  });

  test("first chargeable day is the tenancy start in that month only", () => {
    expect(firstChargeableDay("2026-08", "2026-08-09")).toBe(9);
    expect(firstChargeableDay("2026-09", "2026-08-09")).toBe(1);
    expect(firstChargeableDay("2026-07", "2026-08-09")).toBe(32);
    expect(chargeableDayCount("2026-08", "2026-08-09")).toBe(23);
    expect(chargeableDayCount("2026-09", "2026-08-09")).toBe(30);
    expect(calendarRangeLabel("2026-08", "2026-08-09")).toBe("9 Aug – 31 Aug");
  });

  test("tenancy August 2026 runs 9 Aug to 8 Sep", () => {
    expect(tenancyMonthLabel("2026-08")).toBe("Tenancy August 2026");
    expect(tenancyPeriodLabel("2026-08", "2026-08-09")).toBe("Tenancy period 9th Aug to 8th Sep");
    expect(tenancyPeriodLength("2026-08", "2026-08-09")).toBe(31);
    expect(tenancyPeriodLength("2026-09", "2026-08-09")).toBe(30);
    expect(tenancyOwnerKey("2026-08", 9, "2026-08-09")).toBe("2026-08");
    expect(tenancyOwnerKey("2026-09", 8, "2026-08-09")).toBe("2026-08");
    expect(tenancyOwnerKey("2026-09", 9, "2026-08-09")).toBe("2026-09");
    expect(periodDayIso("2026-08", "2026-08-09", 1)).toBe("2026-08-09");
    expect(periodDayIso("2026-08", "2026-08-09", 31)).toBe("2026-09-08");
    expect(isoToPeriodDay("2026-08", "2026-08-09", "2026-09-08")).toBe(31);
  });
});
