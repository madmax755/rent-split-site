import { useState, type CSSProperties } from "react";
import { cycleDayInMonth, daysInMonth, dayDate, monthLabel } from "../domain/dates";
import { MAX_PEOPLE } from "../domain/defaults";
import { bedroomGaps, buildDayModel } from "../domain/engine";
import { personById, personColor, plural, rangeText } from "../domain/format";
import { uid } from "../domain/ids";
import { ensureMonth, lastRoomOf } from "../domain/months";
import type { Stint } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { Avatar } from "./avatar";
import {
  EditableNumber,
  EmptyState,
  MonthSwitcher,
  PageHeader,
  Panel,
  Screen,
  WarnList,
} from "./kit";
import { TextPromptDialog } from "./text-prompt-dialog";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function StintsScreen() {
  const { store, state, activeTab, version } = useHousehold();
  const selfOnly = store.isTenant();
  const myId = store.linkedPersonId();
  const [addingPerson, setAddingPerson] = useState(false);
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const D = daysInMonth(key);
  const days = buildDayModel(state, key);
  const cols = { gridTemplateColumns: `repeat(${D}, minmax(0, 1fr))` };
  const involved = state.people.filter((p) => (M.stints || []).some((s) => s.personId === p.id));
  const gaps = bedroomGaps(state, key);
  const totalDays = days.reduce((s, d) => s + d.liable.length, 0);
  const gapCount = gaps.reduce((s, g) => s + g.days.length, 0);

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

  if (selfOnly && !myId) {
    return (
      <Screen id="stints" active={activeTab === "stints"}>
        <EmptyState
          title="This login is not linked to a person yet"
          description="Ask the household admin to link your account."
        />
      </Screen>
    );
  }

  return (
    <Screen id="stints" active={activeTab === "stints"}>
      <PageHeader
        title="Who's here"
        description={`${plural((M.stints || []).length, "stint")} · ${totalDays} person-days${gapCount ? ` · ${gapCount} empty bedroom-days` : ""}`}
        actions={<MonthSwitcher />}
      />
      <WarnList
        items={gaps.map(
          (g) =>
            `${g.name} empty on ${g.days.length === D ? "every day" : "day " + rangeText(g.days)}`,
        )}
      />

      <div className="mb-5 overflow-hidden rounded-xl border bg-card" data-store-version={version}>
        <div className="overflow-x-auto p-4">
          {involved.length ? (
            <div className="min-w-[560px]">
              <div className="mb-2 grid gap-0.5 pl-[4.75rem] sm:pl-[116px]" style={cols}>
                {Array.from({ length: D }, (_, i) => {
                  const d = i + 1;
                  const dow = dayDate(key, d).getDay();
                  const wk = dow === 0 || dow === 6;
                  return (
                    <div
                      key={d}
                      className={`tabular-nums text-center text-[9px] ${wk ? "font-bold text-foreground" : "text-muted-foreground"}`}
                    >
                      {d % 2 === 1 || D <= 20 ? d : "\u00a0"}
                    </div>
                  );
                })}
              </div>
              {involved.map((p) => (
                <div key={p.id} className="mb-1.5 flex items-center gap-2.5">
                  <div className="flex w-16 shrink-0 items-center gap-2 sm:w-[106px]">
                    <Avatar state={state} person={p} size={22} />
                    <span className="truncate text-xs font-medium">{p.name}</span>
                  </div>
                  <div className="grid h-6 flex-1 gap-0.5" style={cols}>
                    {Array.from({ length: D }, (_, i) => {
                      const day = days[i];
                      const isHere = day ? day.liable.includes(p.id) : false;
                      let sharing = false;
                      if (day) {
                        Object.keys(day.rooms).forEach((rid) => {
                          const occ = day.rooms[rid] ?? [];
                          if (occ.includes(p.id) && occ.length > 1) sharing = true;
                        });
                      }
                      return (
                        <div
                          key={i}
                          className={`rounded-[3px] ${isHere ? "" : "bg-muted"} ${sharing ? "ring-1 ring-inset ring-white/85" : ""}`}
                          style={isHere ? { background: personColor(state, p.id) } : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="mt-2 grid gap-0.5 pl-[4.75rem] sm:pl-[116px]" style={cols}>
                {days.map((day) => (
                  <div
                    key={day.d}
                    title={
                      state.rentCycleStartDay !== 1 &&
                      day.d === cycleDayInMonth(key, state.rentCycleStartDay)
                        ? "Rent period starts"
                        : undefined
                    }
                    className={`flex h-5 items-center justify-center rounded-[3px] bg-muted text-[9px] font-bold tabular-nums text-muted-foreground ${
                      state.rentCycleStartDay !== 1 &&
                      day.d === cycleDayInMonth(key, state.rentCycleStartDay)
                        ? "shadow-[inset_0_2px_0_var(--primary)] text-primary"
                        : ""
                    }`}
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
                    Bedroom cover
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
                          <div className="grid h-6 flex-1 gap-0.5" style={cols}>
                            {Array.from({ length: D }, (_, i) => {
                              const occ = (days[i]?.rooms[room.id] || []).length;
                              return (
                                <div
                                  key={i}
                                  title={`${room.name} — day ${i + 1}: ${occ ? plural(occ, "person", "people") : "EMPTY"}`}
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
          ) : (
            <EmptyState
              title={`Nobody is down for ${monthLabel(key)} yet`}
              description="Add a stint below, or reset from the roster on This month."
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

      <Panel
        title="Stints"
        description={
          selfOnly
            ? "These dates are when you are paying — usually the same as being in the house."
            : "A stint is a block of days someone is in the house, in one bedroom. Occupancy lives here and nowhere else."
        }
      >
        {!(M.stints || []).length ? (
          <EmptyState title="No stints yet" />
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
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    day
                    <EditableNumber
                      className="w-16 text-center tabular-nums"
                      min={1}
                      max={D}
                      value={s.from}
                      disabled={!editable}
                      onChange={(from) => {
                        patchStint(s.id, (st) => {
                          st.from = from;
                        });
                      }}
                    />
                    →
                    <EditableNumber
                      className="w-16 text-center tabular-nums"
                      min={1}
                      max={D}
                      value={s.to}
                      disabled={!editable}
                      onChange={(to) => {
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
                              store.announce("A one-day stint can't be split.");
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
                  selfOnly
                    ? "This login is not linked to a person yet."
                    : "Add someone on the Household page first.",
                );
                return;
              }
              commitStints(() => {
                const month = ensureMonth(store.state, key);
                month.stints.push({
                  id: uid("st"),
                  personId: p.id,
                  roomId: lastRoomOf(store.state, p.id),
                  from: 1,
                  to: daysInMonth(key),
                });
              });
            }}
          >
            Add a stint
          </Button>
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
      <TextPromptDialog
        request={
          addingPerson
            ? {
                title: "Add someone new",
                description: "They will get a short stint this month so you can set the dates.",
                label: "Name",
                defaultValue: "Someone new",
                confirmLabel: "Add",
              }
            : null
        }
        onClose={() => setAddingPerson(false)}
        onConfirm={(name) => {
          commitStints(() => {
            const daysN = daysInMonth(key);
            const room = store.state.rooms.find((r) => !r.communal)?.id ?? "";
            const person = {
              id: uid("p"),
              name: name || "Someone new",
              isPayer: false,
              archived: false,
            };
            store.state.people.push(person);
            const mid = Math.max(1, Math.round(daysN / 3));
            ensureMonth(store.state, key).stints.push({
              id: uid("st"),
              personId: person.id,
              roomId: room,
              from: mid,
              to: Math.min(daysN, mid + 6),
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
