import { monthLabel } from "../domain/dates";
import { computeMonth, monthAllActual } from "../domain/engine";
import { money, money0, personName, plural } from "../domain/format";
import { ensureMonth, sortedMonthKeys } from "../domain/months";
import type { MonthCompute } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { Icon } from "./icon";
import { Kpi, Section } from "./section";

type HistoryScreenProps = {
  onToggleSection: (id: string) => void;
};

export function HistoryScreen(props: HistoryScreenProps) {
  const { store, state } = useHousehold();
  const keys = sortedMonthKeys(state);

  if (!keys.length) {
    return <div className={`screen${state.activeTab === "history" ? " active" : ""}`} data-screen="history" />;
  }

  const cache: Record<string, MonthCompute> = {};
  keys.forEach((k) => {
    cache[k] = computeMonth(state, k, "eff");
  });
  const ids = [...new Set(keys.flatMap((k) => Object.keys(cache[k]?.totals ?? {}).filter((id) => (cache[k]?.totals[id] ?? 0) > 0)))];
  const grand = keys.reduce((s, k) => s + (cache[k]?.grand ?? 0), 0);
  const realised = keys.filter((k) => monthAllActual(state, state.months[k]));
  const firstKey = keys[0] ?? "";
  const lastKey = keys[keys.length - 1] ?? "";

  function goToMonth(k: string): void {
    store.mutate(() => {
      store.state.currentMonth = k;
      ensureMonth(store.state, k);
    });
    store.setTab("month");
  }

  return (
    <div className={`screen${state.activeTab === "history" ? " active" : ""}`} data-screen="history">
      <div className="kpis">
        <Kpi
          label="Months on record"
          value={String(keys.length)}
          sub={`${monthLabel(firstKey, true)} – ${monthLabel(lastKey, true)}`}
        />
        <Kpi label="Total housed cost" value={money0(state.currency, grand)} sub="rent and bills, all months" />
        <Kpi label="Average month" value={money0(state.currency, grand / keys.length)} sub={`${realised.length} fully realised`} />
      </div>

      <Section
        id="hpeople"
        title="Every month, every person"
        meta={plural(keys.length, "month")}
        iconBg="var(--accent)"
        open={!!state.sectionsOpen.hpeople}
        onToggle={() => props.onToggleSection("hpeople")}
        icon={
          <Icon>
            <path d="M3 3v18h18" />
            <rect x="7" y="11" width="3" height="6" />
            <rect x="12" y="7" width="3" height="10" />
          </Icon>
        }
      >
        <div className="htable-wrap">
          <table className="htable">
            <thead>
              <tr>
                <th>Month</th>
                {ids.map((id) => (
                  <th key={id}>{personName(state, id)}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const c = cache[k];
                const done = monthAllActual(state, state.months[k]);
                const tot = ids.reduce((s, id) => s + (c?.totals[id] || 0), 0);
                return (
                  <tr key={k} style={{ cursor: "pointer", opacity: done ? undefined : 0.62 }} onClick={() => goToMonth(k)}>
                    <td>
                      {monthLabel(k)}
                      {done ? null : <span style={{ fontSize: 10.5, color: "var(--muted)" }}> est</span>}
                    </td>
                    {ids.map((id) => (
                      <td key={id}>{c?.totals[id] ? money(state.currency, c.totals[id] ?? 0) : "—"}</td>
                    ))}
                    <td className="strong">{money(state.currency, tot)}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1.5px solid var(--hairline-2)" }}>
                <td className="strong">All months</td>
                {ids.map((id) => (
                  <td className="strong" key={id}>
                    {money(
                      state.currency,
                      keys.reduce((s, k) => s + (cache[k]?.totals[id] || 0), 0),
                    )}
                  </td>
                ))}
                <td className="strong">
                  {money(
                    state.currency,
                    keys.reduce((s, k) => s + ids.reduce((a, id) => a + (cache[k]?.totals[id] || 0), 0), 0),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="helper">Tap a month to open it. Figures in a lighter tone are still estimates.</div>
      </Section>

      <Section
        id="hbills"
        title="How the bills have moved"
        iconBg="var(--orange)"
        open={!!state.sectionsOpen.hbills}
        onToggle={() => props.onToggleSection("hbills")}
        icon={
          <Icon>
            <path d="M3 17l6-6 4 4 8-8" />
          </Icon>
        }
      >
        {state.bills.length ? (
          state.bills.map((b) => {
            const vals = keys.map((k) => {
              const L = state.months[k]?.lines[b.id] ?? { est: 0, act: null };
              return { v: typeof L.act === "number" ? L.act : +L.est || 0, actual: typeof L.act === "number" };
            });
            const max = Math.max(...vals.map((v) => v.v), 1);
            const realisedVals = vals.filter((v) => v.actual).map((v) => v.v);
            const avg = realisedVals.length ? realisedVals.reduce((s, v) => s + v, 0) / realisedVals.length : 0;
            return (
              <div
                key={b.id}
                style={{ background: "var(--card-2)", borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 10 }}
              >
                <div className="row-h">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                  <div className="spacer" />
                  <div style={{ fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                    {realisedVals.length ? `avg ${state.currency}${avg.toFixed(2)} realised` : "no realised figures yet"}
                  </div>
                </div>
                <div className="trend">
                  {vals.map((v, i) => (
                    <div
                      key={keys[i]}
                      className={`trend-bar ${v.actual ? (v.v >= max ? "hi" : "") : "est"}`}
                      style={{ height: `${Math.max(2, (v.v / max) * 100)}%` }}
                      title={`${monthLabel(keys[i] ?? "")} — ${state.currency}${v.v.toFixed(2)}${v.actual ? "" : " (estimate)"}`}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--muted-2)", marginTop: 4 }}>
                  <span>{monthLabel(firstKey, true)}</span>
                  <span>{monthLabel(lastKey, true)}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">No bills configured.</div>
        )}
      </Section>
    </div>
  );
}
