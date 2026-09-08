import { ChevronDownIcon } from "lucide-react";
import { daysInMonth, monthLabel } from "../domain/dates";
import {
  chargedFor,
  chargesUseCalendarMonth,
  monthAllActual,
  monthHasActuals,
} from "../domain/engine";
import { money, personById, plural, signedMoney } from "../domain/format";
import type { HouseholdState, MonthCompute, MonthRecord } from "../domain/types";
import { Avatar } from "./avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const calendar = chargesUseCalendarMonth(state);
  const D = calendar ? daysInMonth(monthKey) : c.rentCounts.periodLength;
  const liable = calendar
    ? c.counts.liableDays[personId] || 0
    : c.rentCounts.liableDays[personId] || 0;
  const nights = liable;
  const total = c.totals[personId] || 0;
  const roomsUsed: Record<string, number> = {};
  let sharedDays = 0;
  const occupancyDays = calendar ? c.counts.days : c.rentCounts.days;
  occupancyDays.forEach((day) => {
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
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={clickable ? open : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          clickable ? "hover:bg-muted/50" : "cursor-default",
        )}
        onClick={clickable ? props.onToggle : undefined}
      >
        <Avatar state={state} person={p} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {p.name}
            {p.isPayer ? <Badge variant="secondary">pays the bills</Badge> : null}
          </div>
          <div className="tabular-nums text-xs text-muted-foreground">
            {calendar
              ? `here ${liable} of ${D} days`
              : `rent ${liable} of ${D} days · ${c.rentCounts.periodLabel}`}
            {perNight ? ` · ${money(state.currency, perNight)} per day` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular-nums font-heading text-lg font-semibold">
            {money(state.currency, total)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {monthAllActual(state, M) ? "realised" : "estimated"}
          </div>
        </div>
        {clickable ? (
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        ) : null}
      </button>
      {open ? (
        <div className="border-t px-4 py-2">
          <Line
            name="Bedroom"
            how={`${roomTxt}${sharedDays ? ` · shared on ${plural(sharedDays, "day")}` : ""} · here ${liable}/${D} days${calendar ? "" : ` · ${c.rentCounts.periodLabel}`}`}
            amount={money(state.currency, c.bedroom[personId] || 0)}
          />
          <Line
            name="Shared space"
            how={`${sharedNames.join(", ")}${state.catchall > 0 ? ", hallway" : ""} · split with everyone here each day`}
            amount={money(state.currency, c.shared[personId] || 0)}
          />
          {c.lines.map((l) => {
            const u = l.units[personId] || 0;
            const how =
              u === 0
                ? l.how[personId] === "not a payer"
                  ? "not a payer on this bill"
                  : "not here this month"
                : `${money(state.currency, l.amount)} × ${u} of ${l.unitSum} person-days${l.cycleStartDay === 1 ? "" : ` · ${l.periodLabel}`}`;
            return (
              <Line
                key={l.id}
                name={`${l.name}${l.isActual ? "" : " (est)"}`}
                how={how}
                amount={money(state.currency, l.shares[personId] || 0)}
                inset
              />
            );
          })}
          <Line
            name={`Total for ${monthLabel(monthKey)}`}
            how=""
            amount={money(state.currency, total)}
            strong
          />
          {charged ? (
            <>
              <Line
                name="Asked for at the time"
                how="collected on the estimates"
                amount={money(state.currency, was)}
              />
              {monthHasActuals(M) ? (
                <Line
                  name={
                    diff > 0
                      ? "Underpaid — owes"
                      : diff < 0
                        ? "Overpaid — refund due"
                        : "Settled exactly"
                  }
                  how="difference between the real bills and what was collected · carried to Settle"
                  amount={signedMoney(state.currency, diff)}
                  tone={diff > 0 ? "debit" : diff < 0 ? "credit" : undefined}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type LineProps = {
  name: string;
  how: string;
  amount: string;
  inset?: boolean;
  strong?: boolean;
  tone?: "credit" | "debit";
};

function Line(props: LineProps) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 border-t py-2 text-sm first:border-t-0",
        props.inset && "pl-3",
        props.strong && "border-t-2 font-semibold",
      )}
    >
      <span className={cn("font-medium", props.inset && "font-normal text-foreground/80")}>
        {props.name}
      </span>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">{props.how}</span>
      <span
        className={cn(
          "tabular-nums whitespace-nowrap font-medium",
          props.tone === "credit" && "text-emerald-600 dark:text-emerald-400",
          props.tone === "debit" && "text-destructive",
        )}
      >
        {props.amount}
      </span>
    </div>
  );
}
