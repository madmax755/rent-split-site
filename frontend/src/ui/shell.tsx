import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { computeBalances, monthAllActual } from "../domain/engine";
import { ensureMonth } from "../domain/months";
import { snapshotCurrent } from "../domain/snapshot";
import type { TabId } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { ACCENTS, resolvedTheme, type Tweaks } from "../theme/tweaks";
import { Icon, MoonIcon, SunIcon } from "./icon";

export type AppShellProps = {
  children: ReactNode;
  tweaks: Tweaks;
  onTweaks: (t: Tweaks) => void;
  editMode: boolean;
  onEditMode: (v: boolean) => void;
  loginOpen: boolean;
  loginError: string;
  onLogin: (password: string) => Promise<void>;
  toast: string;
  propertyOpen: boolean;
  setPropertyOpen: (v: boolean) => void;
};

type TabDef = {
  id: TabId;
  label: string;
  icon: ReactNode;
};

const TABS: TabDef[] = [
  {
    id: "month",
    label: "This month",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
  },
  {
    id: "stints",
    label: "Who's here",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <circle cx="17" cy="8" r="3" />
        <path d="M21.5 19a5 5 0 0 0-6.5-4.5" />
      </>
    ),
  },
  {
    id: "balances",
    label: "Balances",
    icon: (
      <>
        <path d="M12 3v18" />
        <path d="M5 7h14" />
        <path d="M5 7l-2.5 6a3.5 3.5 0 0 0 7 0z" />
        <path d="M19 7l2.5 6a3.5 3.5 0 0 1-7 0z" />
      </>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <rect x="7" y="11" width="3" height="6" />
        <rect x="12" y="7" width="3" height="10" />
        <rect x="17" y="13" width="3" height="4" />
      </>
    ),
  },
  {
    id: "setup",
    label: "Household",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="7" cy="18" r="2" />
      </>
    ),
  },
  {
    id: "how",
    label: "How this works",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
        <path d="M12 17.5h.01" />
      </>
    ),
  },
];

