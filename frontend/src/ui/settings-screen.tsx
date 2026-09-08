import { useState } from "react";
import { SCHEMA, STORAGE_KEY } from "../domain/schema";
import { snapshotCurrent } from "../domain/snapshot";
import { sortedMonthKeys } from "../domain/months";
import { plural } from "../domain/format";
import { useHousehold } from "../store/household-context";
import { ACCENTS, type Tweaks } from "../theme/tweaks";
import { PageHeader, Panel, Screen } from "./kit";
import { XIcon } from "lucide-react";
import { TextPromptDialog } from "./text-prompt-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SettingsScreenProps = {
  tweaks: Tweaks;
  onTweaks: (next: Tweaks) => void;
  showImport: boolean;
  setShowImport: (v: boolean) => void;
  importText: string;
  setImportText: (v: string) => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onPush: () => void;
  onLogout: () => void;
};

export function SettingsScreen(props: SettingsScreenProps) {
  const { store, state, activeTab } = useHousehold();
  const a = store.adapter;
  const [savingProperty, setSavingProperty] = useState(false);

  return (
    <Screen id="settings" active={activeTab === "settings"}>
      <PageHeader
        title="Settings"
        description="Appearance, saved properties, and backups. Household rent, rooms and bills live on Household."
      />
      <div className="grid gap-5">
        <Panel title="Appearance" description="These stay on this browser and are not shared.">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">Theme</span>
              <div className="flex rounded-lg bg-muted p-0.5">
                {(["light", "dark", "auto"] as const).map((theme) => (
                  <Button
                    key={theme}
                    size="sm"
                    variant={props.tweaks.theme === theme ? "secondary" : "ghost"}
                    onClick={() => props.onTweaks({ ...props.tweaks, theme })}
                  >
                    {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">Accent</span>
              <div className="flex gap-2">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.v}
                    type="button"
                    title={accent.name}
                    className={cn(
                      "size-7 rounded-full border-2",
                      props.tweaks.accent === accent.v || props.tweaks.accent === accent.dark
                        ? "border-foreground"
                        : "border-transparent",
                    )}
                    style={{ background: accent.v }}
                    onClick={() => props.onTweaks({ ...props.tweaks, accent: accent.v })}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">Density</span>
              <div className="flex rounded-lg bg-muted p-0.5">
                {(["comfy", "compact"] as const).map((density) => (
                  <Button
                    key={density}
                    size="sm"
                    variant={props.tweaks.density === density ? "secondary" : "ghost"}
                    onClick={() => props.onTweaks({ ...props.tweaks, density })}
                  >
                    {density === "comfy" ? "Comfy" : "Compact"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Properties"
          description="Snapshot the entire setup — people, rent, rooms, bills, months and balances — and switch between properties."
        >
          {!state.presets.length ? (
            <p className="text-sm text-muted-foreground">No saved properties yet.</p>
          ) : (
            <div className="grid gap-2">
              {state.presets.map((preset, i) => {
                const s = preset.snapshot;
                const meta = s
                  ? [
                      `${(s.people || []).length} people`,
                      `${(s.rooms || []).length} rooms`,
                      `${Object.keys(s.months || {}).length} months`,
                      typeof s.rent === "number"
                        ? `${s.currency || state.currency}${s.rent.toLocaleString()}/mo`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "";
                return (
                  <div
                    key={`${preset.name}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Input
                        value={preset.name}
                        className="h-7 border-transparent bg-transparent font-medium shadow-none"
                        onChange={(e) => {
                          const name = e.target.value;
                          store.mutate(() => {
                            const p = store.state.presets[i];
                            if (p) p.name = name;
                          });
                        }}
                      />
                      <div className="text-xs text-muted-foreground">{meta}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (
                          !confirm(
                            `Load "${preset.name}"? Everything currently on screen is replaced.`,
                          )
                        )
                          return;
                        store.loadPreset(preset);
                      }}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!confirm(`Overwrite "${preset.name}" with the current setup?`)) return;
                        store.mutate(() => {
                          const p = store.state.presets[i];
                          if (!p) return;
                          p.snapshot = snapshotCurrent(store.state);
                        });
                        store.announce("Property updated.");
                      }}
                    >
                      Overwrite
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="max-sm:size-10"
                      title="Remove"
                      onClick={() => {
                        if (!confirm(`Remove "${preset.name}"?`)) return;
                        store.mutate(() => {
                          store.state.presets.splice(i, 1);
                        });
                      }}
                    >
                      <XIcon />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <Button className="mt-3" variant="outline" onClick={() => setSavingProperty(true)}>
            Save current as new property
          </Button>
        </Panel>

        <Panel
          title="Data, backup & sync"
          description={`${plural(sortedMonthKeys(state).length, "month")} · ${a.shared ? "shared" : "local"}`}
        >
          <div className="callout">
            <p>
              <b>{a.shared ? "Shared storage" : "This browser only"}</b> — {a.describe()}
            </p>
            {store.lastError ? <p className="text-destructive">{store.lastError}</p> : null}
          </div>
          {a.shared ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => props.onPush()}>
                {store.pushing
                  ? "Saving…"
                  : a.autoPush
                    ? store.dirty
                      ? "Saving…"
                      : "Save now"
                    : store.dirty
                      ? "Save & share changes"
                      : "Everything is shared"}
              </Button>
              {store.dirty ? (
                <span className="text-xs font-medium text-amber-600">unsaved changes</span>
              ) : null}
              {a.logout ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!confirm("Sign out of this browser?")) return;
                    props.onLogout();
                  }}
                >
                  Sign out
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="mb-3 text-sm text-muted-foreground">
            Data is saved under <code>{STORAGE_KEY}</code> in a self-describing envelope (schema{" "}
            {SCHEMA}). Browser storage can be cleared without warning — export a backup
            occasionally.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button onClick={() => props.onExport()}>Export a backup</Button>
            <Button variant="outline" onClick={() => props.setShowImport(!props.showImport)}>
              Import / restore
            </Button>
          </div>
          {props.showImport ? (
            <div className="grid gap-2">
              <Textarea
                className="min-h-28 font-mono text-xs"
                placeholder="Paste a backup export from this app."
                value={props.importText}
                onChange={(e) => props.setImportText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={() => props.onImport()}>Restore from this</Button>
                <Button variant="ghost" size="sm" onClick={() => props.setShowImport(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end">
            <Button variant="destructive" size="sm" onClick={() => props.onReset()}>
              Reset everything to defaults
            </Button>
          </div>
        </Panel>
      </div>
      <TextPromptDialog
        request={
          savingProperty
            ? {
                title: "Save as a property",
                description: "A snapshot of the current household, rooms, bills and people.",
                label: "Property name",
                defaultValue: `Property ${state.presets.length + 1}`,
                confirmLabel: "Save",
              }
            : null
        }
        onClose={() => setSavingProperty(false)}
        onConfirm={(name) => {
          if (state.presets.some((p) => p.name === name)) {
            if (!confirm(`"${name}" already exists. Overwrite it?`)) return;
          }
          store.saveAsProperty(name);
          setSavingProperty(false);
          store.announce("Saved.");
        }}
      />
    </Screen>
  );
}
