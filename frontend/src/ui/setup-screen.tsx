import { clampTenancyStart, tenancyMonthKey, tenancyMonthLabel } from "../domain/dates";
import { DEFAULT_TENANCY_START } from "../domain/defaults";
import { MAX_PEOPLE } from "../domain/defaults";
import { weightedAreas } from "../domain/engine";
import { fmtNum, money, personById, plural } from "../domain/format";
import { uid } from "../domain/ids";
import { ensureMonth, lastRoomOf, sortedMonthKeys } from "../domain/months";
import { normalise } from "../domain/normalise";
import type { CurrencySymbol } from "../domain/types";
import { XIcon } from "lucide-react";
import { useHousehold } from "../store/household-context";
import { AccessSection } from "./access-section";
import { Avatar } from "./avatar";
import { useConfirm } from "./confirm-dialog";
import { EditableText, MoneyInput, PageHeader, Panel, Screen } from "./kit";
import { NumericField } from "./numeric-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function isCurrency(v: string): v is CurrencySymbol {
  return v === "£" || v === "$" || v === "€";
}

export function SetupScreen() {
  const { store, state, activeTab } = useHousehold();
  const ask = useConfirm();
  const ordered = state.people.slice().sort((a, c) => (a.archived ? 1 : 0) - (c.archived ? 1 : 0));
  const live = state.people.filter((p) => !p.archived);
  const arch = state.people.length - live.length;
  const { total, ca } = weightedAreas(state);
  const totalArea =
    state.rooms.reduce((s, r) => s + (+r.w || 0) * (+r.l || 0), 0) + (+state.catchall || 0);
  const monthly = state.bills.reduce((s, b) => s + (+b.est || 0), 0);
  const hallPct = total > 0 ? ((ca / total) * 100).toFixed(1) + "%" : "—";

  return (
    <Screen id="setup" active={activeTab === "setup"}>
      <PageHeader
        title="Household"
        description="People, rooms, bills and the standing rent — the house as it is set up, not this month's figures."
      />
      <Tabs defaultValue="people" className="gap-5">
        <TabsList
          variant="line"
          className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b bg-transparent p-0"
        >
          <TabsTrigger value="people" className="px-3">
            People
          </TabsTrigger>
          <TabsTrigger value="rooms" className="px-3">
            Rooms
          </TabsTrigger>
          <TabsTrigger value="bills" className="px-3">
            Bills
          </TabsTrigger>
          <TabsTrigger value="rent" className="px-3">
            Rent
          </TabsTrigger>
          {store.adapter.listAccounts ? (
            <TabsTrigger value="logins" className="px-3">
              Logins
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="people">
          <Panel
            id="people"
            description={`${plural(live.length, "person", "people")}${arch ? ` · ${arch} archived` : ""}. When they are here, and which bedroom they are in, is recorded on Who's here.`}
          >
            <div className="grid gap-2">
              {ordered.map((p) => {
                const months = sortedMonthKeys(state).filter((k) =>
                  (state.months[k]?.stints || []).some((st) => st.personId === p.id),
                );
                const where = months.length
                  ? `in ${plural(months.length, "month")} · ${tenancyMonthLabel(months[0] ?? "", true)}–${tenancyMonthLabel(months[months.length - 1] ?? "", true)}`
                  : "no stints yet";
                return (
                  <div
                    key={p.id}
                    className={`flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 ${p.archived ? "opacity-60" : ""}`}
                  >
                    <Avatar state={state} person={p} size={32} />
                    <div className="min-w-0 flex-1">
                      <EditableText
                        value={p.name}
                        className="h-7 border-transparent bg-transparent px-1 font-medium shadow-none"
                        onChange={(name) => {
                          store.mutate(() => {
                            const person = personById(store.state, p.id);
                            if (person) person.name = name;
                          });
                        }}
                      />
                      <div className="px-1 text-xs text-muted-foreground">{where}</div>
                    </div>
                    {p.archived ? (
                      <>
                        <Badge variant="secondary">Archived</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            store.mutate(() => {
                              const person = personById(store.state, p.id);
                              if (person) person.archived = false;
                            });
                            store.announce(`${p.name} is back — give them a stint on Who's here.`);
                          }}
                        >
                          Bring back
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant={p.isPayer ? "default" : "outline"}
                        size="sm"
                        title="Pays the landlord and the providers; everyone settles with them"
                        onClick={() => {
                          store.mutate(() => {
                            store.state.people.forEach((person) => {
                              person.isPayer = person.id === p.id;
                            });
                          });
                        }}
                      >
                        {p.isPayer ? "Pays the bills" : "Make payer"}
                      </Button>
                    )}
                    {state.people.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-sm:size-10"
                        title="Remove"
                        onClick={() => {
                          void (async () => {
                            const person = personById(state, p.id);
                            if (!person) return;
                            const locked = sortedMonthKeys(state).filter(
                              (k) =>
                                state.months[k]?.collected &&
                                (state.months[k]?.stints || []).some(
                                  (st) => st.personId === person.id,
                                ),
                            );
                            if (locked.length) {
                              if (
                                !(await ask({
                                  title: `Archive ${person.name}?`,
                                  description: `They appear in ${plural(locked.length, "month")} already locked (${locked.map((k) => tenancyMonthLabel(k, true)).join(", ")}). Those months stay exactly as they were charged. ${person.name} will be archived — off the roster and out of future months, but still on Settle until settled.`,
                                  confirmLabel: "Archive",
                                  destructive: true,
                                }))
                              ) {
                                return;
                              }
                              store.mutate(() => {
                                const cur = personById(store.state, p.id);
                                if (!cur) return;
                                cur.archived = true;
                                cur.isPayer = false;
                                Object.values(store.state.months).forEach((M) => {
                                  if (M.collected) return;
                                  M.stints = (M.stints || []).filter(
                                    (st) => st.personId !== cur.id,
                                  );
                                });
                                const rest = store.state.people.filter((x) => !x.archived);
                                if (!rest.some((x) => x.isPayer) && rest[0]) rest[0].isPayer = true;
                                normalise(store.state);
                              });
                            } else {
                              if (
                                !(await ask({
                                  title: `Remove ${person.name}?`,
                                  description:
                                    "They are in no locked month, so this deletes them outright.",
                                  confirmLabel: "Remove",
                                  destructive: true,
                                }))
                              ) {
                                return;
                              }
                              store.mutate(() => {
                                store.state.people = store.state.people.filter(
                                  (x) => x.id !== p.id,
                                );
                                Object.values(store.state.months).forEach((M) => {
                                  M.stints = (M.stints || []).filter((st) => st.personId !== p.id);
                                });
                                const rest = store.state.people.filter((x) => !x.archived);
                                if (!rest.some((x) => x.isPayer) && rest[0]) rest[0].isPayer = true;
                                normalise(store.state);
                              });
                            }
                            void store.adapter.disablePersonLogin?.(p.id);
                          })();
                        }}
                      >
                        <XIcon />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                if (state.people.filter((p) => !p.archived).length >= MAX_PEOPLE) {
                  store.announce(`That's the limit of ${MAX_PEOPLE} people.`);
                  return;
                }
                store.mutate(() => {
                  store.state.people.push({
                    id: uid("p"),
                    name: `Person ${store.state.people.length + 1}`,
                    isPayer: false,
                    archived: false,
                  });
                });
              }}
            >
              Add someone
            </Button>
          </Panel>
        </TabsContent>

        <TabsContent value="rooms">
          <Panel
            id="rooms"
            description={`${state.rooms.length} rooms · ${fmtNum(totalArea, 0)} m² · weighted ${fmtNum(total)} m² · ${total > 0 ? money(state.currency, Math.round(state.rent * 100) / total) : "—"} per m²`}
          >
            {state.rooms.map((room) => {
              const area = (+room.w || 0) * (+room.l || 0);
              const weighted = area * (typeof room.weight === "number" ? room.weight : 1);
              const holders = state.people
                .filter((p) => !p.archived && lastRoomOf(state, p.id) === room.id)
                .map((p) => p.name);
              return (
                <div key={room.id} className="mb-3 rounded-xl bg-muted/50 p-3 last:mb-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <EditableText
                      value={room.name}
                      className="h-8 min-w-32 flex-1 border-transparent bg-transparent font-medium shadow-none"
                      onChange={(name) => {
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.name = name;
                        });
                      }}
                    />
                    <ButtonGroup className="flex-wrap">
                      <Button
                        size="sm"
                        variant={room.communal ? "outline" : "default"}
                        onClick={() => {
                          store.mutate(() => {
                            const r = store.state.rooms.find((x) => x.id === room.id);
                            if (r) r.communal = false;
                          });
                        }}
                      >
                        Private bedroom
                      </Button>
                      <Button
                        size="sm"
                        variant={room.communal ? "default" : "outline"}
                        onClick={() => {
                          store.mutate(() => {
                            const r = store.state.rooms.find((x) => x.id === room.id);
                            if (r) r.communal = true;
                          });
                        }}
                      >
                        Shared space
                      </Button>
                    </ButtonGroup>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {fmtNum(area)} m² · weighted {fmtNum(weighted)} m²
                    </span>
                    {state.rooms.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-sm:size-10"
                        title="Remove"
                        onClick={() => {
                          void (async () => {
                            const lockedR = sortedMonthKeys(state).filter(
                              (k) => state.months[k]?.collected,
                            ).length;
                            if (
                              !(await ask({
                                title: `Remove ${room.name}?`,
                                description:
                                  "Rent is redistributed across the remaining rooms from now on." +
                                  (lockedR
                                    ? ` The ${plural(lockedR, "locked month")} keep the layout they were charged on.`
                                    : ""),
                                confirmLabel: "Remove",
                                destructive: true,
                              }))
                            ) {
                              return;
                            }
                            store.mutate(() => {
                              store.state.rooms = store.state.rooms.filter((x) => x.id !== room.id);
                              normalise(store.state);
                            });
                          })();
                        }}
                      >
                        <XIcon />
                      </Button>
                    ) : null}
                  </div>
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    <DimField
                      label="Width"
                      suffix="m"
                      value={room.w}
                      onChange={(v) => {
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.w = v;
                        });
                      }}
                    />
                    <DimField
                      label="Length"
                      suffix="m"
                      value={room.l}
                      onChange={(v) => {
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.l = v;
                        });
                      }}
                    />
                    <DimField
                      label="Weight"
                      suffix="×"
                      value={room.weight}
                      onChange={(v) => {
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.weight = v;
                        });
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {room.communal
                      ? "Split among everyone liable on each day."
                      : holders.length
                        ? `Held by ${holders.join(" and ")}.`
                        : "Nobody holds this room — its rent gets spread across everyone."}
                  </p>
                </div>
              );
            })}
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                store.mutate(() => {
                  store.state.rooms.push({
                    id: uid("rm"),
                    name: "New room",
                    w: 3,
                    l: 3,
                    weight: 1,
                    communal: false,
                  });
                });
              }}
            >
              Add a room
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Weight scales how much a room counts toward rent — a bathroom at 0.5× is treated as
              half its floor area. Private rooms are paid for by whoever is liable for them; shared
              rooms are split among everyone liable that day.
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="bills">
          <Panel
            id="bills"
            description={`${state.bills.length} bills · ~${state.currency}${Math.round(monthly).toLocaleString()}/mo. The usual amount is only the starting figure for months you haven't filled in yet.`}
          >
            {state.bills.map((b) => {
              const restricted = Array.isArray(b.payers) && b.payers.length > 0;
              return (
                <div key={b.id} className="mb-3 rounded-xl bg-muted/50 p-3 last:mb-0">
                  <div className="mb-2 flex items-center gap-2">
                    <EditableText
                      value={b.name}
                      className="h-8 min-w-0 flex-1 border-transparent bg-transparent font-medium shadow-none"
                      onChange={(name) => {
                        store.mutate(() => {
                          const bill = store.state.bills.find((x) => x.id === b.id);
                          if (bill) bill.name = name;
                        });
                      }}
                    />
                    {state.bills.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-sm:size-10"
                        title="Remove"
                        onClick={() => {
                          void (async () => {
                            const locked = sortedMonthKeys(state).filter(
                              (k) => state.months[k]?.collected,
                            );
                            if (
                              !(await ask({
                                title: `Remove ${b.name}?`,
                                description: locked.length
                                  ? `It stops appearing in new and unlocked months. The ${plural(locked.length, "month")} you have already locked keep it exactly as it was charged.`
                                  : "Its figures come out of every month on record.",
                                confirmLabel: "Remove",
                                destructive: true,
                              }))
                            ) {
                              return;
                            }
                            store.mutate(() => {
                              store.state.bills = store.state.bills.filter((x) => x.id !== b.id);
                              Object.values(store.state.months).forEach((M) => {
                                if (!M.collected) delete M.lines[b.id];
                              });
                            });
                          })();
                        }}
                      >
                        <XIcon />
                      </Button>
                    ) : null}
                  </div>
                  <div className="mb-3 flex max-w-xs items-center gap-2">
                    <MoneyInput
                      currency={state.currency}
                      value={b.est}
                      min={0}
                      onChange={(v) => {
                        store.mutate(() => {
                          const bill = store.state.bills.find((x) => x.id === b.id);
                          if (bill) bill.est = typeof v === "number" ? v : 0;
                        });
                      }}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">/ tenancy month</span>
                  </div>
                  <div className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Who pays into it{restricted ? "" : " — everyone"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {state.people
                      .filter((p) => !p.archived)
                      .map((p) => {
                        const on = !restricted || (b.payers ?? []).includes(p.id);
                        return (
                          <Button
                            key={p.id}
                            size="sm"
                            variant={on ? "secondary" : "outline"}
                            onClick={() => {
                              store.mutate(() => {
                                const bill = store.state.bills.find((x) => x.id === b.id);
                                if (!bill) return;
                                const all = store.state.people.map((person) => person.id);
                                let cur =
                                  Array.isArray(bill.payers) && bill.payers.length
                                    ? bill.payers.slice()
                                    : all.slice();
                                cur = on
                                  ? cur.filter((x) => x !== p.id)
                                  : [...new Set([...cur, p.id])];
                                bill.payers = cur.length === all.length ? null : cur;
                              });
                            }}
                          >
                            {p.name}
                          </Button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                store.mutate(() => {
                  const bill = {
                    id: uid("bl"),
                    name: "New bill",
                    est: 0,
                    payers: null,
                    cycleStartDay: 1,
                  };
                  store.state.bills.push(bill);
                  Object.values(store.state.months).forEach((M) => {
                    M.lines[bill.id] = { est: 0, act: null };
                  });
                });
              }}
            >
              Add a bill
            </Button>
          </Panel>
        </TabsContent>

        <TabsContent value="rent">
          <Panel
            id="rent"
            title="Standing rent & shared space"
            description="The standing rent is what every new tenancy month starts from. Splits follow the tenancy period from the start date. To change one month only, edit rent on This tenancy month."
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <span className="font-medium">Tenancy start</span>
                <input
                  type="date"
                  className="h-8 max-w-56 rounded-lg border border-input bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={state.tenancyStart}
                  onChange={(e) => {
                    const next = clampTenancyStart(e.target.value, DEFAULT_TENANCY_START);
                    store.mutate(() => {
                      store.state.tenancyStart = next;
                      const floor = tenancyMonthKey(next);
                      if (store.state.currentMonth < floor) {
                        store.state.currentMonth = floor;
                        ensureMonth(store.state, floor);
                      }
                    });
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  Every tenancy month runs from this day of the month to the day before it in the
                  next calendar month — for example 9 August to 8 September. The full rent for that
                  period is split; nothing is kicked into the following month.
                </span>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Currency</span>
                <NativeSelect
                  value={state.currency}
                  onChange={(e) => {
                    if (!isCurrency(e.target.value)) return;
                    const cur = e.target.value;
                    store.mutate(() => {
                      store.state.currency = cur;
                    });
                  }}
                >
                  <NativeSelectOption value="£">£</NativeSelectOption>
                  <NativeSelectOption value="$">$</NativeSelectOption>
                  <NativeSelectOption value="€">€</NativeSelectOption>
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Standing monthly rent</span>
                <MoneyInput
                  currency={state.currency}
                  value={state.rent}
                  min={0}
                  step={10}
                  onChange={(v) => {
                    store.mutate(() => {
                      store.state.rent = typeof v === "number" ? v : 0;
                    });
                  }}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DimField
                label="Hallway / stairs area"
                suffix="m²"
                value={state.catchall}
                onChange={(v) => {
                  store.mutate(() => {
                    store.state.catchall = v;
                  });
                }}
              />
              <DimField
                label="Hallway weight"
                suffix="×"
                value={state.catchallWeight}
                onChange={(v) => {
                  store.mutate(() => {
                    store.state.catchallWeight = v < 0 ? 0 : v;
                  });
                }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The hallway is {fmtNum(+state.catchall || 0)} m². At {fmtNum(state.catchallWeight, 2)}
              × it enters the calculation as {fmtNum(ca)} m², so it accounts for {hallPct} of the
              rent.
            </p>
          </Panel>
        </TabsContent>

        {store.adapter.listAccounts ? (
          <TabsContent value="logins" keepMounted>
            <AccessSection />
          </TabsContent>
        ) : null}
      </Tabs>
    </Screen>
  );
}

function DimField(props: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {props.label}
      </span>
      <div className="flex items-center gap-1.5">
        <NumericField
          className="tabular-nums"
          min={0}
          value={props.value}
          aria-label={props.label}
          onChange={props.onChange}
        />
        <span className="text-xs text-muted-foreground">{props.suffix}</span>
      </div>
    </label>
  );
}
