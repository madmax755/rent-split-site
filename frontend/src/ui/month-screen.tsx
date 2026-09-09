import { addMonths, daySpanLabel, tenancyMonthLabel, tenancyPeriodLabel } from "../domain/dates";
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
import { fmtNum, money, money0, personName, plural, signedMoney } from "../domain/format";
import { ensureMonth, seedStints } from "../domain/months";
import type { HouseholdState, MonthCompute, MonthLine, MonthRecord } from "../domain/types";
import { copyText } from "../lib/copy-text";
import { useHousehold } from "../store/household-context";
import type { HouseholdStore } from "../store/household-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  MoneyInput,
  MonthSwitcher,
  PageHeader,
  Panel,
  Screen,
  StatusBadge,
  WarnList,
  goMonth,
} from "./kit";
import { PersonStatementCard } from "./person-statement";
import { useConfirm } from "./confirm-dialog";

export { goMonth };

function rentSplitNote(state: HouseholdState, c: MonthCompute): string {
  return `${c.rentCounts.periodLabel} · ${fmtNum(weightedAreas(state).total, 1)} m² weighted`;
}

function lineOf(M: MonthRecord, id: string): MonthLine | undefined {
  return M.lines[id];
}

export function MonthScreen() {
  const { store, state, activeTab } = useHousehold();
  const ask = useConfirm();
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const c = computeMonth(state, key, "eff");
  const D = c.chargeableDays;
  const status = monthStatus(state, key);
  const totalNights = Object.values(c.counts.liableDays).reduce((s, v) => s + v, 0);
  const liableIds = state.people.filter((p) => (c.counts.liableDays[p.id] || 0) > 0);
  const pending = state.bills.length - c.lines.filter((l) => l.isActual).length;
  const warns: string[] = [...c.warn];
  if (!liableIds.length) warns.push("Nobody is down as living here this tenancy month.");
  bedroomGaps(state, key).forEach((g) => {
    warns.push(
      `${g.name} has nobody in it on ${g.days.length === D ? "any day" : daySpanLabel(g.days)} — every bedroom should be occupied every day. Its rent is being spread across everyone instead.`,
    );
  });
  c.lines
    .filter((l) => l.fallback)
    .forEach((l) => {
      const eligible = Object.keys(l.units)
        .filter((id) => (l.units[id] ?? 0) > 0)
        .map((id) => personName(state, id));
      warns.push(
        `Nobody who pays ${l.name} was here in ${l.periodLabel}, so the whole ${money(state.currency, l.amount)} went to ${eligible.join(" and ") || "no-one"} anyway — check that's still right.`,
      );
    });

  const ids = state.people
    .filter((p) => (c.counts.liableDays[p.id] || 0) > 0 || (c.totals[p.id] || 0) !== 0)
    .map((p) => p.id);
  const stmtSum = ids.reduce((s, id) => s + (c.totals[id] || 0), 0);

  return (
    <Screen id="month" active={activeTab === "month"}>
      <PageHeader
        title="This tenancy month"
        description={`${tenancyPeriodLabel(key, state.tenancyStart)} · ${plural(liableIds.length, "person", "people")} · ${totalNights} person-days`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <MonthSwitcher />
          </div>
        }
      />
      <WarnList items={warns} />
      <KpiGrid>
        <KpiCard
          label="Total this tenancy month"
          value={money0(state.currency, c.grand)}
          sub={`${money(state.currency, c.rentPence)} rent + ${money(state.currency, c.billsTotalPence)} bills`}
        />
        <KpiCard
          label="Per person"
          value={liableIds.length ? money0(state.currency, c.grand / liableIds.length) : "—"}
          sub="average, before any split"
        />
        <KpiCard
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
        <KpiCard
          label="Cost per person-day"
          value={totalNights ? money(state.currency, c.grand / totalNights) : "—"}
          sub={`${totalNights} person-days in total`}
        />
      </KpiGrid>

      <div className="grid gap-5">
        <Panel
          title="What it cost"
          description={`${money0(state.currency, c.grand)} · ${pending ? `${pending} still estimated` : "all realised"}. Type the estimate when the tenancy month starts, and the realised figure when the bill lands.`}
        >
          <div className="hidden grid-cols-[1fr_118px_118px_92px] gap-2 px-1 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase md:grid">
            <span>Line</span>
            <span className="text-right">Estimate</span>
            <span className="text-right">Realised</span>
            <span className="text-right">Difference</span>
          </div>
          <div className="grid gap-2">
            <div className="grid items-center gap-2 rounded-xl bg-muted/50 p-3 md:grid-cols-[1fr_118px_118px_92px]">
              <div>
                <div className="font-medium">Rent</div>
                <div className="text-xs text-muted-foreground">
                  {rentSplitNote(state, c)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase md:hidden">
                  Agreed
                </div>
                <MoneyInput
                  currency={state.currency}
                  className="w-full"
                  step={10}
                  min={0}
                  value={typeof M.rent === "number" ? M.rent : state.rent}
                  onChange={(v) => {
                    store.mutate(() => {
                      ensureMonth(store.state, key).rent = typeof v === "number" ? v : 0;
                    });
                  }}
                />
              </div>
              <div className="hidden md:block" />
              <div className="text-xs text-muted-foreground md:text-right">fixed</div>
            </div>
            {state.bills.map((b) => (
              <BillRow
                key={b.id}
                monthKey={key}
                store={store}
                state={state}
                def={b}
                line={M.lines[b.id] ?? { est: b.est ?? 0, act: null }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                const prev = state.months[addMonths(key, -1)];
                if (!prev) {
                  store.announce("There's no previous tenancy month on record.");
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
                  `${plural(n, "estimate")} pulled from ${tenancyMonthLabel(addMonths(key, -1))}.`,
                );
              }}
            >
              Estimates from last month
            </Button>
          </div>
        </Panel>

        <Panel
          title="Who owes what"
          description={`${money0(state.currency, stmtSum)} across ${plural(ids.length, "person", "people")}`}
          action={
            <div className="flex flex-wrap gap-2" data-print-hide>
              <Button
                size="sm"
                onClick={() => {
                  void copyText(monthSummaryText(state, key), (m) => store.announce(m));
                }}
              >
                Copy summary
              </Button>
              <Button
                size="sm"
                variant="outline"
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
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const month = ensureMonth(state, key);
                  if (month.collected) {
                    if (
                      !(await ask({
                        title: "Unlock this tenancy month?",
                        description:
                          "It goes back to following the current rent, rooms and bills. True-ups come off the balances until you lock it again.",
                        confirmLabel: "Unlock",
                      }))
                    ) {
                      return;
                    }
                  }
                  store.mutate(() => {
                    const m = ensureMonth(store.state, key);
                    if (!m.collected) {
                      m.config = captureConfig(store.state);
                      m.charged = computeMonthInner(store.state, key, "est", m).totals;
                      m.collected = true;
                      m.chargedAt = new Date().toISOString().slice(0, 10);
                      store.announce(
                        "Locked — this tenancy month's rent, rooms, bills and people are now frozen.",
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
                {M.collected ? "Unlock collected amounts" : "Lock as collected"}
              </Button>
            </div>
          }
        >
          <Statements state={state} store={store} monthKey={key} M={M} c={c} />
          <p className="mt-3 text-xs text-muted-foreground">
            {M.collected
              ? `Locked${M.chargedAt ? ` on ${M.chargedAt}` : ""}. Differences against realised bills sit on Settle.`
              : "Locking records what everyone was actually asked for. Until you lock, the figures just move with the estimates."}
          </p>
        </Panel>

        <Panel
          title="Notes"
          description="This tenancy month only — a boiler repair, a rent review, who had guests."
        >
          <Textarea
            className="min-h-20"
            placeholder="Anything worth remembering about this tenancy month…"
            value={M.note || ""}
            onChange={(e) => {
              store.mutate(() => {
                ensureMonth(store.state, key).note = e.target.value;
              });
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2" data-print-hide>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (
                  !(await ask({
                    title: "Rebuild this tenancy month's stints?",
                    description:
                      "Any visitor stays and away periods you've entered for this tenancy month are lost.",
                    confirmLabel: "Rebuild",
                    destructive: true,
                  }))
                ) {
                  return;
                }
                store.mutate(() => {
                  seedStints(store.state, key);
                });
                store.announce("Rebuilt from the roster.");
              }}
            >
              Reset who's here from the roster
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (
                  !(await ask({
                    title: `Delete ${tenancyMonthLabel(key)}?`,
                    description: "Its bills, stints and true-ups all go.",
                    confirmLabel: "Delete month",
                    destructive: true,
                  }))
                ) {
                  return;
                }
                store.mutate(() => {
                  delete store.state.months[key];
                  ensureMonth(store.state, key);
                });
              }}
            >
              Delete this tenancy month
            </Button>
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

type BillRowProps = {
  store: HouseholdStore;
  state: HouseholdState;
  monthKey: string;
  def: { id: string; name: string };
  line: MonthLine;
};

function BillRow(props: BillRowProps) {
  const { store, state, def, line } = props;
  const range = tenancyPeriodLabel(props.monthKey, state.tenancyStart);
  const estP = Math.round((+line.est || 0) * 100);
  const actP = typeof line.act === "number" ? Math.round(line.act * 100) : null;
  const delta = actP === null ? null : actP - estP;
  const dTxt =
    delta === null ? "not in yet" : delta === 0 ? "spot on" : signedMoney(state.currency, delta);
  return (
    <div className="grid grid-cols-2 items-center gap-2 rounded-xl bg-muted/50 p-3 md:grid-cols-[1fr_118px_118px_92px]">
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 md:col-span-1">
        <span className="font-medium">{def.name}</span>
        <span className="basis-full text-xs text-muted-foreground">{range}</span>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase md:hidden">
          Estimate
        </div>
        <MoneyInput
          currency={state.currency}
          className="w-full"
          min={0}
          value={+line.est || 0}
          onChange={(v) => {
            store.mutate(() => {
              const L = lineOf(ensureMonth(store.state, props.monthKey), def.id);
              if (L) L.est = typeof v === "number" ? v : 0;
            });
          }}
        />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase md:hidden">
          Realised
        </div>
        <MoneyInput
          currency={state.currency}
          className="w-full"
          min={0}
          placeholder="—"
          value={typeof line.act === "number" ? line.act : ""}
          onChange={(v) => {
            store.mutate(() => {
              const L = lineOf(ensureMonth(store.state, props.monthKey), def.id);
              if (!L) return;
              L.act = v === "" ? null : v;
            });
          }}
        />
      </div>
      <div
        className={`col-span-2 tabular-nums text-right text-xs font-semibold md:col-span-1 ${
          delta === null || delta === 0
            ? "text-muted-foreground"
            : delta > 0
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {dTxt}
      </div>
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
      <EmptyState
        title="Nobody is living here this tenancy month"
        description="Add a stint on Who's here."
        action={
          <Button variant="outline" onClick={() => store.setTab("stints")}>
            Open Who's here
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid gap-2">
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
    </div>
  );
}
