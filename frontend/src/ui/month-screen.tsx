import {
  addMonths,
  calendarRangeLabel,
  clampCycleDay,
  daysInMonth,
  monthLabel,
  periodLabel,
} from "../domain/dates";
import {
  bedroomGaps,
  captureConfig,
  chargesUseCalendarMonth,
  computeMonth,
  computeMonthInner,
  monthAllActual,
  monthHasActuals,
  monthStatus,
  monthSummaryText,
  weightedAreas,
} from "../domain/engine";
import {
  fmtNum,
  money,
  money0,
  personName,
  plural,
  rangeText,
  signedMoney,
} from "../domain/format";
import { uid } from "../domain/ids";
import { ensureMonth, seedStints } from "../domain/months";
import type { HouseholdState, MonthCompute, MonthLine, MonthRecord } from "../domain/types";
import { copyText } from "../lib/copy-text";
import { useHousehold } from "../store/household-context";
import type { HouseholdStore } from "../store/household-store";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const bits = [
    `${c.rentCounts.periodLabel} · ${fmtNum(weightedAreas(state).total, 1)} m² weighted`,
  ];
  if (c.carryOutPence > 0) {
    bits.push(
      `${money(state.currency, c.rentPence)} of ${money(state.currency, c.agreedRentPence)} this month · ${money(state.currency, c.carryOutPence)} carries into ${monthLabel(addMonths(c.key, 1))}`,
    );
  } else if (c.carryInPence > 0) {
    bits.push(
      `${money(state.currency, c.agreedRentPence)} plus ${money(state.currency, c.carryInPence)} from ${monthLabel(addMonths(c.key, -1))}`,
    );
  }
  return bits.join(" · ");
}

function lineOf(M: MonthRecord, id: string, isOneOff: boolean): MonthLine | undefined {
  return isOneOff ? (M.oneOffs || []).find((x) => x.id === id) : M.lines[id];
}

export function MonthScreen() {
  const { store, state, activeTab } = useHousehold();
  const ask = useConfirm();
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const D = daysInMonth(key);
  const c = computeMonth(state, key, "eff");
  const status = monthStatus(state, key);
  const totalNights = Object.values(c.counts.liableDays).reduce((s, v) => s + v, 0);
  const liableIds = state.people.filter((p) => (c.counts.liableDays[p.id] || 0) > 0);
  const pending =
    state.bills.length + (M.oneOffs || []).length - c.lines.filter((l) => l.isActual).length;
  const warns: string[] = [...c.warn];
  if (!liableIds.length) warns.push("Nobody is down as living here this month.");
  bedroomGaps(state, key).forEach((g) => {
    warns.push(
      `${g.name} has nobody in it on ${g.days.length === D ? "any day" : "day " + rangeText(g.days)} — every bedroom should be occupied every day. Its rent is being spread across everyone instead.`,
    );
  });
  c.lines
    .filter((l) => l.fallback)
    .forEach((l) => {
      const eligible = Object.keys(l.units)
        .filter((id) => (l.units[id] ?? 0) > 0)
        .map((id) => personName(state, id));
      warns.push(
        `Nobody who pays ${l.name} was here ${l.cycleStartDay === 1 ? "this month" : `in ${l.periodLabel}`}, so the whole ${money(state.currency, l.amount)} went to ${eligible.join(" and ") || "no-one"} anyway — check that's still right.`,
      );
    });

  const ids = state.people
    .filter((p) => (c.counts.liableDays[p.id] || 0) > 0 || (c.totals[p.id] || 0) !== 0)
    .map((p) => p.id);
  const stmtSum = ids.reduce((s, id) => s + (c.totals[id] || 0), 0);

  return (
    <Screen id="month" active={activeTab === "month"}>
      <PageHeader
        title="This month"
        description={`${D} days · ${plural(liableIds.length, "person", "people")} · ${totalNights} person-days`}
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
          label="Total this month"
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
          description={`${money0(state.currency, c.grand)} · ${pending ? `${pending} still estimated` : "all realised"}. Type the estimate when the month starts, and the realised figure when the bill lands.`}
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
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
              Add one-off charge
            </Button>
            <Button
              variant="ghost"
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
            </Button>
          </div>
          {chargesUseCalendarMonth(state) ? null : (
            <p className="mt-3 text-xs text-muted-foreground">
              Everyone's share is worked out on the calendar month. Date ranges under bills are when
              that payment runs, not the days the split uses.
            </p>
          )}
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
                        title: "Unlock this month?",
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
          description="This month only — a boiler repair, a rent review, who had guests."
        >
          <Textarea
            className="min-h-20"
            placeholder="Anything worth remembering about this month…"
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
                    title: "Rebuild this month's stints?",
                    description:
                      "Any visitor stays and away periods you've entered for this month are lost.",
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
                    title: `Delete ${monthLabel(key)}?`,
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
              Delete this month
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
  def: { id: string; name: string; cycleStartDay?: number };
  line: MonthLine;
  oneOff: boolean;
};

function BillRow(props: BillRowProps) {
  const { store, state, def, line, oneOff } = props;
  const cycleDay = oneOff ? 1 : clampCycleDay(def.cycleStartDay ?? 1);
  const calendar = calendarRangeLabel(props.monthKey, state.tenancyStart);
  const range =
    cycleDay === 1 ? calendar : `${calendar} · paid ${periodLabel(props.monthKey, cycleDay)}`;
  const estP = Math.round((+line.est || 0) * 100);
  const actP = typeof line.act === "number" ? Math.round(line.act * 100) : null;
  const delta = actP === null ? null : actP - estP;
  const dTxt =
    delta === null ? "not in yet" : delta === 0 ? "spot on" : signedMoney(state.currency, delta);
  return (
    <div
      className={`grid grid-cols-2 items-center gap-2 rounded-xl p-3 md:grid-cols-[1fr_118px_118px_92px] ${oneOff ? "bg-primary/5" : "bg-muted/50"}`}
    >
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 md:col-span-1">
        {oneOff ? (
          <Input
            type="text"
            className="min-w-32 flex-1 border-transparent bg-transparent px-1 font-medium shadow-none"
            value={def.name}
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
          <span className="font-medium">{def.name}</span>
        )}
        {oneOff ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-sm:size-10"
            title="Remove"
            onClick={() => {
              store.mutate(() => {
                const month = ensureMonth(store.state, props.monthKey);
                month.oneOffs = (month.oneOffs || []).filter((x) => x.id !== def.id);
              });
            }}
          >
            <XIcon />
          </Button>
        ) : null}
        <span className="basis-full text-xs text-muted-foreground">{range}</span>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase md:hidden">
          Estimate
        </div>
        <MoneyInput
          currency={state.currency}
          className="w-full"
          min={oneOff ? undefined : 0}
          value={+line.est || 0}
          onChange={(v) => {
            store.mutate(() => {
              const L = lineOf(ensureMonth(store.state, props.monthKey), def.id, oneOff);
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
          min={oneOff ? undefined : 0}
          placeholder="—"
          value={typeof line.act === "number" ? line.act : ""}
          onChange={(v) => {
            store.mutate(() => {
              const L = lineOf(ensureMonth(store.state, props.monthKey), def.id, oneOff);
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
        title="Nobody is living here this month"
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
