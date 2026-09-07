import { addMonths, daysInMonth, monthLabel } from "../domain/dates";
import {
  bedroomGaps,
  captureConfig,
  computeMonth,
  computeMonthInner,
  monthAllActual,
  monthHasActuals,
  monthStatus,
  monthSummaryText,
  weightedAreas,
} from "../domain/engine";
import { fmtNum, money, money0, personName, plural, rangeText, signedMoney } from "../domain/format";
import { uid } from "../domain/ids";
import { ensureMonth, seedStints } from "../domain/months";
import type { HouseholdState, MonthCompute, MonthLine, MonthRecord } from "../domain/types";
import { copyText } from "../lib/copy-text";
import { useHousehold } from "../store/household-context";
import type { HouseholdStore } from "../store/household-store";
import { Icon } from "./icon";
import { PersonStatementCard } from "./person-statement";
import { screenClass } from "./screen-class";
import { Kpi, Section } from "./section";

function lineOf(M: MonthRecord, id: string, isOneOff: boolean): MonthLine | undefined {
  return isOneOff ? (M.oneOffs || []).find((x) => x.id === id) : M.lines[id];
}

type MonthScreenProps = {
  onToggleSection: (id: string) => void;
};

export function MonthScreen(props: MonthScreenProps) {
  const { store, state, activeTab } = useHousehold();
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const D = daysInMonth(key);
  const c = computeMonth(state, key, "eff");
  const status = monthStatus(state, key);
  const totalNights = Object.values(c.counts.liableDays).reduce((s, v) => s + v, 0);
  const liableIds = state.people.filter((p) => (c.counts.liableDays[p.id] || 0) > 0);
  const sub = `${D} days · ${plural(liableIds.length, "person", "people")} · ${totalNights} person-days`;
  const pending =
    state.bills.length + (M.oneOffs || []).length - c.lines.filter((l) => l.isActual).length;
  const statusLabel = {
    projected: "Projected",
    collecting: "Awaiting real bills",
    reconciled: "Reconciled",
  }[status];

  const warns: Array<{ html: boolean; text: string }> = c.warn.map((w) => ({
    html: false,
    text: w,
  }));
  if (!liableIds.length)
    warns.push({ html: false, text: "Nobody is down as living here this month." });
  bedroomGaps(state, key).forEach((g) => {
    warns.push({
      html: true,
      text: `<b>${escapeHtml(g.name)}</b> has nobody in it on ${g.days.length === D ? "any day" : "day " + rangeText(g.days)} — every bedroom should be occupied every day. Its rent is being spread across everyone instead.`,
    });
  });
  c.lines
    .filter((l) => l.fallback)
    .forEach((l) => {
      const eligible = Object.keys(l.units)
        .filter((id) => (l.units[id] ?? 0) > 0)
        .map((id) => personName(state, id));
      warns.push({
        html: true,
        text: `Nobody who pays <b>${escapeHtml(l.name)}</b> was here this month, so the whole ${money(state.currency, l.amount)} went to ${escapeHtml(eligible.join(" and ") || "no-one")} anyway — check that's still right.`,
      });
    });

  const ids = state.people
    .filter((p) => (c.counts.liableDays[p.id] || 0) > 0 || (c.totals[p.id] || 0) !== 0)
    .map((p) => p.id);
  const stmtSum = ids.reduce((s, id) => s + (c.totals[id] || 0), 0);

  return (
    <div className={screenClass("month", activeTab)} data-screen="month">
      <div className="monthbar">
        <button className="iconbtn" title="Previous month" onClick={() => goMonth(store, -1)}>
          <Icon strokeWidth={2.5}>
            <path d="M15 6l-6 6 6 6" />
          </Icon>
        </button>
        <div className="month-label">
          <span>{monthLabel(key)}</span>
          <span className={`status-pill ${status}`}>{statusLabel}</span>
          <span className="sub">{sub}</span>
        </div>
        <input
          type="month"
          className="month-jump"
          value={key}
          onChange={(e) => {
            if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
            store.mutate(() => {
              store.state.currentMonth = e.target.value;
              ensureMonth(store.state, store.state.currentMonth);
            });
          }}
        />
        <button className="iconbtn" title="Next month" onClick={() => goMonth(store, 1)}>
          <Icon strokeWidth={2.5}>
            <path d="M9 6l6 6-6 6" />
          </Icon>
        </button>
      </div>

      <div className="stack" style={{ marginBottom: 12 }}>
        {warns.map((w, i) =>
          w.html ? (
            <div
              key={i}
              className="badge warn"
              style={{ display: "inline-block" }}
              dangerouslySetInnerHTML={{ __html: w.text }}
            />
          ) : (
            <div key={i} className="badge warn" style={{ display: "inline-block" }}>
              {w.text}
            </div>
          ),
        )}
      </div>

      <div className="kpis">
        <Kpi
          label="Total this month"
          value={money0(state.currency, c.grand)}
          sub={`${money(state.currency, c.rentPence)} rent + ${money(state.currency, c.billsTotalPence)} bills`}
        />
        <Kpi
          label="Per person"
          value={liableIds.length ? money0(state.currency, c.grand / liableIds.length) : "—"}
          sub="average, before any split"
        />
        <Kpi
          label="Bills"
          value={money0(state.currency, c.billsTotalPence)}
          sub={
            monthAllActual(state, M)
              ? "all realised"
              : monthHasActuals(M)
                ? "partly realised"
                : "still estimated"
          }
        />
        <Kpi
          label="Cost per person-day"
          value={totalNights ? money(state.currency, c.grand / totalNights) : "—"}
          sub={`${totalNights} person-days in total`}
        />
      </div>

      <Section
        id="mbills"
        title="What it cost"
        meta={`${money0(state.currency, c.grand)} · ${pending ? `${pending} still estimated` : "all realised"}`}
        iconBg="var(--p3)"
        open={!!state.sectionsOpen.mbills}
        onToggle={() => props.onToggleSection("mbills")}
        icon={
          <Icon>
            <path d="M5 3h12a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 1-2z" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </Icon>
        }
      >
        <div className="bg-head">
          <span>Line</span>
          <span>Estimate</span>
          <span>Realised</span>
          <span>Difference</span>
        </div>
        <div>
          <div
            className="bg-row"
            style={{ background: "var(--card-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          >
            <div className="bg-name">Rent</div>
            <div className="bg-num">
              <div className="minilabel">Agreed</div>
              <div className="field compact">
                <span className="prefix cur-symbol">{state.currency}</span>
                <input
                  type="number"
                  step={10}
                  min={0}
                  className="num-input"
                  value={typeof M.rent === "number" ? M.rent : state.rent}
                  onChange={(e) => {
                    store.mutate(() => {
                      ensureMonth(store.state, key).rent = parseFloat(e.target.value) || 0;
                    });
                  }}
                />
              </div>
            </div>
            <div className="bg-num">
              <div className="minilabel">&nbsp;</div>
              <div
                style={{ fontSize: 12.5, color: "var(--muted)", paddingTop: 8, textAlign: "right" }}
              >
                {fmtNum(weightedAreas(state).total, 1)} m² weighted
              </div>
            </div>
            <div className="bg-delta none">fixed</div>
          </div>
          {state.bills.map((b) => (
            <BillRow
              key={b.id}
              monthKey={key}
              store={store}
              state={state}
              def={b}
              line={M.lines[b.id] ?? { est: b.est ?? 0, act: null }}
              oneOff={false}
            />
          ))}
          {(M.oneOffs || []).map((x) => (
            <BillRow
              key={x.id}
              monthKey={key}
              store={store}
              state={state}
              def={x}
              line={x}
              oneOff
            />
          ))}
        </div>
        <div className="rowwrap" style={{ marginTop: 10 }}>
          <button
            className="btn-add"
            style={{ width: "auto" }}
            onClick={() => {
              store.mutate(() => {
                const month = ensureMonth(store.state, key);
                month.oneOffs = month.oneOffs || [];
                month.oneOffs.push({
                  id: uid("oo"),
                  name: "One-off charge",
                  est: 0,
                  act: null,
                  payers: null,
                });
              });
            }}
          >
            ＋ One-off charge
          </button>
          <div className="spacer" />
          <button
            className="btn-ghost btn btn-sm"
            title="Copy last month's realised figures in as this month's estimates"
            onClick={() => {
              const prev = state.months[addMonths(key, -1)];
              if (!prev) {
                store.announce("There's no previous month on record.");
                return;
              }
              let n = 0;
              store.mutate(() => {
                const month = ensureMonth(store.state, key);
                store.state.bills.forEach((b) => {
                  const pl = prev.lines[b.id];
                  const line = month.lines[b.id];
                  if (!line) return;
                  if (pl && typeof pl.act === "number") {
                    line.est = pl.act;
                    n++;
                  } else if (pl) {
                    line.est = +pl.est || 0;
                    n++;
                  }
                });
              });
              store.announce(
                `${plural(n, "estimate")} pulled from ${monthLabel(addMonths(key, -1))}.`,
              );
            }}
          >
            Estimates from last month
          </button>
        </div>
        <div className="helper">
          Type the <b>estimate</b> (what the direct debit takes) when the month starts, and the{" "}
          <b>realised</b> figure when the real bill lands. Everything splits on the realised figure
          once it exists, and the difference is trued up on the Balances tab.
        </div>
      </Section>

      <Section
        id="mstmt"
        title="Who owes what"
        meta={`${money0(state.currency, stmtSum)} across ${plural(ids.length, "person", "people")}`}
        iconBg="var(--accent)"
        open={!!state.sectionsOpen.mstmt}
        onToggle={() => props.onToggleSection("mstmt")}
        icon={
          <Icon>
            <path d="M4 4h16v16H4z" />
            <path d="M8 9h8M8 13h8M8 17h4" />
          </Icon>
        }
      >
        <Statements state={state} store={store} monthKey={key} M={M} c={c} />
        <div className="rowwrap" style={{ marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => {
              void copyText(monthSummaryText(state, key), (m) => store.announce(m));
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            Copy summary
          </button>
          <button
            className="btn-ghost btn"
            onClick={() => {
              store.mutate(
                () => {
                  store.state.people.forEach((p) => {
                    store.state.openStatements[p.id] = true;
                  });
                },
                { persist: false },
              );
              setTimeout(() => window.print(), 120);
            }}
          >
            Print / PDF
          </button>
          <div className="spacer" />
          <button
            className="btn-ghost btn btn-sm"
            onClick={() => {
              const month = ensureMonth(state, key);
              if (month.collected) {
                if (
                  !confirm(
                    "Unlock? This month goes back to following the current rent, rooms and bills, and its true-ups come off the balances until you lock it again.",
                  )
                )
                  return;
              }
              store.mutate(() => {
                const m = ensureMonth(store.state, key);
                if (!m.collected) {
                  m.config = captureConfig(store.state);
                  m.charged = computeMonthInner(store.state, key, "est", m).totals;
                  m.collected = true;
                  m.chargedAt = new Date().toISOString().slice(0, 10);
                  store.announce(
                    "Locked — this month's rent, rooms, bills and people are now frozen.",
                  );
                } else {
                  m.collected = false;
                  m.charged = null;
                  m.chargedAt = "";
                  m.config = null;
                }
              });
            }}
          >
            {M.collected ? "Unlock the collected amounts" : "Lock these as the amounts collected"}
          </button>
        </div>
        <div className="helper">
          {M.collected ? (
            <>
              Locked{M.chargedAt ? ` on ${M.chargedAt}` : ""}. Everyone was asked for the amounts
              shown in each person's breakdown under <b>Asked for at the time</b>. Any difference
              against the realised bills is sitting on the Balances tab.
            </>
          ) : (
            "Locking records what everyone was actually asked for. Once the real bills land, the difference between the two is trued up automatically on the Balances tab. Until you lock, the figures just move with the estimates."
          )}
        </div>
      </Section>

      <Section
        id="mnote"
        title="Notes & month settings"
        iconBg="var(--muted)"
        open={!!state.sectionsOpen.mnote}
        onToggle={() => props.onToggleSection("mnote")}
        icon={
          <Icon>
            <path d="M4 4h16v16H4z" />
            <path d="M8 8h8M8 12h8M8 16h4" />
          </Icon>
        }
      >
        <div className="helper" style={{ marginTop: 0, marginBottom: 10 }}>
          This month's rent is the first row of <b>What it cost</b> above. It overrides the standing
          rent from Settings for this month only.
        </div>
        <textarea
          className="paste"
          placeholder="Anything worth remembering about this month — a boiler repair, a rent review, who had guests…"
          style={{ minHeight: 76, fontFamily: "inherit", fontSize: 14 }}
          value={M.note || ""}
          onChange={(e) => {
            store.mutate(() => {
              ensureMonth(store.state, key).note = e.target.value;
            });
          }}
        />
        <div className="rowwrap" style={{ marginTop: 10 }}>
          <button
            className="btn-ghost btn btn-sm"
            onClick={() => {
              if (
                !confirm(
                  "Rebuild this month's stints from the roster? Any visitor stays and away periods you've entered for this month are lost.",
                )
              )
                return;
              store.mutate(() => {
                seedStints(store.state, key);
              });
              store.announce("Rebuilt from the roster.");
            }}
          >
            Reset who's here from the roster
          </button>
          <button
            className="btn-ghost btn btn-sm"
            style={{ color: "var(--red)" }}
            onClick={() => {
              if (
                !confirm(
                  `Delete ${monthLabel(key)} entirely? Its bills, stints and true-ups all go.`,
                )
              )
                return;
              store.mutate(() => {
                delete store.state.months[key];
                ensureMonth(store.state, key);
              });
            }}
          >
            Delete this month
          </button>
        </div>
      </Section>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function goMonth(store: HouseholdStore, delta: number): void {
  store.mutate(() => {
    store.state.currentMonth = addMonths(store.state.currentMonth, delta);
    ensureMonth(store.state, store.state.currentMonth);
  });
}

export { goMonth };

type BillRowProps = {
  store: HouseholdStore;
  state: HouseholdState;
  monthKey: string;
  def: { id: string; name: string };
  line: MonthLine;
  oneOff: boolean;
};

function BillRow(props: BillRowProps) {
  const { store, state, def, line, oneOff } = props;
  const estP = Math.round((+line.est || 0) * 100);
  const actP = typeof line.act === "number" ? Math.round(line.act * 100) : null;
  const delta = actP === null ? null : actP - estP;
  const dCls = delta === null ? "none" : delta > 0 ? "up" : delta < 0 ? "down" : "none";
  const dTxt =
    delta === null ? "not in yet" : delta === 0 ? "spot on" : signedMoney(state.currency, delta);
  return (
    <div className={`bg-row${oneOff ? " oneoff" : ""}`}>
      <div className="bg-name">
        {oneOff ? (
          <input
            type="text"
            value={def.name}
            style={{ fontWeight: 600, fontSize: 14.5, maxWidth: 190 }}
            onChange={(e) => {
              store.mutate(() => {
                const x = (ensureMonth(store.state, props.monthKey).oneOffs || []).find(
                  (o) => o.id === def.id,
                );
                if (x) x.name = e.target.value;
              });
            }}
          />
        ) : (
          def.name
        )}
        {oneOff ? (
          <button
            className="btn-icon"
            title="Remove"
            onClick={() => {
              store.mutate(() => {
                const month = ensureMonth(store.state, props.monthKey);
                month.oneOffs = (month.oneOffs || []).filter((x) => x.id !== def.id);
              });
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        ) : null}
      </div>
      <div className="bg-num">
        <div className="minilabel">Estimate</div>
        <div className="field compact">
          <span className="prefix cur-symbol">{state.currency}</span>
          <input
            type="number"
            step={0.01}
            min={oneOff ? undefined : 0}
            className="num-input"
            value={+line.est || 0}
            onChange={(e) => {
              store.mutate(() => {
                const L = lineOf(ensureMonth(store.state, props.monthKey), def.id, oneOff);
                if (L) L.est = parseFloat(e.target.value) || 0;
              });
            }}
          />
        </div>
      </div>
      <div className="bg-num">
        <div className="minilabel">Realised</div>
        <div className="field compact">
          <span className="prefix cur-symbol">{state.currency}</span>
          <input
            type="number"
            step={0.01}
            min={oneOff ? undefined : 0}
            className="num-input"
            value={typeof line.act === "number" ? line.act : ""}
            placeholder="—"
            onChange={(e) => {
              store.mutate(() => {
                const L = lineOf(ensureMonth(store.state, props.monthKey), def.id, oneOff);
                if (!L) return;
                const v = e.target.value.trim();
                L.act = v === "" ? null : parseFloat(v) || 0;
              });
            }}
          />
        </div>
      </div>
      <div className={`bg-delta ${dCls}`}>{dTxt}</div>
    </div>
  );
}

function Statements(props: {
  state: HouseholdState;
  store: HouseholdStore;
  monthKey: string;
  M: MonthRecord;
  c: MonthCompute;
}) {
  const { state, store, monthKey, M, c } = props;
  const ids = state.people
    .filter((p) => (c.counts.liableDays[p.id] || 0) > 0 || (c.totals[p.id] || 0) !== 0)
    .map((p) => p.id);
  if (!ids.length) {
    return (
      <div className="empty">
        Nobody is living here this month. Add a stint on the <b>Who's here</b> tab.
      </div>
    );
  }
  return (
    <>
      {ids.map((id) => (
        <PersonStatementCard
          key={id}
          state={state}
          personId={id}
          monthKey={monthKey}
          M={M}
          c={c}
          open={!!state.openStatements[id]}
          onToggle={() => {
            store.mutate(
              () => {
                store.state.openStatements[id] = !store.state.openStatements[id];
              },
              { persist: false },
            );
          }}
        />
      ))}
    </>
  );
}
