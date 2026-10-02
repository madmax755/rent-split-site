import { useState, type CSSProperties } from "react";
import {
  dayDate,
  dayMonthLabel,
  daySpanLabel,
  isoToPeriodDay,
  periodDayIso,
  tenancyMonthLabel,
  tenancyPeriodDays,
  tenancyPeriodLength,
} from "../domain/dates";
import { MAX_PEOPLE } from "../domain/defaults";
import { bedroomGaps, buildDayModel } from "../domain/engine";
import { personById, personColor, plural } from "../domain/format";
import { uid } from "../domain/ids";
import { ensureMonth, lastRoomOf, seedStints } from "../domain/months";
import { togglePersonDay } from "../domain/stint-edit";
import type { BedroomGap, DayModel, HouseholdState, Person, Room, Stint } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { Avatar } from "./avatar";
import { EmptyState, MonthSwitcher, PageHeader, Panel, Screen, WarnList } from "./kit";
import { useConfirm } from "./confirm-dialog";
import { TextPromptDialog } from "./text-prompt-dialog";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function StintsScreen() {
  const { store, state, activeTab, version } = useHousehold();
  const ask = useConfirm();
  const selfOnly = store.isTenant();
  const myId = store.linkedPersonId();
  const [addingPerson, setAddingPerson] = useState(false);
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const periodDays = tenancyPeriodDays(key, state.tenancyStart);
  const D = periodDays.length;
  const days = buildDayModel(state, key);
  const dayColumns = { gridTemplateColumns: `repeat(${Math.max(D, 1)}, minmax(0, 1fr))` };
  const involved = state.people.filter((p) => (M.stints || []).some((s) => s.personId === p.id));
  const chartPeople = state.people.filter(
    (person) => !person.archived || involved.some((present) => present.id === person.id),
  );
  const gaps = bedroomGaps(state, key);
  const gapCount = gaps.reduce((s, g) => s + g.days.length, 0);
  const startIso = periodDayIso(key, state.tenancyStart, 1);
  const endIso = periodDayIso(key, state.tenancyStart, D);

  function clampAll(stints: Stint[]): void {
    stints.forEach((s) => {
      s.from = Math.min(D, Math.max(1, s.from));
      s.to = Math.min(D, Math.max(s.from, s.to));
    });
  }

  function commitStints(fn: () => void): void {
    store.mutate(fn, { persist: !selfOnly });
    if (selfOnly) store.queueOwnStintsSave();
  }

  function patchStint(id: string, patch: (s: Stint, stints: Stint[]) => void): void {
    commitStints(() => {
      const month = ensureMonth(store.state, key);
      const stints = month.stints || [];
      const s = stints.find((x) => x.id === id);
      if (!s) return;
      if (selfOnly && s.personId !== myId) return;
      patch(s, stints);
      clampAll(stints);
    });
  }

  function canEdit(stint: Stint): boolean {
    return !selfOnly || stint.personId === myId;
  }

  function canEditPerson(personId: string): boolean {
    return !selfOnly || personId === myId;
  }

  function toggleHouseDay(personId: string, day: number): void {
    if (!canEditPerson(personId)) return;
    commitStints(() => {
      const month = ensureMonth(store.state, key);
      month.stints = togglePersonDay(
        month.stints || [],
        personId,
        day,
        D,
        lastRoomOf(store.state, personId),
        () => uid("st"),
      );
    });
  }

  if (selfOnly && !myId) {
    return (
      <Screen id="stints" active={activeTab === "stints"}>
        <EmptyState title="Pick who you are" description="Sign out and choose your name." />
      </Screen>
    );
  }

  return (
    <Screen id="stints" active={activeTab === "stints"}>
      <PageHeader
        title="Who's here"
        description={`${plural(involved.length, "person", "people")} here${gapCount ? ` · ${gapCount} empty bedroom-days` : ""}`}
        actions={<MonthSwitcher />}
      />
      <WarnList
        items={gaps.map(
          (g) => `${g.name} empty on ${g.days.length === D ? "every day" : daySpanLabel(g.days)}`,
        )}
      />

      <div className="flex flex-col gap-5">
      <div
        className="order-2 overflow-hidden rounded-xl border bg-card lg:order-1"
        data-store-version={version}
      >
        <div className="px-4 pt-4">
          <div className="text-sm font-medium">In the house</div>
          <p className="text-[11px] text-muted-foreground">
            {selfOnly
              ? "Tap your days to mark yourself in or out."
              : "Tap a day to mark someone in or out."}
          </p>
        </div>
        <div className="min-w-0 p-4 pt-2" data-house-chart>
          {chartPeople.length ? (
            <>
            <HouseWeeks
              days={days}
              people={chartPeople}
              rooms={state.rooms}
              gaps={gaps}
              state={state}
              editable={canEditPerson}
              onToggle={toggleHouseDay}
            />
            <div className="hidden min-w-0 lg:block">
              <div
                className="mb-2 grid gap-0.5 pl-[4.75rem] sm:pl-[116px]"
                style={dayColumns}
              >
                {periodDays.map((date, i) => {
                  const dow = dayDate(date.key, date.d).getDay();
                  const wk = dow === 0 || dow === 6;
                  const monthStart = i === 0 || periodDays[i - 1]?.key !== date.key;
                  return (
                    <div
                      key={`${date.key}-${date.d}`}
                      className={`tabular-nums text-center text-[9px] ${
                        wk ? "font-bold text-foreground" : "text-muted-foreground"
                      }`}
                      title={`${date.d} ${date.key}`}
                    >
                      {monthStart ? date.d : date.d % 2 === 1 || D <= 20 ? date.d : "\u00a0"}
                    </div>
                  );
                })}
              </div>
              {chartPeople.map((p) => (
                <div key={p.id} className="mb-1.5 flex items-center gap-2.5">
                  <div className="flex w-16 shrink-0 items-center gap-2 sm:w-[106px]">
                    <Avatar state={state} person={p} size={22} />
                    <span className="truncate text-xs font-medium">{p.name}</span>
                  </div>
                  <div className="grid h-9 min-w-0 flex-1 gap-0.5" style={dayColumns}>
                    {days.map((day, index) => {
                      const isHere = day.liable.includes(p.id);
                      let sharing = false;
                      Object.keys(day.rooms).forEach((rid) => {
                        const occ = day.rooms[rid] ?? [];
                        if (occ.includes(p.id) && occ.length > 1) sharing = true;
                      });
                      return (
                        <HouseDayCell
                          key={`${day.key}-${day.d}`}
                          personName={p.name}
                          dayLabel={dayMonthLabel(day.key, day.d)}
                          filled={isHere}
                          colour={personColor(state, p.id)}
                          sharing={sharing}
                          editable={canEditPerson(p.id)}
                          onToggle={() => toggleHouseDay(p.id, index + 1)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div
                className="mt-2 grid gap-0.5 pl-[4.75rem] sm:pl-[116px]"
                style={dayColumns}
              >
                {days.map((day) => (
                  <div
                    key={`${day.key}-${day.d}`}
                    className="flex h-5 items-center justify-center rounded-[3px] bg-muted text-[9px] font-bold tabular-nums text-muted-foreground"
                  >
                    {day.liable.length}
                  </div>
                ))}
              </div>
              <div className="mt-1 pl-[4.75rem] text-[11px] text-muted-foreground sm:pl-[116px]">
                people in the house each day
              </div>
              {state.rooms.some((r) => !r.communal) ? (
                <div className="mt-4 border-t pt-3">
                  <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Bedrooms
                  </div>
                  {state.rooms
                    .filter((r) => !r.communal)
                    .map((room) => {
                      const g = gaps.find((x) => x.roomId === room.id);
                      return (
                        <div key={room.id} className="mb-1.5 flex items-center gap-2.5">
                          <div className="w-16 shrink-0 truncate text-xs font-medium sm:w-[106px]">
                            <span className={g ? "text-destructive" : "text-muted-foreground"}>
                              {room.name}
                            </span>
                          </div>
                          <div className="grid h-6 min-w-0 flex-1 gap-0.5" style={dayColumns}>
                            {days.map((day) => {
                              const occ = (day.rooms[room.id] || []).length;
                              return (
                                <div
                                  key={`${room.id}-${day.key}-${day.d}`}
                                  title={`${room.name} — ${day.d} ${day.key}: ${occ ? plural(occ, "person", "people") : "EMPTY"}`}
                                  className={`rounded-[3px] ${
                                    occ > 1
                                      ? "bg-emerald-500 ring-1 ring-inset ring-foreground/60"
                                      : occ
                                        ? "bg-emerald-500/80"
                                        : "bg-destructive/25 ring-1 ring-destructive"
                                  }`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : null}
            </div>
            </>
          ) : (
            <EmptyState
              title={`Nobody is down for ${tenancyMonthLabel(key)} yet`}
              description="Add dates, or reset from last month."
            />
          )}
        </div>
        <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-sm bg-primary" /> In the house
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-sm bg-muted ring-1 ring-foreground" /> Sharing
            a bedroom
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-sm bg-destructive/40 ring-1 ring-destructive" />{" "}
            Empty bedroom
          </span>
        </div>
      </div>

      <div className="order-1 lg:order-2">
      <Panel
        title="Dates"
        description={
          selfOnly
            ? "Days you are paying — usually the same as being in the house."
            : "Who is paying, which bedroom, which days."
        }
      >
        {!(M.stints || []).length ? (
          <EmptyState title="No dates yet" />
        ) : (
          <div className="grid gap-2">
            {(M.stints || []).map((s) => {
              const p = personById(state, s.personId);
              const editable = canEdit(s);
              return (
                <div
                  key={s.id}
                  className={`grid gap-2 rounded-xl bg-muted/50 p-3 sm:flex sm:flex-wrap sm:items-center ${editable ? "" : "opacity-70"}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={
                        {
                          background: p ? personColor(state, p.id) : "var(--muted-foreground)",
                        } as CSSProperties
                      }
                    />
                    {selfOnly ? (
                      <span className="min-w-0 flex-1 font-medium">{p?.name ?? "Unknown"}</span>
                    ) : (
                      <NativeSelect
                        className="min-w-0 flex-1 sm:flex-none"
                        value={s.personId}
                        disabled={!editable}
                        onChange={(e) => {
                          patchStint(s.id, (st) => {
                            st.personId = e.target.value;
                          });
                        }}
                      >
                        {state.people.map((person) => (
                          <NativeSelectOption key={person.id} value={person.id}>
                            {person.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    )}
                  </div>
                  <div className="grid w-full min-w-0 grid-cols-1 items-center gap-2 text-xs text-muted-foreground sm:flex sm:w-auto sm:gap-1.5">
                    <input
                      type="date"
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm tabular-nums outline-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-[9.5rem]"
                      min={startIso}
                      max={endIso}
                      value={periodDayIso(key, state.tenancyStart, s.from)}
                      disabled={!editable}
                      onChange={(e) => {
                        const from = isoToPeriodDay(key, state.tenancyStart, e.target.value);
                        if (from === null) return;
                        patchStint(s.id, (st) => {
                          st.from = from;
                        });
                      }}
                    />
                    <span className="text-center sm:w-auto">→</span>
                    <input
                      type="date"
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm tabular-nums outline-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-[9.5rem]"
                      min={startIso}
                      max={endIso}
                      value={periodDayIso(key, state.tenancyStart, s.to)}
                      disabled={!editable}
                      onChange={(e) => {
                        const to = isoToPeriodDay(key, state.tenancyStart, e.target.value);
                        if (to === null) return;
                        patchStint(s.id, (st) => {
                          st.to = to;
                        });
                      }}
                    />
                  </div>
                  <NativeSelect
                    className="w-full sm:w-auto"
                    value={s.roomId}
                    disabled={!editable}
                    onChange={(e) => {
                      patchStint(s.id, (st) => {
                        st.roomId = e.target.value;
                      });
                    }}
                  >
                    {state.rooms.map((r) => (
                      <NativeSelectOption key={r.id} value={r.id} disabled={r.communal}>
                        {r.name}
                        {r.communal ? " (shared)" : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {plural(s.to - s.from + 1, "day")}
                    </span>
                    <div className="flex-1 sm:hidden" />
                    {editable ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (s.to - s.from < 1) {
                              store.announce("A one-day stay can't be split.");
                              return;
                            }
                            commitStints(() => {
                              const month = ensureMonth(store.state, key);
                              const stints = month.stints || [];
                              const cur = stints.find((x) => x.id === s.id);
                              if (!cur) return;
                              const mid = Math.floor((cur.from + cur.to) / 2);
                              const copy: Stint = {
                                ...cur,
                                id: uid("st"),
                                from: mid + 1,
                                to: cur.to,
                              };
                              cur.to = mid;
                              stints.splice(stints.indexOf(cur) + 1, 0, copy);
                            });
                            store.announce(
                              "Split in two — adjust the dates, or delete the half that was away.",
                            );
                          }}
                        >
                          Split
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="max-sm:size-10"
                          title="Remove"
                          onClick={() => {
                            commitStints(() => {
                              const month = ensureMonth(store.state, key);
                              month.stints = (month.stints || []).filter((x) => x.id !== s.id);
                            });
                          }}
                        >
                          <XIcon />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const p = selfOnly
                ? state.people.find((x) => x.id === myId)
                : state.people.find((x) => !x.archived);
              if (!p) {
                store.announce(
                  selfOnly ? "Pick who you are first." : "Add someone on the Household page first.",
                );
                return;
              }
              commitStints(() => {
                const month = ensureMonth(store.state, key);
                const length = tenancyPeriodLength(key, store.state.tenancyStart);
                month.stints.push({
                  id: uid("st"),
                  personId: p.id,
                  roomId: lastRoomOf(store.state, p.id),
                  from: 1,
                  to: length,
                });
              });
            }}
          >
            Add dates
          </Button>
          {selfOnly ? null : (
            <Button
              variant="ghost"
              onClick={async () => {
                if ((M.stints || []).length) {
                  if (
                    !(await ask({
                      title: "Reset this month's dates?",
                      description:
                        "Visitor stays and away periods you've entered for this month are lost.",
                      confirmLabel: "Reset",
                      destructive: true,
                    }))
                  ) {
                    return;
                  }
                }
                store.mutate(() => {
                  seedStints(store.state, key);
                });
                store.announce("Dates reset.");
              }}
            >
              Reset from last month
            </Button>
          )}
          {selfOnly ? null : (
            <Button
              variant="ghost"
              onClick={() => {
                if (state.people.filter((p) => !p.archived).length >= MAX_PEOPLE) {
                  store.announce(`That's the limit of ${MAX_PEOPLE} people.`);
                  return;
                }
                setAddingPerson(true);
              }}
            >
              Add someone new
            </Button>
          )}
        </div>
      </Panel>
      </div>
      </div>
      <TextPromptDialog
        request={
          addingPerson
            ? {
                title: "Add someone new",
                description: "They will get a short stay this month so you can set the dates.",
                label: "Name",
                defaultValue: "Someone new",
                confirmLabel: "Add",
              }
            : null
        }
        onClose={() => setAddingPerson(false)}
        onConfirm={(name) => {
          commitStints(() => {
            const length = tenancyPeriodLength(key, store.state.tenancyStart);
            const room = store.state.rooms.find((r) => !r.communal)?.id ?? "";
            const person = {
              id: uid("p"),
              name: name || "Someone new",
              isPayer: false,
              archived: false,
            };
            store.state.people.push(person);
            const mid = Math.max(1, Math.round(length / 3));
            ensureMonth(store.state, key).stints.push({
              id: uid("st"),
              personId: person.id,
              roomId: room,
              from: mid,
              to: Math.min(length, mid + 6),
            });
          });
          setAddingPerson(false);
          store.setTab("stints");
          store.announce("Added — set their dates and which bedroom they're in.");
        }}
      />
    </Screen>
  );
}

type HouseChartProps = {
  days: DayModel[];
  people: Person[];
  rooms: Room[];
  gaps: BedroomGap[];
  state: HouseholdState;
  editable: (personId: string) => boolean;
  onToggle: (personId: string, periodDay: number) => void;
};

type DatedDay = { day: DayModel; index: number };

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function mondayWeeks(days: DayModel[]): Array<Array<DatedDay | null>> {
  const first = days[0];
  if (!first) return [];
  const leading = mondayIndex(dayDate(first.key, first.d));
  const padded: Array<DatedDay | null> = Array.from({ length: leading }, () => null);
  days.forEach((day, index) => padded.push({ day, index }));
  const weeks: Array<Array<DatedDay | null>> = [];
  for (let start = 0; start < padded.length; start += 7) {
    const week = padded.slice(start, start + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function personIsSharing(day: DayModel, personId: string): boolean {
  for (const occupants of Object.values(day.rooms)) {
    if (occupants.includes(personId) && occupants.length > 1) return true;
  }
  return false;
}

function bedroomClass(occupants: number): string {
  if (occupants > 1) return "bg-emerald-500 ring-1 ring-inset ring-foreground/60";
  if (occupants > 0) return "bg-emerald-500/80";
  return "bg-destructive/25 ring-1 ring-destructive";
}

function HouseWeeks(props: HouseChartProps) {
  const weeks = mondayWeeks(props.days);
  const bedrooms = props.rooms.filter((room) => !room.communal);
  return (
    <div className="lg:hidden">
      <div className="mb-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <div />
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className={`text-center text-[10px] ${
                index >= 5 ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      {weeks.map((week, weekIndex) => {
        const first = week.find((cell) => cell !== null);
        return (
          <div
            key={first ? `${first.day.key}-${first.day.d}` : `week-${weekIndex}`}
            className="mb-4 border-b pb-4 last:mb-0 last:border-b-0 last:pb-0"
          >
            <div className="mb-1 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <div />
              <div className="grid grid-cols-7 gap-1">
                {week.map((cell, column) => (
                  <div
                    key={cell ? `${cell.day.key}-${cell.day.d}` : `blank-${weekIndex}-${column}`}
                    className={`text-center text-[10px] tabular-nums ${
                      column >= 5 ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {cell ? cell.day.d : ""}
                  </div>
                ))}
              </div>
            </div>
            {props.people.map((person) => (
              <div
                key={person.id}
                className="mb-1.5 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <Avatar state={props.state} person={person} size={16} />
                  <span className="truncate text-[11px] font-medium">{person.name}</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {week.map((cell, column) =>
                    cell ? (
                      <div key={`${person.id}-${cell.day.key}-${cell.day.d}`} className="aspect-square">
                        <HouseDayCell
                          personName={person.name}
                          dayLabel={dayMonthLabel(cell.day.key, cell.day.d)}
                          filled={cell.day.liable.includes(person.id)}
                          colour={personColor(props.state, person.id)}
                          sharing={personIsSharing(cell.day, person.id)}
                          editable={props.editable(person.id)}
                          onToggle={() => props.onToggle(person.id, cell.index + 1)}
                        />
                      </div>
                    ) : (
                      <div key={`${person.id}-blank-${weekIndex}-${column}`} />
                    ),
                  )}
                </div>
              </div>
            ))}
            <div className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <div />
              <div className="grid grid-cols-7 gap-1">
                {week.map((cell, column) => (
                  <div
                    key={cell ? `count-${cell.day.key}-${cell.day.d}` : `count-blank-${weekIndex}-${column}`}
                    className={
                      cell
                        ? "flex h-6 items-center justify-center rounded-[3px] bg-muted text-[10px] font-bold tabular-nums text-muted-foreground"
                        : "h-6"
                    }
                  >
                    {cell ? cell.day.liable.length : ""}
                  </div>
                ))}
              </div>
            </div>
            {bedrooms.length ? (
              <div className="mt-3">
                {weekIndex === 0 ? (
                  <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Bedrooms
                  </div>
                ) : null}
                {bedrooms.map((room) => {
                  const gap = props.gaps.find((item) => item.roomId === room.id);
                  return (
                    <div
                      key={room.id}
                      className="mb-1.5 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
                    >
                      <div
                        className={`truncate text-[11px] font-medium ${gap ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {room.name}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {week.map((cell, column) => {
                          const occupants = cell ? (cell.day.rooms[room.id] || []).length : 0;
                          return cell ? (
                            <div
                              key={`${room.id}-${cell.day.key}-${cell.day.d}`}
                              title={`${room.name} — ${cell.day.d} ${cell.day.key}: ${occupants ? plural(occupants, "person", "people") : "EMPTY"}`}
                              className={`h-6 rounded-[3px] ${bedroomClass(occupants)}`}
                            />
                          ) : (
                            <div key={`${room.id}-blank-${weekIndex}-${column}`} />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">people in the house each day</p>
    </div>
  );
}

type HouseDayCellProps = {
  personName: string;
  dayLabel: string;
  filled: boolean;
  colour: string;
  sharing: boolean;
  editable: boolean;
  onToggle: () => void;
};

function HouseDayCell(props: HouseDayCellProps) {
  const className = [
    "block h-full w-full min-w-0 rounded-[3px] border-0 p-0",
    props.filled ? "" : "bg-muted",
    props.sharing ? "ring-1 ring-inset ring-white/85" : "",
    props.editable
      ? "cursor-pointer touch-manipulation select-none hover:ring-2 hover:ring-inset hover:ring-foreground/80 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:opacity-70"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = props.filled ? { background: props.colour } : undefined;
  const presence = props.filled ? "in the house" : "away";
  const label = `${props.personName}, ${props.dayLabel}, ${presence}`;

  if (!props.editable) {
    return <div className={className} style={style} title={label} />;
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-pressed={props.filled}
      aria-label={props.filled ? `${label}. Mark away` : `${label}. Mark in the house`}
      title={`${label}. Tap to ${props.filled ? "mark away" : "mark in the house"}`}
      onClick={props.onToggle}
    />
  );
}
