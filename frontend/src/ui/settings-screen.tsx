import { daysInMonth, monthLabel } from "../domain/dates";
import { bedroomGaps, computeMonth, weightedAreas } from "../domain/engine";
import { fmtNum, money, plural } from "../domain/format";
import { SCHEMA, STORAGE_KEY } from "../domain/schema";
import { sortedMonthKeys } from "../domain/months";
import type { CurrencySymbol } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { ACCENTS, type Tweaks } from "../theme/tweaks";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
import { screenClass } from "./screen-class";
import { Section } from "./section";

export type SettingsScreenProps = {
  onToggleSection: (id: string) => void;
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

function isCurrency(v: string): v is CurrencySymbol {
  return v === "£" || v === "$" || v === "€";
}

export function SettingsScreen(props: SettingsScreenProps) {
  const { store, state, activeTab } = useHousehold();
  const key = state.currentMonth;
  const c = computeMonth(state, key, "eff");
  const D = daysInMonth(key);
  const gaps = bedroomGaps(state, key);
  const live = state.people.filter((p) => !p.archived);
  const totalDays = Object.values(c.counts.liableDays).reduce((a, v) => a + v, 0);
  const { total, ca } = weightedAreas(state);
  const a = store.adapter;
  const hallPct = total > 0 ? ((ca / total) * 100).toFixed(1) + "%" : "—";

  return (
    <div className={screenClass("settings", activeTab)} data-screen="settings">
      <Section
        id="setaway"
        title="How costs are split"
        meta={
          gaps.length
            ? `${plural(gaps.length, "bedroom")} left empty`
            : "one rule, everyone the same"
        }
        iconBg="var(--p5)"
        open={!!state.sectionsOpen.setaway}
        onToggle={() => props.onToggleSection("setaway")}
        icon={
          <Icon>
            <path d="M3 12h4l3 8 4-16 3 8h4" />
          </Icon>
        }
      >
        <div className="callout">
          <p>
            <b>There is one rule, and it applies to everybody.</b>
          </p>
          <p>
            You pay for the days you are in the house, and nothing for the days you are not. There
            are no tenants and no visitors, no settings per person, no exemptions — just the days on
            your stints.
          </p>
          <p style={{ marginBottom: 0 }}>
            <b>Rent</b> follows the bedroom you are in and its share of the floor area.{" "}
            <b>Every bill</b> — energy, water, Wi-Fi, insurance, council tax — is shared across the
            days each person was here that month.
          </p>
        </div>
        <div className="callout good">
          <p style={{ marginBottom: 0 }}>
            <b>Example.</b> A 30-day month, £200 energy. Ach, Joe and Alice are here all 30 days;
            Max is here for 10. That is 100 person-days, so Max pays 10/100 = £20 and the other
            three pay 30/100 = £60 each. The same fractions apply to every other bill.
          </p>
        </div>
        <div className="callout warn">
          <p style={{ marginBottom: 0 }}>
            <b>Every bedroom must have somebody in it, every day.</b> A bedroom is rented whether or
            not anyone sleeps in it, so leaving one unoccupied means its rent has nowhere to go — it
            gets spread across everyone and a warning appears on <b>This month</b> and{" "}
            <b>Who's here</b>. If somebody is away but still paying for their room, leave their
            stint running: that is what a stint means.
          </p>
        </div>
        <div className="dim-label" style={{ marginBottom: 7 }}>
          {monthLabel(key)} — how the split falls out
        </div>
        {live.length ? (
          live.map((p) => {
            const d = c.counts.liableDays[p.id] || 0;
            const pct = totalDays ? (d / totalDays) * 100 : 0;
            return (
              <div
                className="list-row"
                key={p.id}
                style={{
                  background: "var(--card-2)",
                  borderRadius: "var(--radius)",
                  padding: "10px 13px",
                  marginBottom: 7,
                }}
              >
                <Avatar state={state} person={p} size={26} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div className="bal-note">
                    {d} of {D} days · {pct.toFixed(1)}% of every bill
                  </div>
                </div>
                <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {money(state.currency, c.totals[p.id] || 0)}
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">Nobody has a stint this month.</div>
        )}
        <div className="helper">
          Change any of this on the <b>Who's here</b> tab — it is the only place these dates exist.
        </div>
      </Section>

      <Section
        id="setmoney"
        title="Money"
        meta={`${state.currency}${(state.rent || 0).toLocaleString()}/mo`}
        iconBg="var(--green)"
        open={!!state.sectionsOpen.setmoney}
        onToggle={() => props.onToggleSection("setmoney")}
        icon={
          <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M15 9.5A3 3 0 0 0 9 10c0 3 6 1.5 6 4.5a3 3 0 0 1-6 .5" />
            <path d="M12 6v12" />
          </Icon>
        }
      >
        <div className="list" style={{ marginBottom: 10 }}>
          <div className="list-row">
            <span className="lbl">Currency</span>
            <div className="grow" />
            <div className="field compact" style={{ width: 90 }}>
              <select
                value={state.currency}
                onChange={(e) => {
                  if (!isCurrency(e.target.value)) return;
                  const cur = e.target.value;
                  store.mutate(() => {
                    store.state.currency = cur;
                  });
                }}
              >
                <option value="£">£</option>
                <option value="$">$</option>
                <option value="€">€</option>
              </select>
            </div>
          </div>
          <div className="list-row">
            <span className="lbl">Standing monthly rent</span>
            <div className="grow" />
            <div className="field compact" style={{ width: 150 }}>
              <span className="prefix cur-symbol">{state.currency}</span>
              <input
                type="number"
                min={0}
                step={10}
                className="num-input"
                value={state.rent}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  store.mutate(() => {
                    store.state.rent = v;
                  });
                }}
              />
            </div>
          </div>
        </div>
        <div className="callout">
          <p style={{ marginBottom: 0 }}>
            <b>What the standing rent does.</b> It is the figure every <em>new</em> month starts
            from. Months already on record keep whatever they were given, so raising it after a rent
            review changes future months without rewriting your history. To change one month only,
            edit the rent on the <b>This month</b> tab instead.
          </p>
        </div>
        <div className="callout good">
          <p style={{ marginBottom: 0 }}>
            <b>Rounding.</b> Every split is worked out in pence and handed out largest-remainder
            first, so the shares always add back to the exact bill. On a £200 bill across three
            people you get £66.67, £66.67 and £66.66 — never three £66.66s with a penny missing.
          </p>
        </div>
      </Section>

      <Section
        id="setspace"
        title="Shared space & weighting"
        meta={`${fmtNum(+state.catchall || 0, 1)} m² at ${fmtNum(state.catchallWeight, 2)}×`}
        iconBg="var(--p2)"
        open={!!state.sectionsOpen.setspace}
        onToggle={() => props.onToggleSection("setspace")}
        icon={
          <Icon>
            <path d="M3 21V3h18v18z" />
            <path d="M3 15h18M9 21V9" />
          </Icon>
        }
      >
        <div className="list" style={{ marginBottom: 10 }}>
          <div className="list-row">
            <span className="lbl">Hallway / stairs area</span>
            <div className="grow" />
            <div className="field compact" style={{ width: 120 }}>
              <input
                type="number"
                step={0.01}
                className="num-input"
                value={state.catchall}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  store.mutate(() => {
                    store.state.catchall = v;
                  });
                }}
              />
              <span className="suffix">m²</span>
            </div>
          </div>
          <div className="list-row">
            <span className="lbl">Hallway weight</span>
            <div className="grow" />
            <div className="field compact" style={{ width: 120 }}>
              <input
                type="number"
                step={0.05}
                min={0}
                className="num-input"
                value={state.catchallWeight}
                onChange={(e) => {
                  let v = parseFloat(e.target.value);
                  if (!Number.isFinite(v) || v < 0) v = 0;
                  store.mutate(() => {
                    store.state.catchallWeight = v;
                  });
                }}
              />
              <span className="suffix">×</span>
            </div>
          </div>
        </div>
        <div className="callout">
          <p>
            <b>What a weight means.</b> A room's floor area is multiplied by its weight before rent
            is shared out. A weight of 1× counts every square metre in full; 0.5× counts it as half.
          </p>
          <p style={{ marginBottom: 0 }}>
            <b>Example.</b> The hallway is {fmtNum(+state.catchall || 0)} m². At{" "}
            {fmtNum(state.catchallWeight, 2)}× it enters the calculation as {fmtNum(ca)} m², so it
            accounts for {hallPct} of the rent instead of double that. Bathrooms are weighted the
            same way, on the Household tab — you pass through them, you don't live in them.
          </p>
        </div>
        <div className="helper">
          Per-room weights are on the <b>Household</b> tab, next to each room's dimensions.
        </div>
      </Section>

      <Section
        id="setlook"
        title="Appearance"
        meta={`${props.tweaks.theme} · ${props.tweaks.density}`}
        iconBg="var(--orange)"
        open={!!state.sectionsOpen.setlook}
        onToggle={() => props.onToggleSection("setlook")}
        icon={
          <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
          </Icon>
        }
      >
        <div className="list">
          <div className="list-row">
            <span className="lbl">Theme</span>
            <div className="grow" />
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
          <div className="list-row">
            <span className="lbl">Accent</span>
            <div className="grow" />
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
          <div className="list-row">
            <span className="lbl">Density</span>
            <div className="grow" />
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
        <div className="helper">
          <b>Auto</b> follows your device's light/dark setting. <b>Compact</b> shrinks the type a
          step, which helps when a month has a lot of stints. These are per-browser and are not
          shared with anyone else.
        </div>
      </Section>

      <Section
        id="data"
        title="Data, backup & sync"
        meta={`${plural(sortedMonthKeys(state).length, "month")} · ${a.shared ? "shared" : "local"}`}
        iconBg="var(--p2)"
        open={!!state.sectionsOpen.data}
        onToggle={() => props.onToggleSection("data")}
        icon={
          <Icon>
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
            <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          </Icon>
        }
      >
        <div className={`callout ${a.shared ? "good" : ""}`} style={{ marginBottom: 12 }}>
          <p>
            <b>{a.shared ? "Shared storage" : "This browser only"}</b> — {a.describe()}
          </p>
          {store.lastError ? (
            <p style={{ color: "var(--red)", marginBottom: 0 }}>
              <b>{store.lastError}</b>
            </p>
          ) : null}
          {a.shared ? (
            <div className="rowwrap" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => props.onPush()}>
                {store.pushing
                  ? "Saving…"
                  : a.autoPush
                    ? store.dirty
                      ? "Saving…"
                      : "Save now"
                    : store.dirty
                      ? "Save & share changes"
                      : "Everything is shared"}
              </button>
              {store.dirty ? (
                <span style={{ fontSize: 12.5, color: "var(--orange)", fontWeight: 600 }}>
                  unsaved changes
                </span>
              ) : null}
              {a.logout ? (
                <>
                  <div className="spacer" />
                  <button
                    className="btn-ghost btn btn-sm"
                    onClick={() => {
                      if (!confirm("Sign out of this browser?")) return;
                      props.onLogout();
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="callout good" style={{ marginBottom: 12 }}>
          <p>
            <b>Your data survives app updates.</b> Nothing you enter is stored in the page itself.
            It is saved separately under one fixed key, <code>{STORAGE_KEY}</code>, in a
            self-describing envelope:
          </p>
          <p style={{ marginBottom: 6 }}>
            <code>{`{ app: "rent-split", schema: ${SCHEMA}, savedAt: …, data: { … } }`}</code>
          </p>
          <p>
            A newer build reads the same key, sees the format number, and upgrades old saves step by
            step.
          </p>
          <p style={{ marginBottom: 0 }}>
            <b>The one thing that does break it:</b> browser storage belongs to the address it was
            saved at. Moving from a local file to <code>yourdomain.com</code> is a different
            address, so export a backup first and import it once on the new site. Same story for a
            new browser or device.
          </p>
        </div>
        <div className="rowwrap" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={() => props.onExport()}>
            Export a backup
          </button>
          <button className="btn-ghost btn" onClick={() => props.setShowImport(!props.showImport)}>
            Import / restore
          </button>
        </div>
        {props.showImport ? (
          <div>
            <textarea
              className="paste"
              placeholder="Paste a backup export from this app."
              value={props.importText}
              onChange={(e) => props.setImportText(e.target.value)}
            />
            <div className="rowwrap" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => props.onImport()}>
                Restore from this
              </button>
              <button className="btn-ghost btn btn-sm" onClick={() => props.setShowImport(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <div className="helper">
          Browser storage can be cleared by the browser without warning. Export a backup
          occasionally — it is a single text file containing every month, every stint and every
          balance.
        </div>
        <div className="row-h" style={{ marginTop: 14 }}>
          <div className="spacer" />
          <button
            className="btn-ghost btn btn-sm"
            style={{ color: "var(--red)" }}
            onClick={() => props.onReset()}
          >
            Reset everything to defaults
          </button>
        </div>
      </Section>
    </div>
  );
}
