import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BILLS,
  DEFAULT_CATCHALL,
  DEFAULT_PEOPLE,
  DEFAULT_RENT,
  DEFAULT_ROOMS,
  DEFAULT_SITE_TITLE,
  freshHousehold,
  freshTenancyStart,
} from "./defaults";

const FORBIDDEN_NAME_FRAGMENT =
  /\b(Alice|Max|Ach|Joe|TMS|Thomas\s+More|maxkendall)\b/i;

describe("fresh household seed", () => {
  test("uses generic people placeholders, not a named household", () => {
    expect(DEFAULT_PEOPLE.map((person) => person.name)).toEqual(["Person 1", "Person 2"]);
    expect(DEFAULT_PEOPLE.some((person) => person.isPayer)).toBe(true);
    for (const person of DEFAULT_PEOPLE) {
      expect(person.name).not.toMatch(FORBIDDEN_NAME_FRAGMENT);
    }
  });

  test("uses round generic rooms and zero money figures", () => {
    expect(DEFAULT_RENT).toBe(0);
    expect(DEFAULT_CATCHALL).toBe(0);
    expect(DEFAULT_ROOMS.every((room) => !FORBIDDEN_NAME_FRAGMENT.test(room.name))).toBe(true);
    expect(DEFAULT_ROOMS.some((room) => !room.communal)).toBe(true);
    expect(DEFAULT_BILLS.every((bill) => bill.est === 0)).toBe(true);
    expect(DEFAULT_SITE_TITLE).toBe("Rent Split");
  });

  test("freshHousehold starts on today's tenancy date with placeholder people", () => {
    const now = new Date(2026, 2, 15);
    const state = freshHousehold(now);
    expect(state.tenancyStart).toBe(freshTenancyStart(now));
    expect(state.tenancyStart).toBe("2026-03-15");
    expect(state.people.map((person) => person.name)).toEqual(["Person 1", "Person 2"]);
    expect(state.rent).toBe(0);
    expect(state.rooms[0]?.name).toBe("Bedroom 1");
  });
});
