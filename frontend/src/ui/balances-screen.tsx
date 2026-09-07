import { monthLabel } from "../domain/dates";
import { computeBalances, monthHasActuals } from "../domain/engine";
import { money, money0, payer, personById, personColor, plural, signedMoney } from "../domain/format";
import { promptSettlement } from "../domain/settle";
import { sortedMonthKeys } from "../domain/months";
import { useHousehold } from "../store/household-context";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
import { screenClass } from "./screen-class";
import { Kpi, Section } from "./section";

type BalancesScreenProps = {
  onToggleSection: (id: string) => void;
};

export function BalancesScreen(props: BalancesScreenProps) {
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

  function settle(id: string): void {
    const who = personById(state, id);
    const result = promptSettlement({
      currency: state.currency,
      personName: who ? who.name : "them",
      payerName: pay.name,
      balancePence: Math.round(bal[id] || 0),
      personId: id,
    });
    if (result.kind === "cancel") return;
    if (result.kind === "invalid") {
      store.announce(result.message);
      return;
    }
    void store.recordSettle(result.entry).then(() => store.announce(result.announce));
  }

  return (
    <div className={screenClass("balances", activeTab)} data-screen="balances">
      <div className="kpis">
        <Kpi
          label={`Owed to ${pay.name}`}
          value={money0(state.currency, owedToPayer)}
          sub="under-payments not yet settled"
        />
        <Kpi
          label={`${pay.name} owes out`}
          value={money0(state.currency, owedByPayer)}
          sub="refunds for over-payments"
        />
        <Kpi
          label="Months trued up"
          value={String(reconciledMonths.length)}
          sub={
            reconciledMonths.length
              ? `${monthLabel(reconciledMonths[0] ?? "", true)} – ${monthLabel(reconciledMonths[reconciledMonths.length - 1] ?? "", true)}`
              : "none yet"
          }
        />
      </div>

      <Section
        id="balnow"
        title="Running balances"
        meta={
          owedToPayer || owedByPayer
            ? `${money0(state.currency, owedToPayer)} in · ${money0(state.currency, owedByPayer)} out`
            : "all square"
        }
        iconBg="var(--green)"
        open={!!state.sectionsOpen.balnow}
        onToggle={() => props.onToggleSection("balnow")}
        icon={
          <Icon>
            <path d="M12 3v18" />
            <path d="M5 7h14" />
          </Icon>
        }
      >
        {!everyone.length ? (
          <div className="empty">Nobody to settle with yet.</div>
        ) : (
          everyone.map((id) => {
            const p = personById(state, id);
            const v = Math.round(bal[id] || 0);
            const gone = !p;
            const label = v > 0 ? `owes ${pay.name}` : v < 0 ? `${pay.name} owes them` : "square";
            const cls = v > 0 ? "owes" : v < 0 ? "owed" : "clear";
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
              <div className="bal-row" key={id}>
                <Avatar state={state} person={p} size={32} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {p ? p.name : "Someone who has left"}
                    {gone ? <span className="badge muted">moved out</span> : null}
                  </div>
                  <div className="bal-note">{why}</div>
                </div>
                <div>
                  <div className={`bal-amt ${cls}`}>
                    {v === 0 ? money(state.currency, 0) : money(state.currency, Math.abs(v))}
                  </div>
                  <div className="bal-note" style={{ textAlign: "right" }}>
                    {label}
                  </div>
                </div>
                {v !== 0 ? (
                  <button
                    className="btn-ghost btn btn-sm"
                    title="Settle in full or record a partial payment"
                    onClick={() => settle(id)}
                  >
                    Settle…
                  </button>
                ) : null}
              </div>
            );
          })
        )}
        <div className="helper">
          <b>{pay.name}</b> pays the landlord and every provider, so every balance is between that
          person and one other — there is never a chain of who-pays-whom. A balance appears when a
          month has been locked and its real bills have come in: the difference between what someone
          was asked for and what their share actually turned out to be. <b>Settle…</b> asks how much
          changed hands — leave the suggested amount to clear the balance in full, or type a smaller
          figure to record a <b>partial payment</b>; what is left over stays outstanding. Every
          payment, full or partial, is listed below and can be undone.
        </div>
      </Section>

      <Section
        id="balhist"
        title="Every adjustment"
        meta={plural(items.length, "entry", "entries")}
        iconBg="var(--p2)"
        open={!!state.sectionsOpen.balhist}
        onToggle={() => props.onToggleSection("balhist")}
        icon={
          <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </Icon>
        }
      >
        {!items.length ? (
          <div className="empty">
            Nothing to show yet. Lock a month and enter its realised bills.
          </div>
        ) : (
          items.slice(0, 200).map((x, i) => {
            const p = personById(state, x.personId);
            const isTrue = x.type === "trueup";
            return (
              <div
                key={x.id ?? `${x.personId}-${x.monthKey}-${i}`}
                className="list-row"
                style={{
                  background: "var(--card-2)",
                  borderRadius: "var(--radius)",
                  padding: "10px 13px",
                  marginBottom: 7,
                }}
              >
                <span
                  className="swatch"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: p ? personColor(state, p.id) : "var(--muted-2)",
                  }}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {p ? p.name : "(removed)"}{" "}
                    <span style={{ fontWeight: 500, color: "var(--muted)" }}>
                      — {isTrue ? `${monthLabel(x.monthKey)} true-up` : x.note || "settled up"}
                    </span>
                  </div>
                  <div className="bal-note">
                    {isTrue
                      ? x.amount > 0
                        ? "real bills came in higher than collected"
                        : "real bills came in lower than collected"
                      : `recorded${x.date ? " on " + x.date : ""}`}
                  </div>
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
                {x.id ? (
                  <button
                    className="btn-icon"
                    title="Undo this record"
                    onClick={() => {
                      if (!confirm("Undo this record? The balance will go back to what it was."))
                        return;
                      void store.undoSettle(x.id).then(() => store.announce("Undone."));
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
          })
        )}
        <div className="helper">
          Every true-up, settlement and manual correction, newest first. Nothing is ever silently
          overwritten — correcting a realised bill posts a fresh adjustment.
        </div>
      </Section>
    </div>
  );
}
