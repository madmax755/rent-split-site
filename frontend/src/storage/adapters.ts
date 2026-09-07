import { LS } from "./browser-storage";
import { BACKUP_KEY, STORAGE_KEY } from "../domain/schema";
import type { DataEnvelope, LedgerEntry, Stint } from "../domain/types";
import type {
  AccountRole,
  CreateAccountRequest,
  HealthResponse,
  LoginResponse,
  PatchAccountRequest,
  PublicAccount,
  PutDataResponse,
  SessionInfo,
  SettleRequest,
  StoredDocument,
} from "../lib/api-types";

export class NeedAuthError extends Error {
  readonly kind = "needAuth" as const;
  constructor() {
    super("Not signed in");
  }
}

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
  login?: (username: string, password: string) => Promise<SessionInfo | null>;
  logout?: () => Promise<void>;
  me?: () => Promise<SessionInfo | null>;
  listAccounts?: () => Promise<PublicAccount[]>;
  createAccount?: (body: CreateAccountRequest) => Promise<PublicAccount>;
  patchAccount?: (id: string, body: PatchAccountRequest) => Promise<PublicAccount>;
  deleteAccount?: (id: string) => Promise<void>;
  settle?: (entry: LedgerEntry) => Promise<void>;
  undoSettle?: (id: string) => Promise<void>;
  saveMyStints?: (monthKey: string, stints: Stint[], force?: boolean) => Promise<void>;
  disablePersonLogin?: (personId: string) => Promise<void>;
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
    if (r.status === 401) throw new NeedAuthError();
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
      const r = await req(role === "tenant" ? "/api/mine" : "/api/data");
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
    async login(username, password) {
      const r = await fetch(url("/api/login"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as LoginResponse;
      role = j.session.role;
      return j.session;
    },
    async logout() {
      try {
        await fetch(url("/api/logout"), { method: "POST", credentials: "same-origin" });
      } catch {
        /* ignore */
      }
    },
    async me() {
      const r = await req("/api/me");
      if (!r.ok) return null;
      return (await r.json()) as SessionInfo;
    },
    async listAccounts() {
      const r = await req("/api/accounts");
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as { accounts: PublicAccount[] };
      return j.accounts;
    },
    async createAccount(body) {
      const r = await req("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await readError(r));
      return (await r.json()) as PublicAccount;
    },
    async patchAccount(id, body) {
      const r = await req("/api/accounts/" + encodeURIComponent(id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await readError(r));
      return (await r.json()) as PublicAccount;
    },
    async deleteAccount(id) {
      const r = await req("/api/accounts/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) throw new Error(await readError(r));
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
    async saveMyStints(monthKey, stints, force) {
      const r = await req("/api/stints", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthKey, stints, rev: rev ?? undefined, force: !!force }),
      });
      if (r.status === 409) throw new ConflictError();
      if (!r.ok) throw new Error(await readError(r));
      const j = (await r.json()) as PutDataResponse;
      rev = j.rev;
    },
    async disablePersonLogin(personId) {
      const r = await req("/api/accounts/disable-person", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!r.ok) throw new Error(await readError(r));
    },
    describe() {
      return "Stored on your own server. Everyone who opens the site sees the same household; tenants only see their own dashboard. Changes are saved automatically.";
    },
  };
}

export const LOCAL_SESSION: SessionInfo = {
  accountId: "local",
  username: "local",
  role: "admin",
  personId: null,
  personName: null,
};

export async function pickAdapter(): Promise<{
  adapter: StorageAdapter;
  needAuth: boolean;
  session: SessionInfo | null;
}> {
  if (location.protocol === "http:" || location.protocol === "https:") {
    try {
      const r = await fetch("/api/health", { credentials: "same-origin" });
      if (r.ok) {
        const h = (await r.json()) as HealthResponse;
        if (h && h.app === "rent-split") {
          const adapter = httpAdapter("");
          if (h.session) adapter.setRole?.(h.session.role);
          return {
            adapter,
            needAuth: !h.authed && !!h.authRequired,
            session: h.session,
          };
        }
      }
    } catch {
      /* no server */
    }
  }
  return { adapter: localAdapter(), needAuth: false, session: LOCAL_SESSION };
}
