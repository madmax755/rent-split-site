import { useState } from "react";
import { chargedFor, computeBalances, computeMonth, monthStatus } from "../domain/engine";
import { money, money0, payer, personById, signedMoney } from "../domain/format";
import { monthLabel } from "../domain/dates";
import { copyText } from "../lib/copy-text";
import { ensureMonth } from "../domain/months";
import { useHousehold } from "../store/household-context";
import { PersonStatementCard } from "./person-statement";
import { EmptyState, KpiCard, KpiGrid, PageHeader, Panel, Screen } from "./kit";
import { SettleDialog, type SettleRequest } from "./settle-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function TenantHomeScreen() {
  const { store, state, activeTab } = useHousehold();
  const personId = store.session?.personId;
  const me = personId ? personById(state, personId) : null;
  const pay = payer(state);
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const c = computeMonth(state, key, "eff");
  const { bal } = computeBalances(state);
  const myBal = personId ? Math.round(bal[personId] || 0) : 0;
  const status = monthStatus(state, key);
  const ask = personId
    ? M.collected
      ? chargedFor(state, key)[personId] || 0
      : c.totals[personId] || 0
    : 0;
  const statusLabel = {
    projected: "Projected",
    collecting: "Awaiting real bills",
    reconciled: "Reconciled",
  }[status];
  const [settle, setSettle] = useState<SettleRequest | null>(null);

  if (!personId || !me) {
    return (
      <Screen id="home" active={activeTab === "home"}>
        <EmptyState
          title="This login is not linked to a person yet"
          description="Ask the household admin."
        />
      </Screen>
    );
  }

  const paymentLine = `${monthLabel(key)} — ${me.name} ${money(state.currency, ask)}`;

  return (
    <Screen id="home" active={activeTab === "home"}>
      <PageHeader
        title={`Hello ${me.name}`}
        description={`${pay.name} pays the landlord and the bills. You settle with them. This page is only your numbers.`}
      />
      <KpiGrid>
        <KpiCard
          label={
            myBal > 0
              ? `You owe ${pay.name}`
              : myBal < 0
                ? `${pay.name} owes you`
                : "Running balance"
          }
          value={money0(state.currency, Math.abs(myBal))}
          sub={myBal === 0 ? "all square" : "true-ups not yet settled"}
        />
        <KpiCard
          label={M.collected ? "Asked for this month" : "This month so far"}
          value={money0(state.currency, ask)}
          sub={statusLabel}
        />
        <KpiCard label="Signed in as" value={me.name} sub={store.session?.username ?? ""} />
      </KpiGrid>
      <Panel title={monthLabel(key)} description="Your share">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button onClick={() => void copyText(paymentLine, (m) => store.announce(m))}>
            Copy payment line
          </Button>
          <Button variant="outline" onClick={() => store.setTab("stints")}>
            My dates
          </Button>
          {myBal !== 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSettle({
                  currency: state.currency,
                  personName: me.name,
                  payerName: pay.name,
                  balancePence: myBal,
                  personId,
                });
              }}
            >
              I paid / was refunded
            </Button>
          ) : null}
        </div>
        <PersonStatementCard state={state} personId={personId} monthKey={key} M={M} c={c} open />
      </Panel>
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

export function TenantMonthScreen() {
  const { store, state, activeTab } = useHousehold();
  const personId = store.session?.personId;
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const c = computeMonth(state, key, "eff");
  if (!personId) {
    return (
      <Screen id="month" active={activeTab === "month"}>
        <EmptyState title="This login is not linked to a person yet." />
      </Screen>
    );
  }
  return (
    <Screen id="month" active={activeTab === "month"}>
      <PageHeader title={monthLabel(key)} description="Your share only" />
      <PersonStatementCard state={state} personId={personId} monthKey={key} M={M} c={c} open />
    </Screen>
  );
}

