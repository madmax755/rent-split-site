import { describe, expect, test } from "bun:test";
import { serializeEnvelope } from "../domain/hydrate";
import { ensureMonth } from "../domain/months";
import { SCHEMA } from "../domain/schema";
import { togglePersonDay } from "../domain/stint-edit";
import type { DataEnvelope, Stint } from "../domain/types";
import type { StorageAdapter } from "../storage/adapters";
import { HouseholdStore } from "./household-store";

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A shared server whose writes only land when the test lets them. */
class SlowServer {
  document: DataEnvelope;
  rev = 1;
  gates: Deferred[] = [];
  sentStints: Stint[][] = [];

  constructor(document: DataEnvelope) {
    this.document = document;
  }

  releaseNext(): void {
    this.gates.shift()?.resolve();
  }

  adapter(): StorageAdapter {
    let known: number | null = this.rev;
    return {
      name: "server",
      shared: true,
      autoPush: true,
      load: async () => {
        known = this.rev;
        return structuredClone(this.document);
      },
      save: async (data) => {
        const gate = deferred();
        this.gates.push(gate);
        const snapshot = structuredClone(data);
        await gate.promise;
        this.document = snapshot;
        this.rev += 1;
        known = this.rev;
      },
      saveMyStints: async (monthKey, personId, stints) => {
        const gate = deferred();
        this.gates.push(gate);
        const sent = structuredClone(stints);
        this.sentStints.push(sent);
        await gate.promise;
        const months = this.document.data.months as Record<string, { stints: Stint[] }>;
        const month = months[monthKey];
        if (month) {
          month.stints = [...month.stints.filter((s) => s.personId !== personId), ...sent];
        }
        this.rev += 1;
        known = this.rev;
      },
      knownRev: () => known,
      setKnownRev: (next) => {
        known = next;
      },
      describe: () => "test",
    };
  }
}

function personDays(store: HouseholdStore, personId: string): number[] {
  const month = store.state.months[store.state.currentMonth];
  const days = new Set<number>();
  for (const stint of month?.stints ?? []) {
    if (stint.personId !== personId) continue;
    for (let day = stint.from; day <= stint.to; day++) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

function setUp(role: "admin" | "tenant"): { store: HouseholdStore; server: SlowServer; personId: string } {
  const store = new HouseholdStore();
  const key = store.state.currentMonth;
  const month = ensureMonth(store.state, key);
  const personId = role === "tenant" ? "p2" : "p1";
  month.stints = [{ id: "st1", personId, roomId: "bed1", from: 1, to: 20 }];
  const server = new SlowServer(serializeEnvelope(store.state));
  store.adapter = server.adapter();
  store.session = { personId, personName: "Test", role };
  return { store, server, personId };
}

function tapOff(store: HouseholdStore, personId: string, day: number, tenant: boolean): void {
  store.mutate(
    () => {
      const month = ensureMonth(store.state, store.state.currentMonth);
      month.stints = togglePersonDay(month.stints, personId, day, 30, "bed1", () => `st${day}x`);
    },
    { persist: !tenant },
  );
  if (tenant) store.queueOwnStintsSave();
}

async function tick(): Promise<void> {
  await new Promise((done) => setTimeout(done, 0));
}

describe("old-format households", () => {
  test("a tenant who loads one writes the upgraded copy back", async () => {
    const store = new HouseholdStore();
    const old = serializeEnvelope(store.state);
    old.schema = SCHEMA - 1;
    const written: DataEnvelope[] = [];
    let rev = 3;
    store.adapter = {
      name: "server",
      shared: true,
      autoPush: true,
      load: async () => structuredClone(old),
      save: async () => {
        throw new Error("tenants never use save");
      },
      saveUpgrade: async (data) => {
        written.push(structuredClone(data));
        rev += 1;
      },
      knownRev: () => rev,
      describe: () => "test",
    };
    store.session = { personId: "p2", personName: "Test", role: "tenant" };
    const { changed } = store.applyHydrate(await store.adapter.load());
    expect(changed).toBe(true);
    await store.saveUpgradedCopy();
    expect(written.map((doc) => doc.schema)).toEqual([SCHEMA]);
  });
});

describe("saving while the user keeps tapping", () => {
  test("a tenant's tap during a save is not undone by the reload", async () => {
    const { store, server, personId } = setUp("tenant");
    tapOff(store, personId, 5, true);
    const first = store.pushOwnStints();
    await tick();
    tapOff(store, personId, 6, true);
    server.releaseNext();
    await first;

    expect(personDays(store, personId)).not.toContain(6);
    expect(store.dirty).toBe(true);

    const second = store.flushOwnStints();
    await tick();
    server.releaseNext();
    await second;

    expect(server.sentStints.at(-1)?.some((s) => s.from <= 6 && s.to >= 6)).toBe(false);
    expect(personDays(store, personId)).not.toContain(5);
    expect(personDays(store, personId)).not.toContain(6);
    expect(store.dirty).toBe(false);
  });

  test("an admin's tap during a save is still sent afterwards", async () => {
    const { store, server, personId } = setUp("admin");
    tapOff(store, personId, 5, false);
    const first = store.push();
    await tick();
    tapOff(store, personId, 6, false);
    server.releaseNext();
    await first;

    expect(store.dirty).toBe(true);

    const second = store.push();
    await tick();
    server.releaseNext();
    await second;

    const months = server.document.data.months as Record<string, { stints: Stint[] }>;
    const saved = months[store.state.currentMonth]?.stints ?? [];
    expect(saved.some((s) => s.personId === personId && s.from <= 6 && s.to >= 6)).toBe(false);
    expect(store.dirty).toBe(false);
  });
});
