import { describe, expect, test } from "bun:test";
import { togglePersonDay } from "./stint-edit";
import type { Stint } from "./types";

function stint(id: string, personId: string, roomId: string, from: number, to: number): Stint {
  return { id, personId, roomId, from, to };
}

function ids(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `n${n}`;
  };
}

describe("togglePersonDay", () => {
  test("a day in the middle of a stay splits it", () => {
    const next = togglePersonDay(
      [stint("s1", "p1", "bed1", 1, 10)],
      "p1",
      4,
      30,
      "bed2",
      () => "s2",
    );
    expect(next).toEqual([stint("s1", "p1", "bed1", 1, 3), stint("s2", "p1", "bed1", 5, 10)]);
  });

  test("the first and last day shrink the stay, and a one-day stay is removed", () => {
    const start = togglePersonDay([stint("s1", "p1", "bed1", 1, 10)], "p1", 1, 30, "bed1", ids());
    expect(start).toEqual([stint("s1", "p1", "bed1", 2, 10)]);
    const end = togglePersonDay(start, "p1", 10, 30, "bed1", ids());
    expect(end).toEqual([stint("s1", "p1", "bed1", 2, 9)]);
    const gone = togglePersonDay([stint("s1", "p1", "bed1", 5, 5)], "p1", 5, 30, "bed1", ids());
    expect(gone).toEqual([]);
  });

  test("other people are left alone", () => {
    const original = [stint("s1", "p1", "bed1", 1, 10), stint("s2", "p2", "bed2", 1, 10)];
    const next = togglePersonDay(original, "p1", 3, 30, "bed1", () => "s3");
    expect(next.filter((item) => item.personId === "p2")).toEqual([
      stint("s2", "p2", "bed2", 1, 10),
    ]);
  });

  test("turning a week off leaves the days before and after", () => {
    let stints = [stint("s1", "p1", "bed1", 1, 30)];
    const newId = ids();
    for (let day = 10; day <= 16; day++) {
      stints = togglePersonDay(stints, "p1", day, 30, "bed1", newId);
    }
    expect(stints).toEqual([stint("s1", "p1", "bed1", 1, 9), stint("n1", "p1", "bed1", 17, 30)]);
  });

  test("filling the gap joins a stay back together", () => {
    let stints = [stint("s1", "p1", "bed1", 1, 9), stint("s2", "p1", "bed1", 17, 30)];
    const newId = ids();
    for (let day = 10; day <= 16; day++) {
      stints = togglePersonDay(stints, "p1", day, 30, "bed2", newId);
    }
    expect(stints).toEqual([stint("s1", "p1", "bed1", 1, 30)]);
  });

  test("a gap between different bedrooms keeps the earlier room for that day", () => {
    const next = togglePersonDay(
      [stint("s1", "p1", "bed1", 1, 9), stint("s2", "p1", "bed2", 11, 20)],
      "p1",
      10,
      30,
      "bed3",
      ids(),
    );
    expect(next).toEqual([stint("s1", "p1", "bed1", 1, 10), stint("s2", "p1", "bed2", 11, 20)]);
  });

  test("a day beside a stay extends that stay", () => {
    const after = togglePersonDay([stint("s1", "p1", "bed1", 1, 5)], "p1", 6, 30, "bed2", ids());
    expect(after).toEqual([stint("s1", "p1", "bed1", 1, 6)]);
    const before = togglePersonDay([stint("s1", "p1", "bed1", 5, 10)], "p1", 4, 30, "bed2", ids());
    expect(before).toEqual([stint("s1", "p1", "bed1", 4, 10)]);
  });

  test("an isolated day uses the nearer bedroom, preferring the earlier stay on a tie", () => {
    const stays = [stint("s1", "p1", "bed1", 1, 5), stint("s2", "p1", "bed2", 20, 25)];
    const nearerStart = togglePersonDay(stays, "p1", 12, 30, "bed3", () => "n1");
    expect(nearerStart.at(-1)).toEqual(stint("n1", "p1", "bed1", 12, 12));
    const nearerEnd = togglePersonDay(stays, "p1", 13, 30, "bed3", () => "n2");
    expect(nearerEnd.at(-1)).toEqual(stint("n2", "p1", "bed2", 13, 13));
    const tie = togglePersonDay(
      [stint("s1", "p1", "bed1", 1, 10), stint("s2", "p1", "bed2", 14, 20)],
      "p1",
      12,
      30,
      "bed3",
      () => "n3",
    );
    expect(tie.at(-1)).toEqual(stint("n3", "p1", "bed1", 12, 12));
  });

  test("someone with no stay gets the fallback bedroom", () => {
    const next = togglePersonDay([], "p1", 3, 30, "bed2", () => "n1");
    expect(next).toEqual([stint("n1", "p1", "bed2", 3, 3)]);
  });

  test("days outside the period and the input list are left unchanged", () => {
    const original = [stint("s1", "p1", "bed1", 1, 10)];
    expect(togglePersonDay(original, "p1", 0, 30, "bed1", ids())).toEqual(original);
    expect(togglePersonDay(original, "p1", 31, 30, "bed1", ids())).toEqual(original);
    expect(original).toEqual([stint("s1", "p1", "bed1", 1, 10)]);
    togglePersonDay(original, "p1", 4, 30, "bed1", () => "s2");
    expect(original).toEqual([stint("s1", "p1", "bed1", 1, 10)]);
  });
});
