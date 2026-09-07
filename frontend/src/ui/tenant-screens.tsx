import { useState } from "react";
import { promptSettlement } from "../domain/settle";
import { chargedFor, computeBalances, computeMonth, monthStatus } from "../domain/engine";
import { money, money0, payer, personById, signedMoney } from "../domain/format";
import { monthLabel } from "../domain/dates";
import { copyText } from "../lib/copy-text";
import { ensureMonth } from "../domain/months";
import { useHousehold } from "../store/household-context";
import { Icon } from "./icon";
import { PersonStatementCard } from "./person-statement";
import { screenClass } from "./screen-class";
import { Kpi, Section } from "./section";

type TenantHomeScreenProps = {
  onToggleSection: (id: string) => void;
};

export function TenantHomeScreen(props: TenantHomeScreenProps) {
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

  if (!personId || !me) {
    return (
      <div className={screenClass("home", activeTab)} data-screen="home">
        <div className="empty">
          This login is not linked to a person yet. Ask the household admin.
        </div>
      </div>
    );
  }
  const person = me;
  const myPersonId = personId;

  async function settleMine(): Promise<void> {
    const result = promptSettlement({
      currency: state.currency,
      personName: person.name,
      payerName: pay.name,
      balancePence: myBal,
      personId: myPersonId,
    });
    if (result.kind === "cancel") return;
    if (result.kind === "invalid") {
      store.announce(result.message);
      return;
    }
    await store.recordSettle(result.entry);
    store.announce(result.announce);
  }

  const paymentLine = `${monthLabel(key)} — ${me.name} ${money(state.currency, ask)}`;

  return (
    <div className={screenClass("home", activeTab)} data-screen="home">
      <div className="kpis">
        <Kpi
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
        <Kpi
          label={M.collected ? "Asked for this month" : "This month so far"}
          value={money0(state.currency, ask)}
          sub={statusLabel}
        />
        <Kpi label="Signed in as" value={me.name} sub={store.session?.username ?? ""} />
      </div>

      <Section
        id="tenanthome"
        title={`Hello ${me.name}`}
        meta={monthLabel(key)}
        iconBg="var(--accent)"
        open={state.sectionsOpen.tenanthome !== false}
        onToggle={() => props.onToggleSection("tenanthome")}
        icon={
          <Icon>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20a8 8 0 0 1 16 0" />
          </Icon>
        }
      >
        <p className="helper" style={{ marginTop: 0 }}>
          {pay.name} pays the landlord and the bills. You settle with them. This page is only your
          numbers — tap a line on the statement if you want the working.
        </p>
        <div className="row-h" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            className="btn"
            onClick={() => void copyText(paymentLine, (m) => store.announce(m))}
          >
            Copy payment line
          </button>
          {myBal !== 0 ? (
            <button className="btn-ghost btn" onClick={() => void settleMine()}>
              I paid / was refunded…
            </button>
          ) : null}
        </div>
        <PersonStatementCard state={state} personId={personId} monthKey={key} M={M} c={c} open />
      </Section>
    </div>
  );
}

type TenantMonthScreenProps = {
  onToggleSection: (id: string) => void;
};

export function TenantMonthScreen(props: TenantMonthScreenProps) {
  const { store, state, activeTab } = useHousehold();
  const personId = store.session?.personId;
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const c = computeMonth(state, key, "eff");
  if (!personId) {
    return (
      <div className={screenClass("month", activeTab)} data-screen="month">
        <div className="empty">This login is not linked to a person yet.</div>
      </div>
    );
  }
  return (
    <div className={screenClass("month", activeTab)} data-screen="month">
      <Section
        id="mstmt"
        title={monthLabel(key)}
        meta="your share only"
        iconBg="var(--p3)"
        open={!!state.sectionsOpen.mstmt}
        onToggle={() => props.onToggleSection("mstmt")}
        icon={
          <Icon>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </Icon>
        }
      >
        <PersonStatementCard state={state} personId={personId} monthKey={key} M={M} c={c} open />
      </Section>
    </div>
  );
}

export function TenantHistoryScreen() {
  const { store, state, activeTab } = useHousehold();
  const personId = store.session?.personId;
  const keys = Object.keys(state.months).sort();
  if (!personId) {
    return <div className={screenClass("history", activeTab)} data-screen="history" />;
  }
  return (
    <div className={screenClass("history", activeTab)} data-screen="history">
      <div className="htable-wrap">
        <table className="htable">
          <thead>
            <tr>
              <th>Month</th>
              <th>Your share</th>
              <th>Asked for</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const month = state.months[k];
              if (!month) return null;
              const c = computeMonth(state, k, "eff");
              const asked = month.collected ? chargedFor(state, k)[personId] || 0 : 0;
              return (
                <tr
                  key={k}
                  style={{ cursor: "pointer" }}
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
                  <td>{monthLabel(k)}</td>
                  <td>{money(state.currency, c.totals[personId] || 0)}</td>
                  <td>{month.collected ? money(state.currency, asked) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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

  if (!personId || !me) {
    return (
      <div className={screenClass("balances", activeTab)} data-screen="balances">
        <div className="empty">This login is not linked to a person yet.</div>
      </div>
    );
  }

  const person = me;
  const myPersonId = personId;

  async function settleMine(): Promise<void> {
    const result = promptSettlement({
      currency: state.currency,
      personName: person.name,
      payerName: pay.name,
      balancePence: myBal,
      personId: myPersonId,
    });
    if (result.kind === "cancel") return;
    if (result.kind === "invalid") {
      store.announce(result.message);
      return;
    }
    setBusy(true);
    try {
      await store.recordSettle(result.entry);
      store.announce(result.announce);
    } catch (e) {
      store.announce(e instanceof Error ? e.message : "Couldn't record that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={screenClass("balances", activeTab)} data-screen="balances">
      <div className="kpis">
        <Kpi
          label={
            myBal > 0 ? `You owe ${pay.name}` : myBal < 0 ? `${pay.name} owes you` : "All square"
          }
          value={money0(state.currency, Math.abs(myBal))}
          sub="running balance after true-ups"
        />
      </div>
      {myBal !== 0 ? (
        <button
          className="btn"
          disabled={busy}
          style={{ margin: "0 20px 16px" }}
          onClick={() => void settleMine()}
        >
          Record a payment…
        </button>
      ) : null}
      <div className="helper" style={{ margin: "0 20px 16px" }}>
        Recording a payment here is the same as telling {pay.name} that money changed hands. You can
        undo your own settlements; true-ups from real bills stay until the numbers change.
      </div>
      {mine.map((x, i) => {
        const isTrue = x.type === "trueup";
        return (
          <div
            key={x.id ?? `${x.monthKey}-${i}`}
            className="list-row"
            style={{
              background: "var(--card-2)",
              borderRadius: "var(--radius)",
              padding: "10px 13px",
              margin: "0 20px 7px",
            }}
          >
            <div className="grow">
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {isTrue ? `${monthLabel(x.monthKey)} true-up` : x.note || "settled up"}
              </div>
              <div className="bal-note">{x.date ? `on ${x.date}` : ""}</div>
            </div>
            <div
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                color: x.amount > 0 ? "var(--red)" : "var(--green)",
              }}
            >
              {signedMoney(state.currency, x.amount)}
            </div>
            {x.id && x.type === "settle" ? (
              <button
                className="btn-icon"
                title="Undo this record"
                onClick={() => {
                  if (!confirm("Undo this record? The balance will go back to what it was."))
                    return;
                  void store.undoSettle(x.id ?? "").then(() => store.announce("Undone."));
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
        );
      })}
    </div>
  );
}
