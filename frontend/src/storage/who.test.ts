import { afterEach, describe, expect, test } from "bun:test";
import {
  clearStoredWho,
  livePickerPeople,
  sessionFromPerson,
  sessionFromStored,
  writeStoredWho,
} from "./who";

const people = [
  { id: "p1", name: "Ach", isPayer: true, archived: false },
  { id: "p2", name: "Joe", isPayer: false, archived: false },
  { id: "p4", name: "Max", isPayer: false, archived: false },
  { id: "p3", name: "Alice", isPayer: false, archived: true },
];

afterEach(() => {
  clearStoredWho();
});

describe("who", () => {
  test("payer is household admin", () => {
    expect(sessionFromPerson(people[0]!)).toEqual({
      personId: "p1",
      personName: "Ach",
      role: "admin",
    });
  });

  test("everyone else is a tenant", () => {
    expect(sessionFromPerson(people[1]!).role).toBe("tenant");
    expect(sessionFromPerson(people[2]!).personName).toBe("Max");
  });

  test("hides archived people from the picker", () => {
    expect(livePickerPeople(people).map((person) => person.name)).toEqual(["Ach", "Joe", "Max"]);
  });

  test("restores a stored live person", () => {
    writeStoredWho("p2");
    expect(sessionFromStored(people)?.personName).toBe("Joe");
    clearStoredWho();
    expect(sessionFromStored(people)).toBeNull();
  });

  test("ignores a stored archived person", () => {
    writeStoredWho("p3");
    expect(sessionFromStored(people)).toBeNull();
  });
});
