import { LS } from "./browser-storage";
import type { PickerPerson, SessionInfo } from "../lib/api-types";

export const WHO_KEY = "rent-split.who";

type StoredWho = {
  personId: string;
};

function isStoredWho(value: unknown): value is StoredWho {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { personId?: unknown }).personId === "string"
  );
}

export function sessionFromPerson(person: PickerPerson): SessionInfo {
  return {
    personId: person.id,
    personName: person.name,
    role: person.isPayer ? "admin" : "tenant",
  };
}

export function readStoredWho(): string | null {
  const raw = LS.get(WHO_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredWho(parsed) ? parsed.personId : null;
  } catch {
    return null;
  }
}

export function writeStoredWho(personId: string): void {
  const stored: StoredWho = { personId };
  LS.set(WHO_KEY, JSON.stringify(stored));
}

export function clearStoredWho(): void {
  LS.remove(WHO_KEY);
}

export function sessionFromStored(people: PickerPerson[]): SessionInfo | null {
  const personId = readStoredWho();
  if (!personId) return null;
  const person = people.find((row) => row.id === personId && !row.archived);
  return person ? sessionFromPerson(person) : null;
}

export function livePickerPeople(people: PickerPerson[]): PickerPerson[] {
  return people.filter((person) => !person.archived);
}