export function AppShell(props: AppShellProps) {
  const { store, state } = useHousehold();
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const M = ensureMonth(state, state.currentMonth);
  const needsBills = M.collected && !monthAllActual(state, M);
  const { bal } = computeBalances(state);
  const anyBalance = Object.values(bal).some((v) => Math.abs(v) >= 1);
  const noStints = !(M.stints || []).length;
  const shared = store.adapter.shared;
  const bad = !!store.lastError;
  const syncClass = "sync-dot" + (bad ? " dirty" : shared ? (store.dirty ? " dirty" : " live") : "");
  const syncTitle = bad
    ? store.lastError
    : shared
      ? store.dirty
        ? "Saving…"
        : "Saved on the server"
      : "Saved in this browser";
  const dark = resolvedTheme(props.tweaks) === "dark";

  useEffect(() => {
    setTweaksOpen(props.editMode);
  }, [props.editMode]);

  useEffect(() => {
    document.body.classList.toggle("no-auth", props.loginOpen);
  }, [props.loginOpen]);

  function tabAlert(id: TabId): boolean {
    switch (id) {
      case "month":
        return needsBills;
      case "stints":
        return noStints;
      case "balances":
        return anyBalance;
      case "history":
      case "setup":
      case "settings":
      case "how":
        return false;
      default: {
        const _exhaustive: never = id;
        void _exhaustive;
        return false;
      }
    }
  }

  async function submitLogin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSigningIn(true);
    try {
      await props.onLogin(password);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <h1>Rent Split</h1>
          <span className={syncClass} title={syncTitle} />
          <button className="prop-pill" title="Properties" onClick={() => props.setPropertyOpen(true)}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 11l9-7 9 7" />
              <path d="M5 10v10h14V10" />
            </svg>
            <span>{state.activePresetName || "Property"}</span>
          </button>
          <button
            className="iconbtn"
            title="Toggle appearance"
            onClick={() => {
              props.onTweaks({
                ...props.tweaks,
                theme: document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark",
              });
            }}
          >
            <Icon strokeWidth={2}>{dark ? <MoonIcon /> : <SunIcon />}</Icon>
          </button>
        </div>
      </div>

      <div className="tabs">
        <div className="tabs-inner">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab${state.activeTab === tab.id ? " active" : ""}${tabAlert(tab.id) ? " has-alert" : ""}`}
              data-tab={tab.id}
              onClick={() => {
                store.setTab(tab.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Icon>{tab.icon}</Icon>
              {tab.label}
              <span className="tab-dot" />
            </button>
          ))}
        </div>
      </div>

      <div className="container">{props.children}</div>

      <div
        className={`sheet-backdrop${props.propertyOpen ? " open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) props.setPropertyOpen(false);
        }}
      >
        <div className="sheet">
          <div className="sheet-title">Properties</div>
          <div className="sheet-sub">
            Snapshot the entire setup — people, rent, rooms, bills, months and balances — and switch between properties.
          </div>
          <div className="stack">
            {!state.presets.length ? (
              <div className="empty">No saved properties yet.</div>
            ) : (
              state.presets.map((preset, i) => {
                const s = preset.snapshot;
                const meta = s
                  ? [
                      `${(s.people || []).length} people`,
                      `${(s.rooms || []).length} rooms`,
                      `${Object.keys(s.months || {}).length} months`,
                      typeof s.rent === "number" ? `${s.currency || state.currency}${s.rent.toLocaleString()}/mo` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "";
                return (
                  <div
                    key={`${preset.name}-${i}`}
                    className="list-row"
                    style={{ background: "var(--card-2)", borderRadius: "var(--radius)", padding: "12px 14px" }}
                  >
                    <div className="grow" style={{ minWidth: 0 }}>
                      <input
                        type="text"
                        value={preset.name}
                        style={{ fontWeight: 600, fontSize: 15 }}
                        onChange={(e) => {
                          const name = e.target.value;
                          store.mutate(() => {
                            const p = store.state.presets[i];
                            if (p) p.name = name;
                          });
                        }}
                      />
                      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                        {preset.legacy && !preset.snapshot ? "from the old version — load to convert" : meta}
                      </div>
                    </div>
                    <button
                      className="btn-ghost btn btn-sm"
                      onClick={() => {
                        if (!confirm(`Load "${preset.name}"? Everything currently on screen is replaced.`)) return;
                        store.loadPreset(preset);
                        props.setPropertyOpen(false);
                      }}
                    >
                      Load
                    </button>
                    <button
                      className="btn-icon"
                      title="Overwrite with what's on screen"
                      onClick={() => {
                        if (!confirm(`Overwrite "${preset.name}" with the current setup?`)) return;
                        store.mutate(() => {
                          const p = store.state.presets[i];
                          if (!p) return;
                          p.snapshot = snapshotCurrent(store.state);
                          p.legacy = null;
                        });
                        store.announce("Property updated.");
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-3-6.7" />
                        <path d="M21 4v5h-5" />
                      </svg>
                    </button>
                    <button
                      className="btn-icon"
                      title="Remove"
                      onClick={() => {
                        if (!confirm(`Remove "${preset.name}"?`)) return;
                        store.mutate(() => {
                          store.state.presets.splice(i, 1);
                        });
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M6 6l12 12M6 18L18 6" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
            onClick={() => {
              const name = prompt("Name for this property?", `Property ${state.presets.length + 1}`);
              if (!name || !name.trim()) return;
              const t = name.trim();
              if (state.presets.some((p) => p.name === t)) {
                if (!confirm(`"${t}" already exists. Overwrite it?`)) return;
              }
              store.saveAsProperty(t);
              store.announce("Saved.");
            }}
          >
            ＋ Save current as new property
          </button>
          <button
            className="btn-ghost btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            onClick={() => props.setPropertyOpen(false)}
          >
            Close
          </button>
        </div>
      </div>

      <button
        className="iconbtn"
        title="Tweaks"
        style={{ position: "fixed", bottom: 16, right: 16, zIndex: 55, display: props.editMode ? "inline-flex" : "none" }}
        onClick={() => setTweaksOpen(!tweaksOpen)}
      >
        <Icon strokeWidth={2}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </Icon>
      </button>

      <div id="tweaks-panel" className={tweaksOpen && props.editMode ? "open" : undefined}>
        <h3>
          Tweaks
          <button
            className="iconbtn close"
            style={{ width: 26, height: 26 }}
            onClick={() => {
              setTweaksOpen(false);
              props.onEditMode(false);
              try {
                window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
              } catch {
                /* ignore */
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </h3>
        <div className="tw-row">
          <label>Appearance</label>
          <div className="segmented">
            {(["light", "dark", "auto"] as const).map((theme) => (
              <button
                key={theme}
                className={`seg-btn${props.tweaks.theme === theme ? " active" : ""}`}
                onClick={() => props.onTweaks({ ...props.tweaks, theme })}
              >
                {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto"}
              </button>
            ))}
          </div>
        </div>
        <div className="tw-row">
          <label>Accent color</label>
          <div className="tw-swatches">
            {ACCENTS.map((accent) => (
              <button
                key={accent.v}
                className={`tw-swatch${props.tweaks.accent === accent.v || props.tweaks.accent === accent.dark ? " active" : ""}`}
                style={{ background: accent.v }}
                title={accent.name}
                onClick={() => props.onTweaks({ ...props.tweaks, accent: accent.v })}
              />
            ))}
          </div>
        </div>
        <div className="tw-row">
          <label>Density</label>
          <div className="segmented">
            {(["comfy", "compact"] as const).map((density) => (
              <button
                key={density}
                className={`seg-btn${props.tweaks.density === density ? " active" : ""}`}
                onClick={() => props.onTweaks({ ...props.tweaks, density })}
              >
                {density === "comfy" ? "Comfy" : "Compact"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`sheet-backdrop${props.loginOpen ? " open" : ""}`}>
        <div className="sheet" style={{ maxWidth: 380 }}>
          <div className="sheet-title">Rent Split</div>
          <div className="sheet-sub">This household's numbers are password protected. Ask whoever set the site up.</div>
          <form onSubmit={(e) => void submitLogin(e)} autoComplete="on">
            <div className="field" style={{ marginTop: 6 }}>
              <input
                type="password"
                placeholder="Household password"
                autoComplete="current-password"
                style={{ fontSize: 16 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {props.loginError ? (
              <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{props.loginError}</div>
            ) : null}
            <button className="btn" type="submit" disabled={signingIn} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
              {signingIn ? "Checking…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

      <div className={`toast${props.toast ? " show" : ""}`}>{props.toast}</div>
    </>
  );
}
