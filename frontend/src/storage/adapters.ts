import { LS } from "./browser-storage";
import { BACKUP_KEY, LEGACY_KEYS, STORAGE_KEY, V1_KEYS } from "../domain/schema";
import type { DataEnvelope } from "../domain/types";
import type { HealthResponse, PutDataResponse, StoredDocument } from "../lib/api-types";

export class NeedAuthError extends Error {
  readonly kind = "needAuth" as const;
  constructor() {
    super("Not signed in");
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
  login?: (password: string) => Promise<boolean>;
  logout?: () => Promise<void>;
};

export function localAdapter(): StorageAdapter {
  return {
    name: "local",
    shared: false,
    async load() {
      for (const k of [STORAGE_KEY, ...LEGACY_KEYS]) {
        try {
          const raw = LS.get(k);
          if (raw) return JSON.parse(raw) as unknown;
        } catch {
          /* skip */
        }
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

type ArtifactApi = { publish: (html: string) => Promise<void> };

export function artifactAdapter(api: ArtifactApi): StorageAdapter {
  let template: string | null = null;
  async function getTemplate(): Promise<string> {
    if (template) return template;
    const res = await fetch(location.href, { cache: "no-store" });
    template = await res.text();
    return template;
  }
  return {
    name: "artifact",
    shared: true,
    async load() {
      const el = document.getElementById("seed-data");
      if (!el || !el.textContent?.trim()) return null;
      try {
        return JSON.parse(el.textContent) as unknown;
      } catch {
        return null;
      }
    },
    async save(data) {
      const src = await getTemplate();
      const json = JSON.stringify(data).replace(/<\//g, "<\\/");
      const open = '<script id="seed-data" type="application/json">';
      const i = src.indexOf(open);
      if (i < 0) {
        throw new Error("The page source doesn't look right, so nothing was published. Export a backup instead.");
      }
      const close = "</" + "script>";
      const j = src.indexOf(close, i);
      const next = src.slice(0, i + open.length) + json + src.slice(j);
      template = next;
      await api.publish(next);
    },
    describe() {
      return "Shared. Everyone with the link sees what you save here, and their page updates to match. Saves are last-one-wins, so keep data entry to one person.";
    },
  };
}

export function httpAdapter(base: string): StorageAdapter {
  let rev: number | null = null;
  const url = (path: string) => base.replace(/\/$/, "") + path;
  async function req(path: string, opts?: RequestInit): Promise<Response> {
    const r = await fetch(url(path), { credentials: "same-origin", ...opts });
    if (r.status === 401) throw new NeedAuthError();
    return r;
  }
  return {
    name: "server",
    shared: true,
    autoPush: true,
    async load() {
      const r = await req("/api/data");
      if (!r.ok) throw new Error("Server returned " + r.status);
      const j = (await r.json()) as StoredDocument;
      rev = j.rev;
      return j.payload;
    },
    async save(data, force) {
      const r = await req("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rev, payload: data, force: !!force }),
      });
      if (r.status === 409) throw new ConflictError();
      if (!r.ok) throw new Error("Server returned " + r.status);
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
    async login(password) {
      const r = await fetch(url("/api/login"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return r.ok;
    },
    async logout() {
      try {
        await fetch(url("/api/logout"), { method: "POST", credentials: "same-origin" });
      } catch {
        /* ignore */
      }
    },
    describe() {
      return "Stored on your own server. Everyone who opens the site sees the same data, and changes are saved automatically. A copy is kept in this browser in case the server is unreachable.";
    },
  };
}

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

export async function pickAdapter(): Promise<{ adapter: StorageAdapter; needAuth: boolean }> {
  if (location.protocol === "http:" || location.protocol === "https:") {
    try {
      const r = await fetch("/api/health", { credentials: "same-origin" });
      if (r.ok) {
        const h = (await r.json()) as HealthResponse;
        if (h && h.app === "rent-split") {
          return { adapter: httpAdapter(""), needAuth: !h.authed && !!h.authRequired };
        }
      }
    } catch {
      /* no server */
    }
  }
  try {
    if (window.claude && typeof window.claude.use === "function") {
      const api = await window.claude.use("artifact");
      if (api && typeof (api as ArtifactApi).publish === "function") {
        return { adapter: artifactAdapter(api as ArtifactApi), needAuth: false };
      }
    }
  } catch {
    /* local */
  }
  return { adapter: localAdapter(), needAuth: false };
}

export function readV1(): Record<string, unknown> | null {
  for (const k of V1_KEYS) {
    try {
      const raw = LS.get(k);
      if (raw) {
        const o = JSON.parse(raw) as Record<string, unknown>;
        if (o && (o.people || o.rooms)) return o;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}
