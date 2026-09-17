import { LS } from "./browser-storage";
import { BACKUP_KEY, STORAGE_KEY } from "../domain/schema";
import { DEFAULT_PEOPLE } from "../domain/defaults";
import type { DataEnvelope, LedgerEntry, Stint } from "../domain/types";
import type {
  AccountRole,
  HealthResponse,
  PickerPerson,
  PutDataResponse,
  SessionInfo,
  SettleRequest,
  StoredDocument,
} from "../lib/api-types";
import { clearStoredWho, livePickerPeople, resolvePickerPeople, sessionFromStored } from "./who";

export class ForbiddenError extends Error {
  readonly kind = "forbidden" as const;
  constructor(message = "Not allowed") {
    super(message);
  }
}

export class ConflictError extends Error {
  readonly kind = "conflict" as const;
  constructor() {
    super("Someone else saved first");
  }
}

export type StorageAdapter = {
  name: string;
  shared: boolean;
  autoPush?: boolean;
  load(): Promise<unknown>;
  save(data: DataEnvelope, force?: boolean): Promise<void>;
  describe(): string;
  currentRev?: () => Promise<number | null>;
  knownRev?: () => number | null;
  setRole?: (role: AccountRole) => void;
  logout?: () => Promise<void>;
  settle?: (entry: LedgerEntry) => Promise<void>;
  undoSettle?: (id: string) => Promise<void>;
  saveMyStints?: (
    monthKey: string,
    personId: string,
    stints: Stint[],
    force?: boolean,
  ) => Promise<void>;
};

export function localAdapter(): StorageAdapter {
  return {
    name: "local",
    shared: false,
    async load() {
      try {
        const raw = LS.get(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as unknown;
      } catch {
        /* skip */
      }
      return null;
    },
    async save(data) {
      const prev = LS.get(STORAGE_KEY);
      if (prev) LS.set(BACKUP_KEY, prev);
      if (!LS.set(STORAGE_KEY, JSON.stringify(data))) {
        throw new Error("Browser storage is full or blocked.");
      }
    },
    async logout() {
      clearStoredWho();
    },
    describe() {
      return LS.available()
        ? "Saved in this browser only. Nobody else can see it, and clearing site data will erase it — take an export now and then."
        : "This browser is refusing to store anything (private mode, blocked site data, or opened in a way that has no storage). Nothing you type here will survive a reload — use Export to keep it.";
    },
  };
}

async function readError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string };
    if (j && typeof j.error === "string") return j.error;
  } catch {
    /* ignore */
  }
  return "Server returned " + r.status;
}

export function httpAdapter(base: string): StorageAdapter {
  let rev: number | null = null;
  let role: AccountRole = "admin";
  const url = (path: string) => base.replace(/\/$/, "") + path;
  async function req(path: string, opts?: RequestInit): Promise<Response> {
    const r = await fetch(url(path), { credentials: "same-origin", ...opts });
    if (r.status === 403) throw new ForbiddenError(await readError(r));
    return r;
  }
  return {
    name: "server",
    shared: true,
    autoPush: true,
    setRole(next) {
      role = next;
    },
    async load() {
      const r = await req("/api/data");
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as StoredDocument;
      rev = j.rev;
      return j.payload;
    },
    async save(data, force) {
      if (role === "tenant") return;
      const r = await req("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rev, payload: data, force: !!force }),
      });
      if (r.status === 409) throw new ConflictError();
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as PutDataResponse;
      rev = j.rev;
    },
    async currentRev() {
      try {
        const r = await req("/api/rev");
        if (!r.ok) return null;
        const j = (await r.json()) as { rev: number };
        return j.rev;
      } catch {
        return null;
      }
    },
    knownRev() {
      return rev;
    },
    async logout() {
      clearStoredWho();
    },
    async settle(entry) {
      const body: SettleRequest = {
        id: entry.id,
        personId: entry.personId,
        amount: entry.amount,
        date: entry.date,
        note: entry.note,
        monthKey: entry.monthKey,
        rev: rev ?? undefined,
      };
      const r = await req("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 409) throw new ConflictError();
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as PutDataResponse;
      rev = j.rev;
    },
    async undoSettle(id) {
      const r = await req("/api/ledger/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as PutDataResponse;
      rev = j.rev;
    },
    async saveMyStints(monthKey, personId, stints, force) {
      const r = await req("/api/stints", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthKey,
          personId,
          stints,
          rev: rev ?? undefined,
          force: !!force,
        }),
      });
      if (r.status === 409) throw new ConflictError();
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as PutDataResponse;
      rev = j.rev;
    },
    describe() {
      return "Stored on your own server. Everyone who opens the site sees the same household; pick your name to open your dashboard. Changes are saved automatically.";
    },
  };
}

export function defaultPickerPeople(): PickerPerson[] {
  return livePickerPeople(DEFAULT_PEOPLE);
}

export async function pickAdapter(): Promise<{
  adapter: StorageAdapter;
  needAuth: boolean;
  session: SessionInfo | null;
  people: PickerPerson[];
}> {
  if (location.protocol === "http:" || location.protocol === "https:") {
    try {
      const r = await fetch("/api/health", { credentials: "same-origin" });
      if (r.ok) {
        const h = (await r.json()) as HealthResponse;
        if (h && h.app === "rent-split") {
          const people = resolvePickerPeople(h.people, defaultPickerPeople());
          const adapter = httpAdapter("");
          const session = sessionFromStored(people);
          if (session) adapter.setRole?.(session.role);
          return {
            adapter,
            needAuth: session === null,
            session,
            people,
          };
        }
      }
    } catch {
      /* no server */
    }
  }
  const people = defaultPickerPeople();
  const session = sessionFromStored(people);
  return { adapter: localAdapter(), needAuth: session === null, session, people };
}
