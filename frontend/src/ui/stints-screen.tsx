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
import { resolvePersonOverlaps, togglePersonDay } from "../domain/stint-edit";
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
      month.stints = resolvePersonOverlaps(stints, s.personId, () => uid("st"), s.id);
    });
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
        className="order-2 overflow-x-clip rounded-xl border bg-card lg:order-1"
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
            <HouseDays
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
        <div className="hidden gap-4 border-t px-4 py-3 text-xs text-muted-foreground lg:flex lg:flex-wrap">
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
          <div className="grid gap-3">
            {groupStintsByPerson(M.stints || [], state.people).map((stints) => {
              const personId = stints[0]?.personId ?? "";
              const person = personById(state, personId);
              const editable = canEditPerson(personId);
              return (
                <PersonDatesCard
                  key={personId}
                  person={person}
                  colour={person ? personColor(state, person.id) : "var(--muted-foreground)"}
                  stints={stints}
                  people={state.people}
                  rooms={state.rooms}
                  editable={editable}
                  selfOnly={selfOnly}
                  startIso={startIso}
                  endIso={endIso}
                  dateFor={(day) => periodDayIso(key, state.tenancyStart, day)}
                  onPerson={(nextId) => {
                    commitStints(() => {
                      const month = ensureMonth(store.state, key);
                      for (const stint of month.stints || []) {
                        if (stint.personId === personId) stint.personId = nextId;
                      }
                      month.stints = resolvePersonOverlaps(
                        month.stints || [],
                        nextId,
                        () => uid("st"),
                      );
                    });
                  }}
                  onFrom={(id, iso) => {
                    const from = isoToPeriodDay(key, state.tenancyStart, iso);
                    if (from === null) return;
                    patchStint(id, (stint) => {
                      stint.from = from;
                    });
                  }}
                  onTo={(id, iso) => {
                    const to = isoToPeriodDay(key, state.tenancyStart, iso);
                    if (to === null) return;
                    patchStint(id, (stint) => {
                      stint.to = to;
                    });
                  }}
                  onRoom={(id, roomId) => {
                    patchStint(id, (stint) => {
                      stint.roomId = roomId;
                    });
                  }}
                  onSplit={(id) => {
                    const current = stints.find((stint) => stint.id === id);
                    if (!current || current.to - current.from < 1) {
                      store.announce("A one-day stay can't be split.");
                      return;
                    }
                    commitStints(() => {
                      const month = ensureMonth(store.state, key);
                      const list = month.stints || [];
                      const cur = list.find((stint) => stint.id === id);
                      if (!cur) return;
                      const mid = Math.floor((cur.from + cur.to) / 2);
                      const copy: Stint = { ...cur, id: uid("st"), from: mid + 1, to: cur.to };
                      cur.to = mid;
                      list.splice(list.indexOf(cur) + 1, 0, copy);
                    });
                    store.announce("Split in two — adjust the dates, or delete the half that was away.");
                  }}
                  onRemove={(id) => {
                    commitStints(() => {
                      const month = ensureMonth(store.state, key);
                      month.stints = (month.stints || []).filter((stint) => stint.id !== id);
                    });
                  }}
                />
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
              const length = tenancyPeriodLength(key, store.state.tenancyStart);
              const daysDown = days.filter((day) => day.liable.includes(p.id)).length;
              if (daysDown >= length) {
                store.announce(`${p.name} is already down for every day.`);
                return;
              }
              commitStints(() => {
                const month = ensureMonth(store.state, key);
                month.stints = resolvePersonOverlaps(
                  [
                    ...(month.stints || []),
                    {
                      id: uid("st"),
                      personId: p.id,
                      roomId: lastRoomOf(store.state, p.id),
                      from: 1,
                      to: length,
                    },
                  ],
                  p.id,
                  () => uid("st"),
                );
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

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekdayName(date: Date): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[date.getDay()] ?? "Sun";
}

function monthHeading(key: string, day: number): string {
  return dayDate(key, day).toLocaleDateString("en-GB", { month: "long" });
}

function personIsSharing(day: DayModel, personId: string): boolean {
  for (const occupants of Object.values(day.rooms)) {
    if (occupants.includes(personId) && occupants.length > 1) return true;
  }
  return false;
}

function bedroomDotClass(occupants: number): string {
  if (occupants > 0) return "bg-emerald-500/70";
  return "ring-[1.5px] ring-inset ring-destructive";
}

function emptyBedroomNames(day: DayModel, bedrooms: Room[]): string[] {
  return bedrooms.filter((room) => !(day.rooms[room.id] || []).length).map((room) => room.name);
}

function HouseDays(props: HouseChartProps) {
  const bedrooms = props.rooms.filter((room) => !room.communal);
  const columns = [
    "2.75rem",
    `repeat(${Math.max(props.people.length, 1)}, minmax(0, 1fr))`,
    bedrooms.length ? "2rem" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="lg:hidden">
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-3 w-4 rounded-[4px] bg-muted" /> Away
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-3 w-4 rounded-[4px] bg-muted-foreground/50 ring-1 ring-inset ring-white/85" />{" "}
          Sharing a room
        </span>
        {bedrooms.length ? (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-[5px] rounded-full ring-[1.5px] ring-inset ring-destructive" />{" "}
            Empty bedroom
          </span>
        ) : null}
      </div>
      <div
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 grid items-end gap-x-1.5 border-b border-border/60 bg-card/95 px-4 pt-2 pb-2 backdrop-blur"
        style={{ gridTemplateColumns: columns }}
      >
        <div />
        {props.people.map((person) => (
          <div key={person.id} className="flex min-w-0 flex-col items-center gap-1">
            <Avatar state={props.state} person={person} size={20} />
            <span className="w-full truncate text-center text-[11px] leading-tight font-medium">
              {person.name}
            </span>
          </div>
        ))}
        {bedrooms.length ? (
          <div className="pb-px text-center text-[10px] text-muted-foreground">Rooms</div>
        ) : null}
      </div>
      {props.days.map((day, index) => {
        const date = dayDate(day.key, day.d);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        const previous = props.days[index - 1];
        const showMonth = !previous || previous.key !== day.key;
        const newWeek = index > 0 && !showMonth && date.getDay() === 1;
        const empty = emptyBedroomNames(day, bedrooms);
        return (
          <div key={`${day.key}-${day.d}`}>
            {showMonth ? (
              <div className="pt-3 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {monthHeading(day.key, day.d)}
              </div>
            ) : null}
            <div
              className={`grid items-center gap-x-1.5 py-[3px] ${newWeek ? "mt-2 border-t border-border/50 pt-[11px]" : ""}`}
              style={{ gridTemplateColumns: columns }}
            >
              <div className="flex items-baseline gap-1 tabular-nums">
                <span
                  className={`w-4 text-right text-sm ${weekend ? "font-semibold text-foreground" : "font-medium text-foreground/85"}`}
                >
                  {day.d}
                </span>
                <span
                  className={`text-[10px] ${weekend ? "font-medium text-foreground/80" : "text-muted-foreground"}`}
                >
                  {weekdayName(date)}
                </span>
              </div>
              {props.people.map((person) => (
                <div key={person.id} className="mx-auto h-7 w-full max-w-14 overflow-hidden rounded-md">
                  <HouseDayCell
                    personName={person.name}
                    dayLabel={dayMonthLabel(day.key, day.d)}
                    filled={day.liable.includes(person.id)}
                    colour={personColor(props.state, person.id)}
                    sharing={personIsSharing(day, person.id)}
                    editable={props.editable(person.id)}
                    onToggle={() => props.onToggle(person.id, index + 1)}
                  />
                </div>
              ))}
              {bedrooms.length ? (
                <div
                  className="flex items-center justify-center gap-[3px] px-0.5"
                  title={
                    empty.length
                      ? `${dayMonthLabel(day.key, day.d)}: ${empty.join(", ")} empty`
                      : `${dayMonthLabel(day.key, day.d)}: every bedroom taken`
                  }
                >
                  {bedrooms.map((room) => (
                    <i
                      key={room.id}
                      className={`block h-4 w-[5px] rounded-full ${bedroomDotClass((day.rooms[room.id] || []).length)}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
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

const dateInputClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm tabular-nums outline-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function groupStintsByPerson(stints: Stint[], people: Person[]): Stint[][] {
  const buckets = new Map<string, Stint[]>();
  for (const stint of stints) {
    const bucket = buckets.get(stint.personId);
    if (bucket) bucket.push(stint);
    else buckets.set(stint.personId, [stint]);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.from - b.from || a.to - b.to || (a.id < b.id ? -1 : 1));
  }
  const groups: Stint[][] = [];
  const seen = new Set<string>();
  for (const person of people) {
    const bucket = buckets.get(person.id);
    if (!bucket) continue;
    groups.push(bucket);
    seen.add(person.id);
  }
  for (const [personId, bucket] of buckets) {
    if (!seen.has(personId)) groups.push(bucket);
  }
  return groups;
}

type PersonDatesCardProps = {
  person: Person | null;
  colour: string;
  stints: Stint[];
  people: Person[];
  rooms: Room[];
  editable: boolean;
  selfOnly: boolean;
  startIso: string;
  endIso: string;
  dateFor: (periodDay: number) => string;
  onPerson: (personId: string) => void;
  onFrom: (stintId: string, iso: string) => void;
  onTo: (stintId: string, iso: string) => void;
  onRoom: (stintId: string, roomId: string) => void;
  onSplit: (stintId: string) => void;
  onRemove: (stintId: string) => void;
};

function PersonDatesCard(props: PersonDatesCardProps) {
  const personId = props.stints[0]?.personId ?? "";
  return (
    <div
      className={`rounded-xl bg-muted/50 p-3 ${props.editable ? "" : "opacity-70"}`}
      data-person-dates={personId}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: props.colour } as CSSProperties}
        />
        {props.selfOnly || !props.editable ? (
          <span className="min-w-0 flex-1 font-medium">{props.person?.name ?? "Unknown"}</span>
        ) : (
          <NativeSelect
            className="min-w-0 flex-1 sm:max-w-56"
            value={personId}
            onChange={(event) => props.onPerson(event.target.value)}
          >
            {props.people.map((person) => (
              <NativeSelectOption key={person.id} value={person.id}>
                {person.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {props.stints.map((stint) => (
          <div key={stint.id} className="grid min-w-0 gap-2">
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] text-muted-foreground">From</span>
              <input
                type="date"
                className={dateInputClass}
                min={props.startIso}
                max={props.endIso}
                value={props.dateFor(stint.from)}
                disabled={!props.editable}
                onChange={(event) => props.onFrom(stint.id, event.target.value)}
              />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] text-muted-foreground">To</span>
              <input
                type="date"
                className={dateInputClass}
                min={props.startIso}
                max={props.endIso}
                value={props.dateFor(stint.to)}
                disabled={!props.editable}
                onChange={(event) => props.onTo(stint.id, event.target.value)}
              />
            </label>
            <NativeSelect
              className="w-full min-w-0"
              value={stint.roomId}
              disabled={!props.editable}
              aria-label={`${props.person?.name ?? "Stay"} bedroom`}
              onChange={(event) => props.onRoom(stint.id, event.target.value)}
            >
              {props.rooms.map((room) => (
                <NativeSelectOption key={room.id} value={room.id} disabled={room.communal}>
                  {room.name}
                  {room.communal ? " (shared)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-xs text-muted-foreground">
                {plural(stint.to - stint.from + 1, "day")}
              </span>
              <div className="flex-1" />
              {props.editable ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => props.onSplit(stint.id)}>
                    Split
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Remove"
                    onClick={() => props.onRemove(stint.id)}
                  >
                    <XIcon />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
