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
  { id: "p1", name: "Ann", isPayer: true, archived: false },
  { id: "p2", name: "Bob", isPayer: false, archived: false },
  { id: "p4", name: "Cara", isPayer: false, archived: false },
  { id: "p3", name: "Dee", isPayer: false, archived: true },
];

afterEach(() => {
  clearStoredWho();
});

describe("who", () => {
  test("payer is household admin", () => {
    expect(sessionFromPerson(people[0]!)).toEqual({
      personId: "p1",
      personName: "Ann",
      role: "admin",
    });
  });

  test("everyone else is a tenant", () => {
    expect(sessionFromPerson(people[1]!).role).toBe("tenant");
    expect(sessionFromPerson(people[2]!).personName).toBe("Cara");
  });

  test("hides archived people from the picker", () => {
    expect(livePickerPeople(people).map((person) => person.name)).toEqual(["Ann", "Bob", "Cara"]);
  });

  test("falls back when the household has no live people", () => {
    const archivedOnly = people.map((person) => ({ ...person, archived: true }));
    const fallback = [{ id: "p1", name: "Ann", isPayer: true, archived: false }];
    expect(resolvePickerPeople([], fallback).map((person) => person.name)).toEqual(["Ann"]);
    expect(resolvePickerPeople(archivedOnly, fallback).map((person) => person.name)).toEqual([
      "Ann",
    ]);
  });

  test("restores a stored live person", () => {
    writeStoredWho("p2");
    expect(sessionFromStored(people)?.personName).toBe("Bob");
    clearStoredWho();
    expect(sessionFromStored(people)).toBeNull();
  });
});
