import { monthLabel } from "../domain/dates";
import { MAX_PEOPLE } from "../domain/defaults";
import { weightedAreas } from "../domain/engine";
import { fmtNum, money, personById, plural } from "../domain/format";
import { uid } from "../domain/ids";
import { lastRoomOf, sortedMonthKeys } from "../domain/months";
import { normalise } from "../domain/normalise";
import { useHousehold } from "../store/household-context";
import { AccessSection } from "./access-section";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
import { screenClass } from "./screen-class";
import { Section } from "./section";

type SetupScreenProps = {
  onToggleSection: (id: string) => void;
};

export function SetupScreen(props: SetupScreenProps) {
  const { store, state, activeTab } = useHousehold();
  const ordered = state.people.slice().sort((a, c) => (a.archived ? 1 : 0) - (c.archived ? 1 : 0));
  const live = state.people.filter((p) => !p.archived);
  const arch = state.people.length - live.length;
  const { total } = weightedAreas(state);
  const totalArea =
    state.rooms.reduce((s, r) => s + (+r.w || 0) * (+r.l || 0), 0) + (+state.catchall || 0);
  const monthly = state.bills.reduce((s, b) => s + (+b.est || 0), 0);

  return (
    <div className={screenClass("setup", activeTab)} data-screen="setup">
      <Section
        id="people"
        title="People"
        meta={plural(live.length, "person", "people") + (arch ? ` · ${arch} archived` : "")}
        iconBg="var(--orange)"
        open={!!state.sectionsOpen.people}
        onToggle={() => props.onToggleSection("people")}
        icon={
          <Icon>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
            <circle cx="17" cy="8" r="3" />
            <path d="M21.5 19a5 5 0 0 0-6.5-4.5" />
          </Icon>
        }
      >
        {ordered.map((p) => {
          const months = sortedMonthKeys(state).filter((k) =>
            (state.months[k]?.stints || []).some((st) => st.personId === p.id),
          );
          const where = months.length
            ? `in ${plural(months.length, "month")} · ${monthLabel(months[0] ?? "", true)}–${monthLabel(months[months.length - 1] ?? "", true)}`
            : "no stints yet";
          return (
            <div className="list-row" key={p.id} style={p.archived ? { opacity: 0.6 } : undefined}>
              <Avatar state={state} person={p} size={32} />
              <div className="grow" style={{ minWidth: 0 }}>
                <input
                  type="text"
                  value={p.name}
                  style={{ fontSize: 15, fontWeight: 600 }}
                  onChange={(e) => {
                    const name = e.target.value;
                    store.mutate(() => {
                      const person = personById(store.state, p.id);
                      if (person) person.name = name;
                    });
                  }}
                />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{where}</div>
              </div>
              {p.archived ? (
                <>
                  <span className="badge muted">Archived</span>
                  <span
                    className="badge ok"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      store.mutate(() => {
                        const person = personById(store.state, p.id);
                        if (person) person.archived = false;
                      });
                      store.announce(`${p.name} is back — give them a stint on Who's here.`);
                    }}
                  >
                    Bring back
                  </span>
                </>
              ) : (
                <span
                  className={`badge ${p.isPayer ? "ok" : "muted"}`}
                  style={{ cursor: "pointer" }}
                  title="Pays the landlord and the providers; everyone settles with them"
                  onClick={() => {
                    store.mutate(() => {
                      store.state.people.forEach((person) => {
                        person.isPayer = person.id === p.id;
                      });
                    });
                  }}
                >
                  {p.isPayer ? "✓ Pays the bills" : "Make payer"}
                </span>
              )}
              {state.people.length > 1 ? (
                <button
                  className="btn-icon"
                  title="Remove"
                  onClick={() => {
                    const person = personById(state, p.id);
                    if (!person) return;
                    const locked = sortedMonthKeys(state).filter(
                      (k) =>
                        state.months[k]?.collected &&
                        (state.months[k]?.stints || []).some((st) => st.personId === person.id),
                    );
                    if (locked.length) {
                      if (
                        !confirm(
                          `${person.name} appears in ${plural(locked.length, "month")} already locked (${locked.map((k) => monthLabel(k, true)).join(", ")}).\n\nThose months stay exactly as they were charged. ${person.name} will be archived — off the roster and out of future months, but still on Balances until settled.\n\nArchive them?`,
                        )
                      )
                        return;
                      store.mutate(() => {
                        const cur = personById(store.state, p.id);
                        if (!cur) return;
                        cur.archived = true;
                        cur.isPayer = false;
                        Object.values(store.state.months).forEach((M) => {
                          if (M.collected) return;
                          M.stints = (M.stints || []).filter((st) => st.personId !== cur.id);
                        });
                        const rest = store.state.people.filter((x) => !x.archived);
                        if (!rest.some((x) => x.isPayer) && rest[0]) rest[0].isPayer = true;
                        normalise(store.state);
                      });
                    } else {
                      if (
                        !confirm(
                          `Remove ${person.name}? They are in no locked month, so this deletes them outright.`,
                        )
                      )
                        return;
                      store.mutate(() => {
                        store.state.people = store.state.people.filter((x) => x.id !== p.id);
                        Object.values(store.state.months).forEach((M) => {
                          M.stints = (M.stints || []).filter((st) => st.personId !== p.id);
                        });
                        const rest = store.state.people.filter((x) => !x.archived);
                        if (!rest.some((x) => x.isPayer) && rest[0]) rest[0].isPayer = true;
                        normalise(store.state);
                      });
                    }
                    void store.adapter.disablePersonLogin?.(p.id);
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
        <button
          className="btn-add"
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
          ＋ Add someone
        </button>
        <div className="helper">
          A person is just a name.{" "}
          <b>
            When they are here, and which bedroom they are in, is recorded entirely on the Who's
            here tab
          </b>
          , month by month — there are no move-in or move-out dates to keep in step with it.
          Removing someone who appears in a locked month archives them instead, so past months and
          any balance they are owed both survive.
        </div>
      </Section>

      <AccessSection onToggleSection={props.onToggleSection} />

      <Section
        id="property"
        title="Rent & rooms"
        meta={`${state.rooms.length} rooms · ${fmtNum(totalArea, 0)} m² · ${state.currency}${state.rent.toLocaleString()}/mo`}
        iconBg="var(--green)"
        open={!!state.sectionsOpen.property}
        onToggle={() => props.onToggleSection("property")}
        icon={
          <Icon>
            <path d="M3 11l9-7 9 7" />
            <path d="M5 10v10h14V10" />
            <path d="M10 20v-6h4v6" />
          </Icon>
        }
      >
        <div className="helper" style={{ marginTop: 0, marginBottom: 12 }}>
          Rent, currency and the hallway allowance live on the <b>Settings</b> tab, so there is only
          ever one place to change them.
        </div>
        <div className="row-h" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            <b style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {fmtNum(totalArea)}
            </b>{" "}
            m² · weighted{" "}
            <b style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {fmtNum(total)}
            </b>{" "}
            m² ·{" "}
            <b style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {total > 0 ? money(state.currency, Math.round(state.rent * 100) / total) : "—"}
            </b>{" "}
            per m²
          </div>
        </div>
        {state.rooms.map((room) => {
          const area = (+room.w || 0) * (+room.l || 0);
          const weighted = area * (typeof room.weight === "number" ? room.weight : 1);
          const holders = state.people
            .filter((p) => !p.archived && lastRoomOf(state, p.id) === room.id)
            .map((p) => p.name);
          return (
            <div className="room-card" key={room.id}>
              <div className="room-top">
                <input
                  type="text"
                  value={room.name}
                  style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 100 }}
                  onChange={(e) => {
                    const name = e.target.value;
                    store.mutate(() => {
                      const r = store.state.rooms.find((x) => x.id === room.id);
                      if (r) r.name = name;
                    });
                  }}
                />
                <span
                  className={`badge ${room.communal ? "ok" : "muted"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    store.mutate(() => {
                      const r = store.state.rooms.find((x) => x.id === room.id);
                      if (!r) return;
                      r.communal = !r.communal;
                    });
                  }}
                >
                  {room.communal ? "◍ Shared" : "◌ Private"}
                </span>
                <div className="room-area">
                  {fmtNum(area)} m² · weighted {fmtNum(weighted)} m²
                </div>
                {state.rooms.length > 1 ? (
                  <button
                    className="btn-icon"
                    title="Remove"
                    onClick={() => {
                      const lockedR = sortedMonthKeys(state).filter(
                        (k) => state.months[k]?.collected,
                      ).length;
                      if (
                        !confirm(
                          `Remove ${room.name}? Rent is redistributed across the remaining rooms from now on.` +
                            (lockedR
                              ? ` The ${plural(lockedR, "locked month")} keep the layout they were charged on.`
                              : ""),
                        )
                      )
                        return;
                      store.mutate(() => {
                        store.state.rooms = store.state.rooms.filter((x) => x.id !== room.id);
                        normalise(store.state);
                      });
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
              <div className="dim-grid">
                <div>
                  <div className="dim-label">Width</div>
                  <div className="field compact">
                    <input
                      type="number"
                      value={room.w}
                      step={0.01}
                      min={0}
                      className="num-input"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.w = v;
                        });
                      }}
                    />
                    <span className="suffix">m</span>
                  </div>
                </div>
                <div>
                  <div className="dim-label">Length</div>
                  <div className="field compact">
                    <input
                      type="number"
                      value={room.l}
                      step={0.01}
                      min={0}
                      className="num-input"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.l = v;
                        });
                      }}
                    />
                    <span className="suffix">m</span>
                  </div>
                </div>
                <div>
                  <div className="dim-label">Weight</div>
                  <div className="field compact">
                    <input
                      type="number"
                      value={room.weight}
                      step={0.05}
                      min={0}
                      className="num-input"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        store.mutate(() => {
                          const r = store.state.rooms.find((x) => x.id === room.id);
                          if (r) r.weight = v;
                        });
                      }}
                    />
                    <span className="suffix">×</span>
                  </div>
                </div>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
                {room.communal ? (
                  "Split among everyone liable on each day."
                ) : holders.length ? (
                  `Held by ${holders.join(" and ")}.`
                ) : (
                  <span style={{ color: "var(--orange)" }}>
                    Nobody holds this room — its rent gets spread across everyone.
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <button
          className="btn-add"
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
          ＋ Add a room
        </button>
        <div className="helper">
          <b>Weight</b> scales how much a room counts toward rent — a bathroom at 0.5× is treated as
          half its floor area, because a square metre of bathroom isn't worth a square metre of
          bedroom. <b>Private</b> rooms are paid for by whoever is liable for them; <b>shared</b>{" "}
          rooms are split among everyone liable that day.
        </div>
      </Section>

      <Section
        id="bills"
        title="Bills & how they split"
        meta={`${state.bills.length} bills · ~${state.currency}${Math.round(monthly).toLocaleString()}/mo`}
        iconBg="var(--p3)"
        open={!!state.sectionsOpen.bills}
        onToggle={() => props.onToggleSection("bills")}
        icon={
          <Icon>
            <path d="M5 3h12a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 1-2z" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </Icon>
        }
      >
        {state.bills.map((b) => {
          const restricted = Array.isArray(b.payers) && b.payers.length > 0;
          return (
            <div className="bill-card" key={b.id}>
              <div className="bill-top">
                <input
                  type="text"
                  value={b.name}
                  style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 110 }}
                  onChange={(e) => {
                    const name = e.target.value;
                    store.mutate(() => {
                      const bill = store.state.bills.find((x) => x.id === b.id);
                      if (bill) bill.name = name;
                    });
                  }}
                />
                <div className="field compact" style={{ width: 132 }}>
                  <span className="prefix cur-symbol">{state.currency}</span>
                  <input
                    type="number"
                    value={b.est}
                    step={0.01}
                    min={0}
                    className="num-input"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      store.mutate(() => {
                        const bill = store.state.bills.find((x) => x.id === b.id);
                        if (bill) bill.est = v;
                      });
                    }}
                  />
                  <span className="suffix">/ mo</span>
                </div>
                {state.bills.length > 1 ? (
                  <button
                    className="btn-icon"
                    title="Remove"
                    onClick={() => {
                      const locked = sortedMonthKeys(state).filter(
                        (k) => state.months[k]?.collected,
                      );
                      const msg = locked.length
                        ? `Remove ${b.name}? It stops appearing in new and unlocked months. The ${plural(locked.length, "month")} you have already locked keep it exactly as it was charged.`
                        : `Remove ${b.name}? Its figures come out of every month on record.`;
                      if (!confirm(msg)) return;
                      store.mutate(() => {
                        store.state.bills = store.state.bills.filter((x) => x.id !== b.id);
                        Object.values(store.state.months).forEach((M) => {
                          if (!M.collected) delete M.lines[b.id];
                        });
                      });
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
              <div className="helper" style={{ marginTop: 0 }}>
                The <b>usual amount</b> is only the starting figure for months you haven't filled in
                yet. Change it whenever the price goes up — a renewal, an inflation rise, a new
                tariff — and months already on record keep the figures they were given.
              </div>
              <div className="dim-label" style={{ marginTop: 8, marginBottom: 6 }}>
                Who pays into it{restricted ? "" : " — everyone"}
              </div>
              <div className="chips">
                {state.people
                  .filter((p) => !p.archived)
                  .map((p) => {
                    const on = !restricted || (b.payers ?? []).includes(p.id);
                    return (
                      <label className={`chip ${on ? "active" : ""}`} key={p.id}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            store.mutate(() => {
                              const bill = store.state.bills.find((x) => x.id === b.id);
                              if (!bill) return;
                              const all = store.state.people.map((person) => person.id);
                              let cur =
                                Array.isArray(bill.payers) && bill.payers.length
                                  ? bill.payers.slice()
                                  : all.slice();
                              cur = e.target.checked
                                ? [...new Set([...cur, p.id])]
                                : cur.filter((x) => x !== p.id);
                              bill.payers = cur.length === all.length ? null : cur;
                            });
                          }}
                        />
                        <span>{p.name}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          );
        })}
        <button
          className="btn-add"
          onClick={() => {
            store.mutate(() => {
              const bill = { id: uid("bl"), name: "New bill", est: 0, payers: null };
              store.state.bills.push(bill);
              Object.values(store.state.months).forEach((M) => {
                M.lines[bill.id] = { est: 0, act: null };
              });
            });
          }}
        >
          ＋ Add a bill
        </button>
        <div className="helper">
          Every bill splits the same way: across the days each person was in the house that month.
          Nothing here is locked in — <b>every amount stays editable, every month</b> — and the
          realised figure on the <b>This month</b> tab always overrides the estimate once the real
          bill arrives.
        </div>
      </Section>
    </div>
  );
}
