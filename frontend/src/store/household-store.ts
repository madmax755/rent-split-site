import { freshHousehold } from "../domain/defaults";
import { todayKey } from "../domain/dates";
import { ensureMonth } from "../domain/months";
import { normalise } from "../domain/normalise";
import { hydrate, serializeEnvelope } from "../domain/hydrate";
import { APP_ID } from "../domain/schema";
import { applySnapshot, resetHousehold, snapshotCurrent } from "../domain/snapshot";
import type { DataEnvelope, HouseholdState, LedgerEntry, TabId } from "../domain/types";
import type { SessionInfo } from "../lib/api-types";
import {
  ConflictError,
  NeedAuthError,
  localAdapter,
  pickAdapter,
  type StorageAdapter,
} from "../storage/adapters";

export type ToastFn = (msg: string) => void;

export class HouseholdStore {
  state: HouseholdState = freshHousehold();
  adapter: StorageAdapter = localAdapter();
  session: SessionInfo | null = null;
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

  snapshot: { version: number } = { version: 0 };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): { version: number } => this.snapshot;

  setToast(fn: ToastFn): void {
    this.toast = fn;
  }

  announce(msg: string): void {
    this.toast(msg);
  }

  private notify(): void {
    this.version += 1;
    this.snapshot = { version: this.version };
    this.listeners.forEach((l) => l());
  }

  notifyPublic(): void {
    this.notify();
  }

  mutate(fn: () => void, opts: { persist?: boolean; quiet?: boolean } = {}): void {
    fn();
    const persist = opts.persist !== false;
    if (persist) this.save();
    this.notify();
  }

  isAdmin(): boolean {
    return this.session?.role !== "tenant";
  }

  isTenant(): boolean {
    return this.session?.role === "tenant";
  }

  async init(): Promise<void> {
    const picked = await pickAdapter();
    this.adapter = picked.adapter;
    this.needAuth = picked.needAuth;
    this.session = picked.session;
    if (this.session) this.adapter.setRole?.(this.session.role);
    this.notify();
  }

  applySession(session: SessionInfo | null): void {
    this.session = session;
    if (session) this.adapter.setRole?.(session.role);
    this.notify();
  }

  async loadRaw(): Promise<unknown> {
    let data: unknown = null;
    try {
      data = await this.adapter.load();
    } catch {
      /* ignore */
    }
    if (!data && this.adapter.name !== "local" && !this.isTenant()) {
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
    if (this.isTenant()) {
      return;
    }
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
    setTimeout(
      () =>
        this.toast("This browser won't save anything — export a backup before you close the tab."),
      900,
    );
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
          hydrate(this.state, fresh);
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
          const { outcome } = hydrate(this.state, fresh);
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

  applyHydrate(saved: unknown): {
    outcome: ReturnType<typeof hydrate>["outcome"];
    changed: boolean;
  } {
    const result = hydrate(this.state, saved);
    this.loadNote = result.loadNote;
    return { outcome: result.outcome, changed: result.changed };
  }

  importPayload(o: unknown): "ok" | "tooNew" | "unrecognised" {
    if (o && typeof o === "object" && (o as { app?: unknown }).app === APP_ID) {
      const { outcome } = this.applyHydrate(o);
      if (outcome === "tooNew") return "tooNew";
      if (outcome === false) return "unrecognised";
      ensureMonth(this.state, this.state.currentMonth);
      this.save();
      this.notify();
      return "ok";
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

  loadPreset(preset: HouseholdState["presets"][number]): void {
    applySnapshot(this.state, preset.snapshot);
    this.state.activePresetName = preset.name;
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
    } else {
      this.state.presets.push({ name: t, snapshot: snapshotCurrent(this.state) });
    }
    this.state.activePresetName = t;
    this.save();
    this.notify();
  }

  setTab(tab: TabId): void {
    this.state.activeTab = tab;
    this.notify();
  }

  async recordSettle(entry: LedgerEntry): Promise<void> {
    if (this.adapter.settle) {
      await this.adapter.settle(entry);
      const fresh = await this.adapter.load();
      if (fresh) this.applyHydrate(fresh);
      this.notify();
      return;
    }
    this.mutate(() => {
      this.state.ledger.push(entry);
    });
  }

  async undoSettle(id: string): Promise<void> {
    if (this.adapter.undoSettle) {
      await this.adapter.undoSettle(id);
      const fresh = await this.adapter.load();
      if (fresh) this.applyHydrate(fresh);
      this.notify();
      return;
    }
    this.mutate(() => {
      this.state.ledger = this.state.ledger.filter((e) => e.id !== id);
    });
  }

  envelope(): DataEnvelope {
    return serializeEnvelope(this.state);
  }
}
