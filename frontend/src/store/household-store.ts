import { deep } from "../domain/clone";
import { DEFAULT_SITE_TITLE, freshHousehold } from "../domain/defaults";
import { currentTenancyMonthKey } from "../domain/dates";
import { ensureMonth } from "../domain/months";
import { normalise } from "../domain/normalise";
import { hydrate, serializeEnvelope } from "../domain/hydrate";
import { APP_ID } from "../domain/schema";
import { applySnapshot, resetHousehold, snapshotCurrent } from "../domain/snapshot";
import type { DataEnvelope, HouseholdState, LedgerEntry, TabId } from "../domain/types";
import type { PickerPerson, SessionInfo } from "../lib/api-types";
import type { ConfirmAsk } from "../ui/confirm-dialog";
import { ConflictError, localAdapter, pickAdapter, type StorageAdapter } from "../storage/adapters";

export type ToastFn = (msg: string) => void;

export class HouseholdStore {
  state: HouseholdState = freshHousehold();
  adapter: StorageAdapter = localAdapter();
  session: SessionInfo | null = null;
  pickerPeople: PickerPerson[] = [];
  siteTitle = DEFAULT_SITE_TITLE;
  dirty = false;
  lastError = "";
  needAuth = false;
  readOnly = false;
  pushing = false;
  loadNote = "";
  version = 0;

  private listeners = new Set<() => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private ownStintsTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingOwnStints = new Set<string>();
  /** Bumped on every local edit that still has to reach the server. */
  private editSeq = 0;
  private warned = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private toast: ToastFn = () => {};
  private ask: ConfirmAsk = async () => false;

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