export function TenantHistoryScreen() {
  const { store, state, activeTab } = useHousehold();
  const personId = store.session?.personId;
  const keys = Object.keys(state.months).sort();
  if (!personId) {
    return <Screen id="history" active={activeTab === "history"} />;
  }
  return (
    <Screen id="history" active={activeTab === "history"}>
      <PageHeader title="History" description="Tap a month to open it." />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Your share</TableHead>
            <TableHead className="text-right">Asked for</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => {
            const month = state.months[k];
            if (!month) return null;
            const c = computeMonth(state, k, "eff");
            const asked = month.collected ? chargedFor(state, k)[personId] || 0 : 0;
            return (
              <TableRow
                key={k}
                className="cursor-pointer"
                onClick={() => {
                  store.mutate(
                    () => {
                      store.state.currentMonth = k;
                    },
                    { persist: false },
                  );
                  store.setTab("month");
                }}
              >
                <TableCell>{monthLabel(k)}</TableCell>
                <TableCell className="tabular-nums text-right">
                  {money(state.currency, c.totals[personId] || 0)}
                </TableCell>
                <TableCell className="tabular-nums text-right">
                  {month.collected ? money(state.currency, asked) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Screen>
  );
}

export function TenantBalancesScreen() {
  const { store, state, activeTab } = useHousehold();
  const personId = store.session?.personId;
  const me = personId ? personById(state, personId) : null;
  const pay = payer(state);
  const { bal, items } = computeBalances(state);
  const myBal = personId ? Math.round(bal[personId] || 0) : 0;
  const mine = items.filter((x) => x.personId === personId);
  const [busy, setBusy] = useState(false);
  const [settle, setSettle] = useState<SettleRequest | null>(null);

  if (!personId || !me) {
    return (
      <Screen id="balances" active={activeTab === "balances"}>
        <EmptyState title="This login is not linked to a person yet." />
      </Screen>
    );
  }

  return (
    <Screen id="balances" active={activeTab === "balances"}>
      <PageHeader
        title="Settle"
        description={`Recording a payment here is the same as telling ${pay.name} that money changed hands.`}
      />
      <KpiGrid>
        <KpiCard
          label={
            myBal > 0 ? `You owe ${pay.name}` : myBal < 0 ? `${pay.name} owes you` : "All square"
          }
          value={money0(state.currency, Math.abs(myBal))}
          sub="running balance after true-ups"
        />
      </KpiGrid>
      {myBal !== 0 ? (
        <Button
          className="mb-4"
          disabled={busy}
          onClick={() => {
            setSettle({
              currency: state.currency,
              personName: me.name,
              payerName: pay.name,
              balancePence: myBal,
              personId,
            });
          }}
        >
          Record a payment
        </Button>
      ) : null}
      <div className="grid gap-2">
        {mine.map((x, i) => {
          const isTrue = x.type === "trueup";
          return (
            <div
              key={x.id ?? `${x.monthKey}-${i}`}
              className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {isTrue ? `${monthLabel(x.monthKey)} true-up` : x.note || "settled up"}
                </div>
                <div className="text-xs text-muted-foreground">{x.date ? `on ${x.date}` : ""}</div>
              </div>
              <div
                className={cn(
                  "tabular-nums font-semibold",
                  x.amount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {signedMoney(state.currency, x.amount)}
              </div>
              {x.id && x.type === "settle" ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Undo this record"
                  onClick={() => {
                    if (!confirm("Undo this record? The balance will go back to what it was."))
                      return;
                    void store.undoSettle(x.id ?? "").then(() => store.announce("Undone."));
                  }}
                >
                  ×
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <SettleDialog
        request={settle}
        onClose={() => setSettle(null)}
        onConfirm={(outcome) => {
          setBusy(true);
          void store
            .recordSettle(outcome.entry)
            .then(() => store.announce(outcome.announce))
            .catch((e: unknown) => {
              store.announce(e instanceof Error ? e.message : "Couldn't record that.");
            })
            .finally(() => setBusy(false));
          setSettle(null);
        }}
      />
    </Screen>
  );
}
