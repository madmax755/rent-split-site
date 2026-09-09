import { useState } from "react";
import { tenancyMonthLabel } from "../domain/dates";
import { computeMonth, runChecks, weightedAreas } from "../domain/engine";
import { fmtNum, money, payer, personById, plural } from "../domain/format";
import { ensureMonth, lastRoomOf } from "../domain/months";
import type { CheckResult } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { PageHeader, Screen } from "./kit";
import { Button } from "@/components/ui/button";

const TOC: Array<{ id: string; label: string }> = [
  { id: "what", label: "What this is" },
  { id: "days", label: "What it rests on" },
  { id: "rent", label: "How rent is worked out" },
  { id: "away", label: "Being away, and sharing a room" },
  { id: "flow", label: "The decisions, as a flowchart" },
  { id: "bills", label: "How each bill splits" },
  { id: "trueup", label: "Estimates, real bills and true-ups" },
  { id: "balances", label: "Who owes whom" },
  { id: "example", label: "A worked example" },
  { id: "decisions", label: "The decisions behind this" },
  { id: "faq", label: "Questions people ask" },
];

type CheckView = { kind: "idle" } | { kind: "done"; results: CheckResult[] };

export function HowScreen() {
  const { store, state, activeTab } = useHousehold();
  const [check, setCheck] = useState<CheckView>({ kind: "idle" });
  const key = state.currentMonth;
  const c = computeMonth(state, key, "eff");
  const D = c.chargeableDays;
  const { rooms, ca, total } = weightedAreas(state);
  const pay = payer(state);
  const totDays = Object.values(c.counts.liableDays).reduce((a, v) => a + v, 0);
  const floorTotal = state.rooms.reduce((s, r) => s + r.w * r.l, 0) + (+state.catchall || 0);
  const largest = state.rooms.find((r) => !r.communal)?.name || "largest room";
  const bathWeight = state.rooms.find((r) => /bath/i.test(r.name))?.weight || 0.5;
  const charged = state.people.filter((p) => (c.totals[p.id] || 0) > 0);
  const exId = (charged.find((p) => !p.isPayer) || charged[0])?.id;

  return (
    <Screen id="how" active={activeTab === "how"}>
      <PageHeader
        title="How it works"
        description="Generated from the settings this household is actually using, so it can't drift out of date. If someone questions a number, this page is the answer."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {(store.isAdmin() ? [...TOC, { id: "check", label: "Check the maths" }] : TOC).map((s) => (
          <a
            key={s.id}
            href={`#how-${s.id}`}
            className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-5 md:p-6">
        <div className="prose-help">
          <h2 id="how-what">What this is</h2>
          <p>
            A house is rented as one thing but lived in by several people, in different rooms, for
            different amounts of time. This app turns that into a number per person per tenancy
            month. It files everything under <b>tenancy months</b>, one at a time, using the bills
            that <em>actually</em> arrived rather than what anyone guessed at the start. A tenancy
            month runs from the tenancy start day to the day before it in the next calendar month —
            9 August to 8 September, for example — and that whole window is what the split uses.
          </p>
          <p>
            Two people can disagree about what is fair. They cannot really disagree about what the
            rules are, once the rules are written down. That is what this page is for.
          </p>

          <h2 id="how-days">The one thing everything rests on</h2>
          <p>
            Everything rests on two different questions, asked separately about every single day of
            a charge's period:
          </p>
          <ul>
            <li>
              <b>Which days were you in the house?</b> This decides your share of every bill, over
              that bill's period.
            </li>
            <li>
              <b>Which bedroom were you in?</b> This decides your share of the rent, over the rent
              period.
            </li>
          </ul>
          <p>
            Occupancy comes from your <b>stints</b> on the <b>Who's here</b> tab. A stint is a block
            of days in one bedroom in a tenancy month, including the early days of the next calendar
            month that belong to that period. The full rent for that period is split; none of it is
            kicked into the following month. There is no second occupancy record, so nothing can
            fall out of step.
          </p>
          <div className="callout">
            <p>
              <b>Everyone is treated identically.</b> There are no tenants and no visitors, no
              per-person settings, no exemptions. Somebody staying five days is simply a person with
              a five-day stint, and they pay five days' worth of everything — rent, energy, council
              tax, all of it.
            </p>
            <p style={{ marginBottom: 0 }}>
              <b>A stint means "paying", not "physically present".</b> If you are away for a
              fortnight but still keeping your room and still on the bills, your stint runs through
              it — that is the normal case, and it is how three people who live here all year are
              recorded. Shorten a stint only when someone genuinely stops paying for those days.
            </p>
          </div>
          <div className="callout warn">
            <p style={{ marginBottom: 0 }}>
              <b>Every bedroom needs somebody in it, every day.</b> The landlord charges for a
              bedroom whether or not anybody is in it. If one is left empty, its rent has nowhere to
              go: it gets spread across everyone and a warning appears on <b>This tenancy month</b> and{" "}
              <b>Who's here</b>, with the exact days listed. The <em>Bedroom cover</em> strip under
              the timeline shows this at a glance.
            </p>
          </div>

          <h2 id="how-rent">How rent is worked out</h2>
          <p>
            Rent is split by <b>weighted floor area</b>, not by headcount. A bigger room costs more,
            which is why the person in the {largest} pays more than the person in the smallest one.
          </p>
          <p>
            Each room's floor area is multiplied by a <b>weight</b>. Bathrooms are set to{" "}
            {fmtNum(bathWeight, 2)}× because a square metre of bathroom isn't worth a square metre
            of bedroom, and the hallway is at {fmtNum(state.catchallWeight, 2)}× for the same
            reason. That gives every room a share of the total:
          </p>
          <div className="htable-wrap" style={{ marginBottom: 14 }}>
            <table className="htable">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Size</th>
                  <th>Area</th>
                  <th>Weight</th>
                  <th>Weighted</th>
                  <th>Share</th>
                  <th>Held by</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => {
                  const area = (+r.w || 0) * (+r.l || 0);
                  const names = state.people
                    .filter((p) => !p.archived && lastRoomOf(state, p.id) === r.id)
                    .map((p) => p.name);
                  return (
                    <tr key={r.id}>
                      <td style={{ textAlign: "left" }}>{r.name}</td>
                      <td>
                        {fmtNum(r.w)} × {fmtNum(r.l)}
                      </td>
                      <td>{fmtNum(area)} m²</td>
                      <td>{fmtNum(r.weight, 2)}×</td>
                      <td>{fmtNum(r.wa)} m²</td>
                      <td>{total ? ((r.wa / total) * 100).toFixed(1) : "0.0"}%</td>
                      <td style={{ textAlign: "left" }}>
                        {r.communal ? "everyone liable" : names.length ? names.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
                {ca > 0 ? (
                  <tr>
                    <td style={{ textAlign: "left" }}>Hallway / stairs</td>
                    <td>—</td>
                    <td>{fmtNum(+state.catchall || 0)} m²</td>
                    <td>{fmtNum(state.catchallWeight, 2)}×</td>
                    <td>{fmtNum(ca)} m²</td>
                    <td>{total ? ((ca / total) * 100).toFixed(1) : "0.0"}%</td>
                    <td style={{ textAlign: "left" }}>everyone liable</td>
                  </tr>
                ) : null}
                <tr style={{ borderTop: "1.5px solid var(--hairline-2)" }}>
                  <td className="strong" style={{ textAlign: "left" }}>
                    Total
                  </td>
                  <td />
                  <td className="strong">{fmtNum(floorTotal)} m²</td>
                  <td />
                  <td className="strong">{fmtNum(total)} m²</td>
                  <td className="strong">100%</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The month's rent of <b>{money(state.currency, c.rentPence)}</b> is divided across those
            shares, then divided again by the {c.rentCounts.periodLength} chargeable days in{" "}
            {c.rentCounts.periodLabel}. That gives every room a <b>daily cost</b>. Then, for each
            day:
          </p>
          <ul>
            <li>
              A <b>private</b> room's daily cost is split equally between whoever is liable for it
              that day — normally one person.
            </li>
            <li>
              A <b>shared</b> room's daily cost, and the hallway's, is split equally between
              everyone liable that day.
            </li>
          </ul>
          <p>
            Add up all thirty-or-so days and you have each person's rent. Because every room is
            charged out in full every single day, the rent always adds back to exactly{" "}
            {money(state.currency, c.rentPence)}.
          </p>

          <h2 id="how-away">Being away, and sharing a room</h2>
          <p>
            Your rent changes when <b>somebody else is in your bedroom</b> — that is the main thing
            the day-by-day model buys you.
          </p>
          <p>
            If a second person is in a bedroom on a given day, that day's cost for that room is
            split <b>equally between the two of them</b>. A visitor staying 10 nights of a 30-day
            month in someone's room therefore picks up 10 × ½ = 5 days' worth — about <b>16.7%</b>{" "}
            of that room for the month — and the person whose room it is pays the other 83.3%.
            Nobody pays for the room twice, and the room never goes unpaid.
          </p>
          <div className="callout good">
            <p>
              This is why a visitor makes the month <em>cheaper</em> for everyone else rather than
              more expensive: they take on a slice of a bedroom, a slice of the shared space for the
              days they are liable, and a slice of the usage bills for the nights they are here.
            </p>
          </div>

          <h2 id="how-flow">The decisions, as a flowchart</h2>
          <p>
            Three diagrams cover the whole app. Rent and bills are decided separately, and a month
            moves through a fixed lifecycle.
          </p>
          <h3>1 · How rent is decided — for one room, on one day</h3>
          <RentFlow />
          <p className="flow-cap">
            Run this for every room and every day, add it up, and you have each person's rent. The
            only thing that changes anyone's rent is who is in which bedroom, on which days.
          </p>
          <h3>2 · How a bill is decided — for one bill, for one person</h3>
          <BillFlow />
          <p className="flow-cap">
            That is the entire rule. There is no second kind of bill and no second kind of person —
            the only input is how many days each person was here.
          </p>
          <h3>3 · What happens to a month</h3>
          <MonthFlow />
          <p className="flow-cap">
            A month's own figure always describes that month alone. Differences never quietly move
            next month's number — they sit on the Balances tab until somebody settles them, in full
            or in part.
          </p>

          <h2 id="how-bills">How each bill splits</h2>
          <p>
            Every bill splits the same way: your days in the tenancy month, divided by everyone's
            days.
          </p>
          <div className="htable-wrap" style={{ marginBottom: 14 }}>
            <table className="htable">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Usual amount</th>
                  <th>How it splits</th>
                </tr>
              </thead>
              <tbody>
                {state.bills.map((b) => (
                  <tr key={b.id}>
                    <td style={{ textAlign: "left" }}>{b.name}</td>
                    <td style={{ textAlign: "left" }}>
                      {state.currency}
                      {(+b.est || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "left" }}>
                      Split across this tenancy month
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Every bill splits the same way: <b>your days divided by everyone's days</b> in the
            tenancy month. Energy is worked out exactly like council tax. The current bills are:
          </p>
          <div className="htable-wrap" style={{ marginBottom: 14 }}>
            <table className="htable">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Bedroom</th>
                  <th>Days here</th>
                  <th>Share of every bill</th>
                </tr>
              </thead>
              <tbody>
                {state.people
                  .filter((p) => !p.archived)
                  .map((p) => {
                    const d = c.counts.liableDays[p.id] || 0;
                    const roomNames = [
                      ...new Set(
                        c.counts.days.flatMap((day) =>
                          Object.keys(day.rooms)
                            .filter((rid) => (day.rooms[rid] ?? []).includes(p.id))
                            .map((rid) => state.rooms.find((r) => r.id === rid)?.name)
                            .filter((n): n is string => Boolean(n)),
                        ),
                      ),
                    ];
                    return (
                      <tr key={p.id}>
                        <td style={{ textAlign: "left" }}>
                          {p.name}
                          {p.isPayer ? " (pays everything)" : ""}
                        </td>
                        <td style={{ textAlign: "left" }}>{roomNames.join(", ") || "—"}</td>
                        <td>
                          {d} / {D}
                        </td>
                        <td>{totDays ? ((d / totDays) * 100).toFixed(1) + "%" : "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p>And this tenancy month's days work out as:</p>

          <h2 id="how-trueup">Estimates, real bills and true-ups</h2>
          <p>
            Bills are paid by direct debit at an estimated amount, and the real figure only shows up
            later. So every line in a month has two boxes: an <b>estimate</b> and a <b>realised</b>{" "}
            figure.
          </p>
          <ol>
            <li>
              At the start of the month you enter the estimates — usually just what the direct debit
              takes. Each new month starts with last month's realised figures already filled in, so
              most of the time there's nothing to type.
            </li>
            <li>
              Everyone pays against that. Press <b>Lock these as the amounts collected</b> and the
              app records exactly what each person was asked for.
            </li>
            <li>
              When the real bills arrive you type them into the <b>realised</b> column. Every split
              is instantly recomputed on the real numbers.
            </li>
            <li>
              The difference between what someone was asked for and what their share really was
              becomes a <b>true-up</b>, and it lands on their balance.
            </li>
          </ol>
          <div className="callout good">
            <p style={{ marginBottom: 0 }}>
              <b>Prices go up.</b> Nothing about a bill is fixed in stone — the <b>usual amount</b>{" "}
              on the Household tab is only the figure a fresh month starts from, and every month's
              estimate and realised figure are editable at any time. When the energy tariff or the
              council tax rises, change the usual amount and future months follow; months already
              recorded keep the numbers they were actually charged.
            </p>
          </div>
          <div className="callout warn">
            <p>
              Nothing is silently changed. A month's own figure always reflects that month alone;
              the difference sits visibly on the Balances tab until it is settled. If a realised
              figure was typed in wrong and you correct it, the true-up simply recomputes — there is
              no double-counting, because the true-up is derived from the numbers rather than stored
              as an event.
            </p>
          </div>

          <h2 id="how-balances">Who owes whom</h2>
          <p>
            <b>{pay.name}</b> pays the landlord and every provider, and everyone settles with{" "}
            {pay.name}. That means there is never a chain of debts to untangle — every balance is
            between one person and {pay.name}, and it is either owed in or owed out.
          </p>
          <p>
            A negative balance means an over-payment: the person paid more than their share turned
            out to be, and is owed a refund. This keeps working for people who have <b>moved out</b>{" "}
            — they stay on the Balances tab with whatever they are owed until it is paid, even
            though they no longer appear in any month.
          </p>
          <p>
            Pressing <b>Settle…</b> asks how much actually changed hands. Accept the suggested
            figure to clear the balance in full, or type a smaller amount to record a{" "}
            <b>partial payment</b> — the remainder stays outstanding, ready to settle again later.
            Every payment, full or partial, is listed under <em>Every adjustment</em> exactly as
            recorded, and any of them can be undone (which puts the balance back to what it was
            before).
          </p>

          <h2 id="how-example">A worked example</h2>
          {exId ? (
            <ExampleBlock
              currency={state.currency}
              name={personById(state, exId)?.name ?? ""}
              isPayer={!!personById(state, exId)?.isPayer}
              month={tenancyMonthLabel(key)}
              days={D}
              liable={c.counts.liableDays[exId] || 0}
              nights={c.counts.nights[exId] || 0}
              bedroom={c.bedroom[exId] || 0}
              shared={c.shared[exId] || 0}
              lines={c.lines.map((l) => ({
                label: `${l.name} — ${money(state.currency, l.amount)} × ${l.units[exId] || 0}/${l.unitSum}`,
                amt: l.shares[exId] || 0,
              }))}
              total={c.totals[exId] || 0}
              payName={pay.name}
              grand={Object.values(c.totals).reduce((s, v) => s + v, 0)}
              rentPence={c.rentPence}
              billsTotalPence={c.billsTotalPence}
            />
          ) : (
            <p>
              No-one is charged anything this month yet, so there is nothing to work through. Add a
              stint on <b>Who's here</b> and this section fills itself in.
            </p>
          )}

          <h2 id="how-decisions">The decisions behind this</h2>
          <p>
            Some of these are judgement calls rather than facts. They are written down so that
            everyone is arguing about the same thing:
          </p>
          <ul>
            <li>
              <b>Rent is by weighted area, not per head.</b> Rooms are not the same size and it
              would be strange to pretend otherwise.
            </li>
            <li>
              <b>Bathrooms and hallways are weighted below 1×.</b> They are shared and you don't
              live in them; counting them at full area would overstate them.
            </li>
            <li>
              <b>Rent follows liability, not presence.</b> Explained above — the room is yours
              whether or not you are in it.
            </li>
            <li>
              <b>Shared space also follows liability.</b> Your things are still in the kitchen and
              the lounge, and the space is still reserved for you.
            </li>
            <li>
              <b>Bills split by days, not by usage.</b> Metering who used which kilowatt is
              impossible and arguing about it is worse. Days in the house is the one number nobody
              disputes.
            </li>
            <li>
              <b>One kind of person.</b> A housemate and a friend staying a fortnight are the same
              thing to the maths — a name with some days. Categories only ever created arguments
              about which category someone was in.
            </li>
            <li>
              <b>Dates live in exactly one place.</b> Stints. Anything else would need keeping in
              step, and eventually wouldn't be.
            </li>
            <li>
              <b>Splits follow the tenancy month.</b> The window is taken from the tenancy start
              day. The full rent and each bill for that period are split by who was here on those
              days.
            </li>
            <li>
              <b>A stint means paying, not present.</b> Being away doesn't reduce your share; ending
              your stint does.
            </li>
            <li>
              <b>Every bedroom must be occupied every day.</b> The rent is charged for it either
              way, so an empty room is money with nowhere to go.
            </li>
            <li>
              <b>A shared bedroom splits equally, day by day.</b> Not by total person-days, which
              would over-charge a short visit.
            </li>
            <li>
              <b>Everything reconciles to the penny.</b> Shares are rounded so they add back to the
              exact bill, rather than leaving stray pennies with nobody.
            </li>
            <li>
              <b>Real bills beat estimates.</b> A month is only finished when the realised figures
              are in.
            </li>
          </ul>

          <h2 id="how-faq">Questions people ask</h2>
          <h3>I was away for three weeks. Why is my share the same?</h3>
          <p>
            Because your stint still covers those days, which is correct if you kept your room and
            stayed on the bills. The room was yours, the broadband ran, the council tax was
            identical. If you genuinely stopped paying for that period, shorten the stint — but then
            somebody else has to be in that bedroom for those days.
          </p>
          <h3>So when does my share actually go down?</h3>
          <p>
            When your stint is shorter, or when somebody else is in your bedroom for some of it.
            Those are the only two levers, and both live on the Who's here tab.
          </p>
          <h3>Someone stayed in my room for a week. Why did my rent go down?</h3>
          <p>
            They took on half of that room's cost for each day they were in it. That comes off your
            share, not anyone else's.
          </p>
          <h3>Why is my energy share not exactly a quarter?</h3>
          <p>
            Because somebody was here for a different number of days than you. With four people here
            the whole month it is exactly a quarter; add a five-day guest and everybody's share
            moves a little.
          </p>
          <h3>The bill went up this year. Do I have to rebuild anything?</h3>
          <p>
            No. Change the usual amount on the Household tab and future months start from it. Every
            month's figures stay editable, and past months keep what they were actually charged.
          </p>
          <h3>The number changed after I'd already paid. Why?</h3>
          <p>
            The real bill came in different from the direct-debit estimate. The month's figure was
            recomputed on the real number, and the difference is on your balance — either you owe a
            little more or you are due a refund.
          </p>
          <h3>I've moved out and I'm owed money. Will it get lost?</h3>
          <p>No. Balances survive leaving. You stay on the Balances tab until you are paid.</p>
          <h3>Can I see how a number was reached?</h3>
          <p>
            Yes — tap your name on the <b>This tenancy month</b> tab. Every line shows the amount, the basis
            it was split on, and how many nights or liable-days you were counted for.
          </p>
          <h3>Somebody is moving out. What do I do?</h3>
          <p>
            End their stint on the day they go, and extend or add someone else's stint so their
            bedroom still has an occupant. Nothing else — there is no move-out date to set. Next
            month copies this one, so they simply won't appear.
          </p>
          <h3>Do I have to set this up every month?</h3>
          <p>
            No. A new month starts as a copy of the previous one, with full-month stints extended to
            fit. In a month where nothing changed there is nothing at all to do except type the
            bills in.
          </p>

          {store.isAdmin() ? (
            <>
              <h2 id="how-check">Check the maths</h2>
              <p>
                This runs every stored month and verifies that the split adds back to the bill
                exactly — that the rent shares total the rent, that each bill's shares total that
                bill, and that nothing has fallen down a rounding crack.
              </p>
              <Button
                onClick={() => {
                  ensureMonth(state, key);
                  setCheck({ kind: "done", results: runChecks(state) });
                }}
              >
                Run the check
              </Button>
              {check.kind === "done" ? <CheckOut results={check.results} /> : null}
            </>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}

function ExampleBlock(props: {
  currency: string;
  name: string;
  isPayer: boolean;
  month: string;
  days: number;
  liable: number;
  nights: number;
  bedroom: number;
  shared: number;
  lines: Array<{ label: string; amt: number }>;
  total: number;
  payName: string;
  grand: number;
  rentPence: number;
  billsTotalPence: number;
}) {
  const rows: Array<{ label: string; amt: string }> = [
    { label: "Bedroom", amt: money(props.currency, props.bedroom) },
    { label: "Shared space", amt: money(props.currency, props.shared) },
    ...props.lines.map((l) => ({ label: l.label, amt: money(props.currency, l.amt) })),
  ];
  return (
    <>
      <p>
        Take <b>{props.name}</b> in {props.month}. The month has {props.days} days. They were liable
        for {props.liable} of them and slept here on {props.nights} nights.
      </p>
      <div className="worked">
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.amt}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>{props.isPayer ? "Their share of the month" : `They owe ${props.payName}`}</td>
              <td>{money(props.currency, props.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Add up that last column for everyone and you get {money(props.currency, props.grand)} —
        exactly the {money(props.currency, props.rentPence)} of rent plus{" "}
        {money(props.currency, props.billsTotalPence)} of bills the household owes. Not a penny more
        or less.
      </p>
    </>
  );
}

function CheckOut(props: { results: CheckResult[] }) {
  const bad = props.results.filter((r) => !r.ok);
  const warns = props.results.filter((r) => r.warn && r.warn.length);
  const headline = bad.length
    ? `${plural(bad.length, "month")} did not balance.`
    : props.results.length === 0
      ? "There are no months to check yet."
      : props.results.length === 1
        ? "The one month on record balances exactly."
        : `All ${props.results.length} months balance exactly.`;
  return (
    <div style={{ marginTop: 14 }}>
      <div className={`callout ${bad.length ? "warn" : "good"}`}>
        <p>
          <b>{headline}</b>
        </p>
        {bad.map((r) => (
          <p key={r.key}>
            {tenancyMonthLabel(r.key)}: {r.problems.join("; ")}
          </p>
        ))}
      </div>
      {warns.length ? (
        <div className="callout warn">
          <p>
            <b>Things worth a look:</b>
          </p>
          {warns.map((r) => (
            <p key={r.key}>
              {tenancyMonthLabel(r.key)}: {r.warn.join(" ")}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RentFlow() {
  return (
    <div className="flow">
      <svg
        viewBox="0 0 900 470"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Flowchart of how rent is decided for one room on one day"
      >
        <defs>
          <marker id="fa" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto">
            <path d="M0 0 L7 3.2 L0 6.4 z" fill="var(--muted-2)" />
          </marker>
        </defs>
        <rect className="n-box" x="230" y="12" width="320" height="40" rx="10" />
        <text className="t" x="390" y="37" textAnchor="middle">
          One room, on one day of the month
        </text>
        <path className="ln" d="M390 52 L390 78" markerEnd="url(#fa)" />
        <rect className="n-box" x="150" y="80" width="480" height="52" rx="10" />
        <text className="t" x="390" y="101" textAnchor="middle">
          Daily cost of this room =
        </text>
        <text className="t-sm" x="390" y="119" textAnchor="middle">
          rent × (its weighted area ÷ total weighted area) ÷ days in the tenancy month
        </text>
        <path className="ln" d="M390 132 L390 158" markerEnd="url(#fa)" />
        <rect className="n-dec" x="230" y="160" width="320" height="42" rx="10" />
        <text className="t" x="390" y="186" textAnchor="middle">
          Is it shared space?
        </text>
        <path className="ln" d="M550 181 L648 181" markerEnd="url(#fa)" />
        <text className="t-edge" x="596" y="173" textAnchor="middle">
          YES
        </text>
        <rect className="n-end" x="650" y="158" width="238" height="46" rx="10" />
        <text className="t" x="769" y="176" textAnchor="middle">
          Split equally between
        </text>
        <text className="t" x="769" y="192" textAnchor="middle">
          everyone in the house that day
        </text>
        <path className="ln" d="M390 202 L390 232" markerEnd="url(#fa)" />
        <text className="t-edge" x="404" y="220">
          NO — it is a bedroom
        </text>
        <rect className="n-dec" x="200" y="234" width="380" height="42" rx="10" />
        <text className="t" x="390" y="260" textAnchor="middle">
          How many people are in it today?
        </text>
        <path className="ln" d="M580 255 L648 255" markerEnd="url(#fa)" />
        <text className="t-edge" x="614" y="247" textAnchor="middle">
          ONE
        </text>
        <rect className="n-end" x="650" y="232" width="238" height="46" rx="10" />
        <text className="t" x="769" y="250" textAnchor="middle">
          They pay the room's
        </text>
        <text className="t" x="769" y="266" textAnchor="middle">
          whole daily cost
        </text>
        <path className="ln" d="M390 276 L390 306" markerEnd="url(#fa)" />
        <text className="t-edge" x="404" y="294">
          TWO OR MORE
        </text>
        <rect className="n-end" x="200" y="308" width="380" height="46" rx="10" />
        <text className="t" x="390" y="326" textAnchor="middle">
          Split equally between them, for that day only
        </text>
        <text className="t-sm" x="390" y="343" textAnchor="middle">
          this is what a visitor or a partner staying over changes
        </text>
        <path className="ln" d="M200 255 L152 255 L152 385 L198 385" markerEnd="url(#fa)" />
        <text className="t-edge" x="126" y="320" textAnchor="middle">
          NOBODY
        </text>
        <rect className="n-warn" x="200" y="362" width="380" height="46" rx="10" />
        <text className="t" x="390" y="380" textAnchor="middle">
          Spread across everyone, and a warning shows
        </text>
        <text className="t-sm" x="390" y="397" textAnchor="middle">
          this shouldn't happen — every bedroom should be occupied every day
        </text>
      </svg>
    </div>
  );
}

function BillFlow() {
  return (
    <div className="flow">
      <svg
        viewBox="0 0 900 250"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Flowchart of how one bill is divided"
      >
        <rect className="n-box" x="250" y="12" width="280" height="40" rx="10" />
        <text className="t" x="390" y="37" textAnchor="middle">
          One bill, one person
        </text>
        <path className="ln" d="M390 52 L390 80" markerEnd="url(#fa)" />
        <rect className="n-dec" x="190" y="82" width="400" height="42" rx="10" />
        <text className="t" x="390" y="108" textAnchor="middle">
          How many days were they in the house?
        </text>
        <path className="ln" d="M590 103 L648 103" markerEnd="url(#fa)" />
        <text className="t-edge" x="619" y="95" textAnchor="middle">
          NONE
        </text>
        <rect className="n-end" x="650" y="80" width="238" height="46" rx="10" />
        <text className="t" x="769" y="98" textAnchor="middle">
          They pay nothing
        </text>
        <text className="t-sm" x="769" y="114" textAnchor="middle">
          no stint that month
        </text>
        <path className="ln" d="M390 124 L390 152" markerEnd="url(#fa)" />
        <text className="t-edge" x="404" y="142">
          SOME
        </text>
        <rect className="n-end" x="150" y="154" width="480" height="58" rx="10" />
        <text className="t" x="390" y="177" textAnchor="middle">
          their days ÷ everyone's days, times the bill
        </text>
        <text className="t-sm" x="390" y="196" textAnchor="middle">
          the same arithmetic for energy, water, Wi-Fi, insurance and council tax
        </text>
      </svg>
    </div>
  );
}

function MonthFlow() {
  return (
    <div className="flow">
      <svg
        viewBox="0 0 900 330"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Flowchart of the monthly estimate, lock, realise and true-up cycle"
      >
        <rect className="n-box" x="20" y="20" width="200" height="52" rx="10" />
        <text className="t" x="120" y="41" textAnchor="middle">
          Estimates entered
        </text>
        <text className="t-sm" x="120" y="58" textAnchor="middle">
          what the direct debit takes
        </text>
        <path className="ln" d="M220 46 L268 46" markerEnd="url(#fa)" />
        <rect className="n-box" x="270" y="20" width="200" height="52" rx="10" />
        <text className="t" x="370" y="41" textAnchor="middle">
          Locked
        </text>
        <text className="t-sm" x="370" y="58" textAnchor="middle">
          records what each was asked for
        </text>
        <path className="ln" d="M470 46 L518 46" markerEnd="url(#fa)" />
        <rect className="n-box" x="520" y="20" width="200" height="52" rx="10" />
        <text className="t" x="620" y="41" textAnchor="middle">
          Real bills arrive
        </text>
        <text className="t-sm" x="620" y="58" textAnchor="middle">
          typed into Realised
        </text>
        <path className="ln" d="M620 72 L620 100" markerEnd="url(#fa)" />
        <rect className="n-box" x="470" y="102" width="300" height="46" rx="10" />
        <text className="t" x="620" y="120" textAnchor="middle">
          Every split recomputed on the real figures
        </text>
        <text className="t-sm" x="620" y="137" textAnchor="middle">
          difference per person = realised share − what was collected
        </text>
        <path className="ln" d="M470 125 L390 125 L390 168" markerEnd="url(#fa)" />
        <rect className="n-dec" x="230" y="170" width="320" height="42" rx="10" />
        <text className="t" x="390" y="196" textAnchor="middle">
          Are they still on the roster?
        </text>
        <path className="ln" d="M550 191 L618 191" markerEnd="url(#fa)" />
        <text className="t-edge" x="584" y="183" textAnchor="middle">
          NO
        </text>
        <rect className="n-end" x="620" y="168" width="260" height="46" rx="10" />
        <text className="t" x="750" y="186" textAnchor="middle">
          Refunds due list
        </text>
        <text className="t-sm" x="750" y="202" textAnchor="middle">
          they keep their balance after leaving
        </text>
        <path className="ln" d="M390 212 L390 240" markerEnd="url(#fa)" />
        <text className="t-edge" x="404" y="230">
          YES
        </text>
        <rect className="n-end" x="230" y="242" width="320" height="46" rx="10" />
        <text className="t" x="390" y="260" textAnchor="middle">
          Running balance with the payer
        </text>
        <text className="t-sm" x="390" y="277" textAnchor="middle">
          owed in, or owed out as a refund
        </text>
        <path className="ln" d="M230 265 L120 265 L120 200" markerEnd="url(#fa)" />
        <rect className="n-box" x="20" y="154" width="200" height="46" rx="10" />
        <text className="t" x="120" y="172" textAnchor="middle">
          Settle
        </text>
        <text className="t-sm" x="120" y="189" textAnchor="middle">
          records it, back to zero
        </text>
      </svg>
    </div>
  );
}
