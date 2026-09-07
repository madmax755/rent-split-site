import { daysInMonth, monthLabel } from "../domain/dates";
import { chargedFor, monthAllActual, monthHasActuals } from "../domain/engine";
import { money, personById, plural, signedMoney } from "../domain/format";
import type { HouseholdState, MonthCompute, MonthRecord } from "../domain/types";
import { Avatar } from "./avatar";

type PersonStatementCardProps = {
  state: HouseholdState;
  personId: string;
  monthKey: string;
  M: MonthRecord;
  c: MonthCompute;
  open: boolean;
  onToggle?: () => void;
};

export function PersonStatementCard(props: PersonStatementCardProps) {
  const { state, personId, monthKey, M, c, open } = props;
  const p = personById(state, personId);
  if (!p) return null;
  const D = daysInMonth(monthKey);
  const liable = c.counts.liableDays[personId] || 0;
  const nights = liable;
  const total = c.totals[personId] || 0;
  const roomsUsed: Record<string, number> = {};
  let sharedDays = 0;
  c.counts.days.forEach((day) => {
    Object.keys(day.rooms).forEach((rid) => {
      const occ = day.rooms[rid] ?? [];
      if (!occ.includes(personId)) return;
      roomsUsed[rid] = (roomsUsed[rid] || 0) + 1;
      if (occ.length > 1) sharedDays += 1;
    });
  });
  const roomName = (id: string) => state.rooms.find((r) => r.id === id)?.name || "—";
  const sharedNames = state.rooms.filter((r) => r.communal).map((r) => r.name);
  const roomTxt =
    Object.keys(roomsUsed)
      .map(
        (rid) => `${roomName(rid)}${(roomsUsed[rid] ?? 0) < liable ? ` (${roomsUsed[rid]}d)` : ""}`,
      )
      .join(", ") || "no room";
  const perNight = nights ? total / nights : 0;
  const charged = M.collected ? chargedFor(state, monthKey) : null;
  const was = charged ? charged[personId] || 0 : 0;
  const diff = total - was;
  const clickable = !!props.onToggle;

  return (
    <div className={`stmt-card${open ? " open" : ""}`}>
      <div
        className="stmt-head"
        onClick={clickable ? props.onToggle : undefined}
        style={clickable ? undefined : { cursor: "default" }}
      >
        <Avatar state={state} person={p} size={34} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="stmt-name">
            {p.name}
            {p.isPayer ? (
              <span className="badge ok" style={{ marginLeft: 4 }}>
                pays the bills
              </span>
            ) : null}
          </div>
          <div className="stmt-sub">
            here {liable} of {D} days
            {perNight ? ` · ${money(state.currency, perNight)} per day` : ""}
          </div>
        </div>
        <div className="stmt-amt">
          <b>{money(state.currency, total)}</b>
          <span>{monthAllActual(state, M) ? "realised" : "estimated"}</span>
        </div>
        {clickable ? (
          <svg
            className="chev"
            style={{
              transform: `rotate(${open ? 90 : 0}deg)`,
              width: 18,
              height: 18,
              color: "var(--muted-2)",
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        ) : null}
      </div>
      <div className="stmt-body">
        <div className="lineitem">
          <span className="li-name">Bedroom</span>
          <span className="li-how">
            {roomTxt}
            {sharedDays ? ` · shared on ${plural(sharedDays, "day")}` : ""} · here {liable}/{D} days
          </span>
          <span className="li-amt">{money(state.currency, c.bedroom[personId] || 0)}</span>
        </div>
        <div className="lineitem">
          <span className="li-name">Shared space</span>
          <span className="li-how">
            {sharedNames.join(", ")}
            {state.catchall > 0 ? ", hallway" : ""} · split with everyone here each day
          </span>
          <span className="li-amt">{money(state.currency, c.shared[personId] || 0)}</span>
        </div>
        {c.lines.map((l) => {
          const u = l.units[personId] || 0;
          const how =
            u === 0
              ? l.how[personId] === "not a payer"
                ? "not a payer on this bill"
                : "not here this month"
              : `${money(state.currency, l.amount)} × ${u} of ${l.unitSum} person-days`;
          return (
            <div className="lineitem sub" key={l.id}>
              <span className="li-name">
                {l.name}
                {l.isActual ? null : (
                  <span style={{ color: "var(--muted-2)", fontWeight: 500 }}> (est)</span>
                )}
              </span>
              <span className="li-how">{how}</span>
              <span className="li-amt">{money(state.currency, l.shares[personId] || 0)}</span>
            </div>
          );
        })}
        <div className="lineitem tot">
          <span className="li-name">Total for {monthLabel(monthKey)}</span>
          <span className="li-how" />
          <span className="li-amt">{money(state.currency, total)}</span>
        </div>
        {charged ? (
          <>
            <div className="lineitem">
              <span className="li-name">Asked for at the time</span>
              <span className="li-how">collected on the estimates</span>
              <span className="li-amt">{money(state.currency, was)}</span>
            </div>
            {monthHasActuals(M) ? (
              <div className={`lineitem ${diff > 0 ? "debit" : diff < 0 ? "credit" : ""}`}>
                <span className="li-name">
                  {diff > 0
                    ? "Underpaid — owes"
                    : diff < 0
                      ? "Overpaid — refund due"
                      : "Settled exactly"}
                </span>
                <span className="li-how">
                  difference between the real bills and what was collected · carried to Balances
                </span>
                <span className="li-amt">{signedMoney(state.currency, diff)}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
