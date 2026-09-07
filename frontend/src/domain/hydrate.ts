import { deep } from "./clone";
import { normalise } from "./normalise";
import { APP_ID, SCHEMA, unwrap } from "./schema";
import {
  SNAPSHOT_FIELDS,
  type DataEnvelope,
  type HouseholdState,
  type Preset,
  type Snapshot,
} from "./types";
import { serializeData } from "./snapshot";

export type HydrateOutcome = true | false | "tooNew";

export function serializeEnvelope(state: HouseholdState): DataEnvelope {
  return {
    app: APP_ID,
    schema: SCHEMA,
    savedAt: new Date().toISOString(),
    data: serializeData(state),
  };
}

function readPresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  raw.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const rec = item as { name?: unknown; snapshot?: unknown };
    if (typeof rec.name !== "string") return;
    if (!rec.snapshot || typeof rec.snapshot !== "object") return;
    out.push({ name: rec.name, snapshot: rec.snapshot as Snapshot });
  });
  return out;
}

export function hydrate(
  state: HouseholdState,
  o: unknown,
): { outcome: HydrateOutcome; loadNote: string; changed: boolean } {
  const r = unwrap(o);
  if (!r) return { outcome: false, loadNote: "", changed: false };
  if ("tooNew" in r && r.tooNew) {
    const loadNote = `This data was saved by a newer version of the app (format ${r.schema}; this build reads ${SCHEMA}). Nothing was loaded and nothing has been overwritten — update the page, or restore from an export.`;
    return { outcome: "tooNew", loadNote, changed: false };
  }
  if (!("data" in r)) return { outcome: false, loadNote: "", changed: false };
  const d = r.data;
  SNAPSHOT_FIELDS.forEach((k) => {
    if (d[k] !== undefined) (state[k] as Snapshot[typeof k]) = deep(d[k]) as never;
  });
  state.presets = readPresets(d.presets);
  if (typeof d.activePresetName === "string") state.activePresetName = d.activePresetName;
  if (typeof d.currentMonth === "string") state.currentMonth = d.currentMonth;
  if (d.sectionsOpen && typeof d.sectionsOpen === "object") {
    state.sectionsOpen = { ...state.sectionsOpen, ...(d.sectionsOpen as Record<string, boolean>) };
  }
  normalise(state);
  return { outcome: true, loadNote: "", changed: !!r.migrated };
}
