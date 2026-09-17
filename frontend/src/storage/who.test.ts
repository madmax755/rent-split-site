import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  clearStoredWho,
  livePickerPeople,
  resolvePickerPeople,
  sessionFromPerson,
  sessionFromStored,
  writeStoredWho,
} from "./who";

const memory = new Map<string, string>();

beforeAll(() => {
  if (typeof globalThis.localStorage !== "undefined") return;
  const storage: Storage = {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
    },
    getItem(key) {
      return memory.get(key) ?? null;
    },
    key(index) {
      return [...memory.keys()][index] ?? null;
    },
    removeItem(key) {
      memory.delete(key);
    },
    setItem(key, value) {
      memory.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage });
});

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

  test("falls back when the household has no live people", () => {
    const archivedOnly = people.map((person) => ({ ...person, archived: true }));
    const fallback = [{ id: "p1", name: "Ach", isPayer: true, archived: false }];
    expect(resolvePickerPeople([], fallback).map((person) => person.name)).toEqual(["Ach"]);
    expect(resolvePickerPeople(archivedOnly, fallback).map((person) => person.name)).toEqual([
      "Ach",
    ]);
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
