import { useState } from "react";
import { monthLabel } from "../domain/dates";
import { computeBalances, monthHasActuals } from "../domain/engine";
import {
  money,
  money0,
  payer,
  personById,
  personColor,
  plural,
  signedMoney,
} from "../domain/format";
import { sortedMonthKeys } from "../domain/months";
import { useHousehold } from "../store/household-context";
import { Avatar } from "./avatar";
import { EmptyState, KpiCard, KpiGrid, PageHeader, Panel, Screen } from "./kit";
import { SettleDialog, type SettleRequest } from "./settle-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BalancesScreen() {
  const { store, state, activeTab } = useHousehold();
  const { bal, items } = computeBalances(state);
  const pay = payer(state);
  const ids = Object.keys(bal).filter((id) => Math.abs(bal[id] ?? 0) >= 1);
  const owedToPayer = ids
    .filter((id) => (bal[id] ?? 0) > 0)
    .reduce((s, id) => s + (bal[id] ?? 0), 0);
  const owedByPayer = ids
    .filter((id) => (bal[id] ?? 0) < 0)
    .reduce((s, id) => s - (bal[id] ?? 0), 0);
  const reconciledMonths = sortedMonthKeys(state).filter((k) => {
    const month = state.months[k];
    return month?.collected && monthHasActuals(month);
  });
  const everyone = [...new Set([...state.people.map((p) => p.id), ...Object.keys(bal)])].filter(
    (id) => id !== pay.id,
  );
  const [settle, setSettle] = useState<SettleRequest | null>(null);

  return (
    <Screen id="balances" active={activeTab === "balances"}>
      <PageHeader
        title="Settle"
        description={`${pay.name} pays the landlord and every provider. Every balance is with them — never a chain of who-pays-whom.`}
      />
      <KpiGrid>
        <KpiCard
          label={`Owed to ${pay.name}`}
          value={money0(state.currency, owedToPayer)}
          sub="under-payments not yet settled"
        />
        <KpiCard
          label={`${pay.name} owes out`}
          value={money0(state.currency, owedByPayer)}
          sub="refunds for over-payments"
        />
        <KpiCard
          label="Months trued up"
          value={String(reconciledMonths.length)}
          sub={
            reconciledMonths.length
              ? `${monthLabel(reconciledMonths[0] ?? "", true)} – ${monthLabel(reconciledMonths[reconciledMonths.length - 1] ?? "", true)}`
              : "none yet"
          }
        />
      </KpiGrid>

      <div className="grid gap-5">
        <Panel
          title="Running balances"
          description={
            owedToPayer || owedByPayer
              ? `${money0(state.currency, owedToPayer)} in · ${money0(state.currency, owedByPayer)} out`
              : "all square"
          }
        >
          {!everyone.length ? (
            <EmptyState title="Nobody to settle with yet" />
          ) : (
            <div className="grid gap-2">
              {everyone.map((id) => {
                const p = personById(state, id);
                const v = Math.round(bal[id] || 0);
                const gone = !p;
                const label =
                  v > 0 ? `owes ${pay.name}` : v < 0 ? `${pay.name} owes them` : "square";
                const mine = items.filter((x) => x.personId === id && x.type === "trueup");
                const why = mine.length
                  ? mine
                      .slice(0, 3)
                      .map(
                        (x) =>
                          `${monthLabel(x.monthKey, true)} ${signedMoney(state.currency, x.amount)}`,
                      )
                      .join(" · ") + (mine.length > 3 ? " · …" : "")
                  : "no differences yet";
                return (
                  <div
                    key={id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-3 sm:px-4"
                  >
                    <Avatar state={state} person={p} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {p ? p.name : "Someone who has left"}
                        {gone ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            moved out
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{why}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          "tabular-nums text-lg font-semibold",
                          v > 0 && "text-destructive",
                          v < 0 && "text-emerald-600 dark:text-emerald-400",
                          v === 0 && "text-muted-foreground",
                        )}
                      >
                        {v === 0 ? money(state.currency, 0) : money(state.currency, Math.abs(v))}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                    </div>
                    {v !== 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setSettle({
                            currency: state.currency,
                            personName: p ? p.name : "them",
                            payerName: pay.name,
                            balancePence: v,
                            personId: id,
                          });
                        }}
                      >
                        Settle
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Every adjustment" description={plural(items.length, "entry", "entries")}>
          {!items.length ? (
            <EmptyState
              title="Nothing to show yet"
              description="Lock a month and enter its realised bills."
            />
          ) : (
            <div className="grid gap-2">
              {items.slice(0, 200).map((x, i) => {
                const p = personById(state, x.personId);
                const isTrue = x.type === "trueup";
                return (
                  <div
                    key={x.id ?? `${x.personId}-${x.monthKey}-${i}`}
                    className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        background: p ? personColor(state, p.id) : "var(--muted-foreground)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {p ? p.name : "(removed)"}{" "}
                        <span className="font-normal text-muted-foreground">
                          — {isTrue ? `${monthLabel(x.monthKey)} true-up` : x.note || "settled up"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isTrue
                          ? x.amount > 0
                            ? "real bills came in higher than collected"
                            : "real bills came in lower than collected"
                          : `recorded${x.date ? " on " + x.date : ""}`}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "tabular-nums font-semibold",
                        x.amount > 0
                          ? "text-destructive"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {signedMoney(state.currency, x.amount)}
                    </div>
                    {x.id ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Undo this record"
                        onClick={() => {
                          if (
                            !confirm("Undo this record? The balance will go back to what it was.")
                          )
                            return;
                          void store.undoSettle(x.id).then(() => store.announce("Undone."));
                        }}
                      >
                        ×
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <SettleDialog
        request={settle}
        onClose={() => setSettle(null)}
        onConfirm={(outcome) => {
          void store.recordSettle(outcome.entry).then(() => store.announce(outcome.announce));
          setSettle(null);
        }}
      />
    </Screen>
  );
}
