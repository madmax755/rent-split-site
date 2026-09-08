import { monthLabel } from "../domain/dates";
import { computeMonth, monthAllActual } from "../domain/engine";
import { money, money0, personName, plural } from "../domain/format";
import { ensureMonth, sortedMonthKeys } from "../domain/months";
import type { MonthCompute } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { KpiCard, KpiGrid, PageHeader, Panel, Screen } from "./kit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function HistoryScreen() {
  const { store, state, activeTab } = useHousehold();
  const keys = sortedMonthKeys(state);

  if (!keys.length) {
    return <Screen id="history" active={activeTab === "history"} />;
  }

  const cache: Record<string, MonthCompute> = {};
  keys.forEach((k) => {
    cache[k] = computeMonth(state, k, "eff");
  });
  const ids = [
    ...new Set(
      keys.flatMap((k) =>
        Object.keys(cache[k]?.totals ?? {}).filter((id) => (cache[k]?.totals[id] ?? 0) > 0),
      ),
    ),
  ];
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
    <Screen id="history" active={activeTab === "history"}>
      <PageHeader
        title="History"
        description="Tap a month to open it. Lighter figures are still estimates."
      />
      <KpiGrid>
        <KpiCard
          label="Months on record"
          value={String(keys.length)}
          sub={`${monthLabel(firstKey, true)} – ${monthLabel(lastKey, true)}`}
        />
        <KpiCard
          label="Total housed cost"
          value={money0(state.currency, grand)}
          sub="rent and bills, all months"
        />
        <KpiCard
          label="Average month"
          value={money0(state.currency, grand / keys.length)}
          sub={`${realised.length} fully realised`}
        />
      </KpiGrid>

      <div className="grid gap-5">
        <Panel title="Every month, every person" description={plural(keys.length, "month")}>
          <div className="grid gap-2 md:hidden">
            {keys.map((k) => {
              const c = cache[k];
              const done = monthAllActual(state, state.months[k]);
              const tot = ids.reduce((s, id) => s + (c?.totals[id] || 0), 0);
              return (
                <button
                  key={k}
                  type="button"
                  className={`rounded-xl bg-muted/50 p-3 text-left ${done ? "" : "opacity-70"}`}
                  onClick={() => goToMonth(k)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {monthLabel(k)}
                      {done ? null : (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          est
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-sm font-semibold">
                      {money(state.currency, tot)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {ids
                      .map((id) =>
                        c?.totals[id]
                          ? `${personName(state, id)} ${money(state.currency, c.totals[id] ?? 0)}`
                          : null,
                      )
                      .filter((x): x is string => x !== null)
                      .join(" · ")}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hidden md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {ids.map((id) => (
                  <TableHead key={id} className="text-right">
                    {personName(state, id)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => {
                const c = cache[k];
                const done = monthAllActual(state, state.months[k]);
                const tot = ids.reduce((s, id) => s + (c?.totals[id] || 0), 0);
                return (
                  <TableRow
                    key={k}
                    className={`cursor-pointer ${done ? "" : "opacity-60"}`}
                    onClick={() => goToMonth(k)}
                  >
                    <TableCell>
                      {monthLabel(k)}
                      {done ? null : (
                        <span className="ml-1 text-[10px] text-muted-foreground">est</span>
                      )}
                    </TableCell>
                    {ids.map((id) => (
                      <TableCell key={id} className="tabular-nums text-right">
                        {c?.totals[id] ? money(state.currency, c.totals[id] ?? 0) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="tabular-nums text-right font-semibold">
                      {money(state.currency, tot)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell className="font-semibold">All months</TableCell>
                {ids.map((id) => (
                  <TableCell key={id} className="tabular-nums text-right font-semibold">
                    {money(
                      state.currency,
                      keys.reduce((s, k) => s + (cache[k]?.totals[id] || 0), 0),
                    )}
                  </TableCell>
                ))}
                <TableCell className="tabular-nums text-right font-semibold">
                  {money(
                    state.currency,
                    keys.reduce(
                      (s, k) => s + ids.reduce((a, id) => a + (cache[k]?.totals[id] || 0), 0),
                      0,
                    ),
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel title="How the bills have moved">
          {state.bills.length ? (
            <div className="grid gap-3">
              {state.bills.map((b) => {
                const vals = keys.map((k) => {
                  const L = state.months[k]?.lines[b.id] ?? { est: 0, act: null };
                  return {
                    v: typeof L.act === "number" ? L.act : +L.est || 0,
                    actual: typeof L.act === "number",
                  };
                });
                const max = Math.max(...vals.map((v) => v.v), 1);
                const realisedVals = vals.filter((v) => v.actual).map((v) => v.v);
                const avg = realisedVals.length
                  ? realisedVals.reduce((s, v) => s + v, 0) / realisedVals.length
                  : 0;
                return (
                  <div key={b.id} className="rounded-xl bg-muted/50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium">{b.name}</div>
                      <div className="tabular-nums text-xs text-muted-foreground">
                        {realisedVals.length
                          ? `avg ${state.currency}${avg.toFixed(2)} realised`
                          : "no realised figures yet"}
                      </div>
                    </div>
                    <div className="flex h-11 items-end gap-0.5">
                      {vals.map((v, i) => (
                        <div
                          key={keys[i]}
                          title={`${monthLabel(keys[i] ?? "")} — ${state.currency}${v.v.toFixed(2)}${v.actual ? "" : " (estimate)"}`}
                          className={`min-h-0.5 flex-1 rounded-t-sm ${
                            v.actual
                              ? v.v >= max
                                ? "bg-primary"
                                : "bg-primary/40"
                              : "bg-primary/20"
                          }`}
                          style={{ height: `${Math.max(4, (v.v / max) * 100)}%` }}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>{monthLabel(firstKey, true)}</span>
                      <span>{monthLabel(lastKey, true)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bills configured.</p>
          )}
        </Panel>
      </div>
    </Screen>
  );
}