  setConfirm(fn: ConfirmAsk): void {
    this.ask = fn;
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
    // Replace object identities after in-place edits so React Compiler
    // memo caches cannot keep rendering the pre-edit tree.
    this.state = deep(this.state);
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

  linkedPersonId(): string | null {
    return this.session?.personId ?? null;
  }

  queueOwnStintsSave(): void {
    if (this.readOnly) return;
    this.saveLocal();
    if (!this.adapter.saveMyStints) return;
    this.editSeq += 1;
    this.pendingOwnStints.add(this.state.currentMonth);
    this.dirty = true;
    this.notify();
    this.scheduleOwnStintsPush();
  }

  private scheduleOwnStintsPush(): void {
    if (this.ownStintsTimer) clearTimeout(this.ownStintsTimer);
    this.ownStintsTimer = setTimeout(() => {
      void this.pushOwnStints().catch(() => {});
    }, 1200);
  }

  private schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      void this.push().catch(() => {});
    }, 1200);
  }

  /**
   * Loads the server copy, but drops it if the user edited something while it
   * was in flight. The known revision is put back so the next save is checked
   * against what this client last applied, not what it threw away.
   */
  private async loadUnlessEdited(): Promise<unknown> {
    const before = this.editSeq;
    const knownRev = this.adapter.knownRev?.() ?? null;
    const fresh = await this.adapter.load();
    if (this.editSeq !== before) {
      this.adapter.setKnownRev?.(knownRev);
      return null;
    }
    return fresh;
  }

  async flushOwnStints(): Promise<void> {
    if (this.ownStintsTimer) {
      clearTimeout(this.ownStintsTimer);
      this.ownStintsTimer = null;
    }
    if (!this.pendingOwnStints.size || !this.adapter.saveMyStints) return;
    await this.pushOwnStints();
  }

  async init(): Promise<void> {
    const picked = await pickAdapter();
    this.adapter = picked.adapter;
    this.needAuth = picked.needAuth;
    this.session = picked.session;
    this.pickerPeople = picked.people;
    this.siteTitle = picked.siteTitle;
    if (typeof document !== "undefined") document.title = this.siteTitle;
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
      this.editSeq += 1;
      this.dirty = true;
      this.notify();
      if (this.adapter.autoPush) this.schedulePush();
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
    const sent = this.editSeq;
    let saved = false;
    try {
      await this.adapter.save(serializeEnvelope(this.state), force);
      this.dirty = this.editSeq !== sent;
      this.lastError = "";
      saved = true;
    } catch (e) {
      if (e instanceof ConflictError) {
        this.lastError = "Someone else saved first.";
        this.pushing = false;
        this.notify();
        const keepMine = await this.ask({
          title: "Someone else saved first",
          description:
            "Keep your version and overwrite theirs, or throw yours away and load theirs.",
          confirmLabel: "Keep mine",
          cancelLabel: "Load theirs",
        });
        if (keepMine) {
          await this.push(true);
          return;
        }
        const fresh = await this.adapter.load();
        if (fresh) hydrate(this.state, fresh);
        this.dirty = false;
        return;
      }
      this.lastError = e instanceof Error ? e.message : "Could not reach the server.";
      throw e;
    } finally {
      this.pushing = false;
      this.notify();
      if (saved && this.dirty && this.adapter.autoPush) this.schedulePush();
    }
  }

  async pushOwnStints(force = false): Promise<void> {
    const saveMyStints = this.adapter.saveMyStints;
    const personId = this.linkedPersonId();
    if (!saveMyStints || !personId || this.pushing) return;
    const months = [...this.pendingOwnStints];
    if (!months.length) return;
    this.pushing = true;
    this.notify();
    const sent = this.editSeq;
    let saved = false;
    try {
      for (const monthKey of months) {
        const mine = (this.state.months[monthKey]?.stints || []).filter(
          (s) => s.personId === personId,
        );
        await saveMyStints(monthKey, personId, mine, force);
      }
      if (this.editSeq === sent) months.forEach((monthKey) => this.pendingOwnStints.delete(monthKey));
      this.dirty = this.pendingOwnStints.size > 0;
      this.lastError = "";
      saved = true;
      if (!this.dirty) {
        const fresh = await this.loadUnlessEdited();
        if (fresh) this.applyHydrate(fresh);
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        this.lastError = "Someone else saved first.";
        this.pushing = false;
        this.notify();
        const keepMine = await this.ask({
          title: "Someone else saved first",
          description:
            "Keep your version and overwrite theirs, or throw yours away and load theirs.",
          confirmLabel: "Keep mine",
          cancelLabel: "Load theirs",
        });
        if (keepMine) {
          await this.pushOwnStints(true);
          return;
        }
        const fresh = await this.adapter.load();
        if (fresh) this.applyHydrate(fresh);
        this.pendingOwnStints.clear();
        this.dirty = false;
        return;
      }
      this.lastError = e instanceof Error ? e.message : "Could not reach the server.";
      throw e;
    } finally {
      this.pushing = false;
      this.notify();
      if (saved && this.pendingOwnStints.size) this.scheduleOwnStintsPush();
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
        const fresh = await this.loadUnlessEdited();
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

  /**
   * After loading an old-format household, write the upgraded copy back once.
   * Tenants can't normally save the whole household, but if nobody upgrades
   * it, their own-stint saves land in the old format and get converted again
   * on every load.
   */
  async saveUpgradedCopy(): Promise<void> {
    if (this.readOnly || !this.adapter.shared) return;
    if (this.isAdmin()) {
      this.save();
      return;
    }
    const saveUpgrade = this.adapter.saveUpgrade;
    if (!saveUpgrade) return;
    try {
      await saveUpgrade(serializeEnvelope(this.state));
    } catch (e) {
      if (!(e instanceof ConflictError)) return;
      const fresh = await this.adapter.load();
      if (!fresh) return;
      const { changed } = this.applyHydrate(fresh);
      this.notify();
      if (changed) await saveUpgrade(serializeEnvelope(this.state)).catch(() => {});
    }
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
    this.state.currentMonth = currentTenancyMonthKey(this.state.tenancyStart);
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
