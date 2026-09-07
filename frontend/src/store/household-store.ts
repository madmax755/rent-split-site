import { freshHousehold } from "../domain/defaults";
import { todayKey } from "../domain/dates";
import { ensureMonth } from "../domain/months";
import { normalise } from "../domain/normalise";
import { hydrate, migrateFromV1, serializeEnvelope } from "../domain/hydrate";
import { APP_ID } from "../domain/schema";
import { applySnapshot, resetHousehold, snapshotCurrent } from "../domain/snapshot";
import type { DataEnvelope, HouseholdState, TabId } from "../domain/types";
import {
  ConflictError,
  NeedAuthError,
  localAdapter,
  pickAdapter,
  readV1,
  type StorageAdapter,
} from "../storage/adapters";

export type ToastFn = (msg: string) => void;

export class HouseholdStore {
  state: HouseholdState = freshHousehold();
  adapter: StorageAdapter = localAdapter();
  dirty = false;
  lastError = "";
  needAuth = false;
  readOnly = false;
  pushing = false;
  loadNote = "";
  version = 0;

  private listeners = new Set<() => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private warned = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private toast: ToastFn = () => {};

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): this => this;

  setToast(fn: ToastFn): void {
    this.toast = fn;
  }

  announce(msg: string): void {
    this.toast(msg);
  }

  private notify(): void {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  mutate(fn: () => void, opts: { persist?: boolean; quiet?: boolean } = {}): void {
    fn();
    const persist = opts.persist !== false;
    if (persist) this.save();
    this.notify();
  }

  async init(): Promise<void> {
    const picked = await pickAdapter();
    this.adapter = picked.adapter;
    this.needAuth = picked.needAuth;
    this.notify();
  }

  async loadRaw(): Promise<unknown> {
    let data: unknown = null;
    try {
      data = await this.adapter.load();
    } catch {
      /* ignore */
    }
    if (!data && this.adapter.name !== "local") {
      try {
        data = await localAdapter().load();
      } catch {
        /* ignore */
      }
    }
    return data;
  }

  saveLocal(): void {
    if (this.readOnly) return;
    try {
      void localAdapter()
        .save(serializeEnvelope(this.state))
        .catch(() => this.warnNoStorage());
    } catch {
      this.warnNoStorage();
    }
  }

  save(): void {
    if (this.readOnly) return;
    this.saveLocal();
    if (this.adapter.shared) {
      this.dirty = true;
      this.notify();
      if (this.adapter.autoPush) {
        if (this.pushTimer) clearTimeout(this.pushTimer);
        this.pushTimer = setTimeout(() => {
          void this.push().catch(() => {});
        }, 1200);
      }
    }
  }

  warnNoStorage(): void {
    if (this.warned) return;
    this.warned = true;
    setTimeout(() => this.toast("This browser won't save anything — export a backup before you close the tab."), 900);
  }

  async push(force = false): Promise<void> {
    if (this.pushing) return;
    this.pushing = true;
    this.notify();
    try {
      await this.adapter.save(serializeEnvelope(this.state), force);
      this.dirty = false;
      this.lastError = "";
    } catch (e) {
      if (e instanceof NeedAuthError) {
        this.needAuth = true;
        this.lastError = "Signed out.";
      } else if (e instanceof ConflictError) {
        this.lastError = "Someone else saved first.";
        const keepMine = confirm(
          "Somebody else saved changes while you were editing.\n\n" +
            "OK  — keep my version and overwrite theirs\n" +
            "Cancel — throw mine away and load theirs",
        );
        if (keepMine) {
          this.pushing = false;
          this.notify();
          return this.push(true);
        }
        const fresh = await this.adapter.load();
        if (fresh) {
          hydrate(this.state, fresh, (raw) => migrateFromV1(this.state, raw));
        }
        this.dirty = false;
      } else {
        this.lastError = e instanceof Error ? e.message : "Could not reach the server.";
      }
      throw e;
    } finally {
      this.pushing = false;
      this.notify();
    }
  }

  startPolling(): void {
    if (!this.adapter.shared || !this.adapter.currentRev) return;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (this.dirty || this.pushing || this.needAuth) return;
      const server = await this.adapter.currentRev?.();
      if (server == null || server === this.adapter.knownRev?.()) return;
      try {
        const fresh = await this.adapter.load();
        if (fresh) {
          const { outcome } = hydrate(this.state, fresh, (raw) => migrateFromV1(this.state, raw));
          if (outcome === true) {
            this.notify();
            this.toast("Updated — somebody else made a change.");
          }
        }
      } catch {
        /* ignore */
      }
    }, 12000);
  }

  applyHydrate(saved: unknown): { outcome: ReturnType<typeof hydrate>["outcome"]; changed: boolean } {
    const result = hydrate(this.state, saved, (raw) => migrateFromV1(this.state, raw));
    this.loadNote = result.loadNote;
    return { outcome: result.outcome, changed: result.changed };
  }

  applyV1(raw: Record<string, unknown>): string[] {
    return migrateFromV1(this.state, raw);
  }

  importPayload(o: unknown): "ok" | "tooNew" | "v1" | "unrecognised" {
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      if (rec.app === APP_ID || rec.v === 2 || rec.months) {
        const { outcome } = this.applyHydrate(o);
        if (outcome === "tooNew") return "tooNew";
        ensureMonth(this.state, this.state.currentMonth);
        this.save();
        this.notify();
        return "ok";
      }
      if (rec.people || rec.rooms) {
        this.applyV1(rec);
        this.save();
        this.notify();
        return "v1";
      }
    }
    return "unrecognised";
  }

  resetToDefaults(): void {
    resetHousehold(this.state);
    this.state.currentMonth = todayKey();
    ensureMonth(this.state, this.state.currentMonth);
    normalise(this.state);
    this.save();
    this.notify();
  }

  loadPreset(snapshot: HouseholdState["presets"][number]): void {
    if (snapshot.snapshot) applySnapshot(this.state, snapshot.snapshot);
    else if (snapshot.legacy && typeof snapshot.legacy === "object") {
      this.applyV1(snapshot.legacy as Record<string, unknown>);
    }
    this.state.activePresetName = snapshot.name;
    normalise(this.state);
    this.save();
    this.notify();
  }

  saveAsProperty(name: string): void {
    const t = name.trim();
    const i = this.state.presets.findIndex((p) => p.name === t);
    if (i >= 0) {
      const existing = this.state.presets[i];
      if (existing) existing.snapshot = snapshotCurrent(this.state);
      if (existing) existing.legacy = null;
    } else {
      this.state.presets.push({ name: t, snapshot: snapshotCurrent(this.state), legacy: null });
    }
    this.state.activePresetName = t;
    this.save();
    this.notify();
  }

  setTab(tab: TabId): void {
    this.state.activeTab = tab;
    this.notify();
  }

  envelope(): DataEnvelope {
    return serializeEnvelope(this.state);
  }
}

export function readLegacyV1(): Record<string, unknown> | null {
  return readV1();
}
