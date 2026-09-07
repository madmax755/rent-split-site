import { daysInMonth, dayDate, monthLabel } from "../domain/dates";
import { MAX_PEOPLE } from "../domain/defaults";
import { bedroomGaps, buildDayModel } from "../domain/engine";
import { personById, personColor, plural, rangeText } from "../domain/format";
import { uid } from "../domain/ids";
import { ensureMonth, lastRoomOf } from "../domain/months";
import type { Stint } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
import { goMonth } from "./month-screen";
import { screenClass } from "./screen-class";
import { Section } from "./section";

type StintsScreenProps = {
  onToggleSection: (id: string) => void;
};

export function StintsScreen(props: StintsScreenProps) {
  const { store, state, activeTab } = useHousehold();
  const key = state.currentMonth;
  const M = ensureMonth(state, key);
  const D = daysInMonth(key);
  const days = buildDayModel(state, key);
  const cols = { gridTemplateColumns: `repeat(${D}, minmax(0, 1fr))` };
  const involved = state.people.filter((p) => (M.stints || []).some((s) => s.personId === p.id));
  const gaps = bedroomGaps(state, key);
  const totalDays = days.reduce((s, d) => s + d.liable.length, 0);
  const gapCount = gaps.reduce((s, g) => s + g.days.length, 0);
  const stintSummary =
    `${plural((M.stints || []).length, "stint")} · ${totalDays} person-days` +
    (gapCount ? ` · ${gapCount} empty bedroom-days` : "");

  function clampAll(stints: Stint[]): void {
    stints.forEach((s) => {
      s.from = Math.min(D, Math.max(1, s.from));
      s.to = Math.min(D, Math.max(s.from, s.to));
    });
  }

  function patchStint(id: string, patch: (s: Stint, stints: Stint[]) => void): void {
    store.mutate(() => {
      const month = ensureMonth(store.state, key);
      const stints = month.stints || [];
      const s = stints.find((x) => x.id === id);
      if (!s) return;
      patch(s, stints);
      clampAll(stints);
    });
  }

  return (
    <div className={screenClass("stints", activeTab)} data-screen="stints">
      <div className="monthbar">
        <button className="iconbtn" title="Previous month" onClick={() => goMonth(store, -1)}>
          <Icon strokeWidth={2.5}>
            <path d="M15 6l-6 6 6 6" />
          </Icon>
        </button>
        <div className="month-label">
          <span>{monthLabel(key)}</span>
          <span className="sub">{stintSummary}</span>
        </div>
        <button className="iconbtn" title="Next month" onClick={() => goMonth(store, 1)}>
          <Icon strokeWidth={2.5}>
            <path d="M9 6l6 6-6 6" />
          </Icon>
        </button>
      </div>

      <div className="tl" style={{ marginBottom: 14 }}>
        <div className="tl-scroll">
          <div className="tl-grid">
            {involved.length ? (
              <>
                <div className="tl-ruler" style={cols}>
                  {Array.from({ length: D }, (_, i) => {
                    const d = i + 1;
                    const dow = dayDate(key, d).getDay();
                    const wk = dow === 0 || dow === 6;
                    return (
                      <div key={d} className={`tl-tick${wk ? " wk" : ""}`}>
                        {d % 2 === 1 || D <= 20 ? d : "\u00a0"}
                      </div>
                    );
                  })}
                </div>
                {involved.map((p) => (
                  <div
                    key={p.id}
                    className="tl-row"
                    style={
                      {
                        "--seg": personColor(state, p.id),
                        "--seg-soft": personColor(state, p.id),
                      } as CSSProperties
                    }
                  >
                    <div className="tl-who">
                      <Avatar state={state} person={p} size={22} />
                      <span className="nm">{p.name}</span>
                    </div>
                    <div className="tl-track" style={cols}>
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
                            className={`tl-cell ${isHere ? "here" : ""}${sharing ? " share" : ""}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="tl-hc" style={cols}>
                  {days.map((day) => (
                    <div key={day.d} className="tl-hcell">
                      {day.liable.length}
                    </div>
                  ))}
                </div>
                <div
                  style={{ fontSize: 11.5, color: "var(--muted)", paddingLeft: 116, marginTop: 5 }}
                >
                  people in the house each day
                </div>
                {state.rooms.some((r) => !r.communal) ? (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: "0.5px solid var(--hairline)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: ".04em",
                        marginBottom: 7,
                      }}
                    >
                      Bedroom cover
                    </div>
                    {state.rooms
                      .filter((r) => !r.communal)
                      .map((room) => {
                        const g = gaps.find((x) => x.roomId === room.id);
                        return (
                          <div
                            key={room.id}
                            className="tl-row"
                            style={{ "--seg": g ? "var(--red)" : "var(--green)" } as CSSProperties}
                          >
                            <div className="tl-who">
                              <span
                                className="nm"
                                style={{ color: g ? "var(--red)" : "var(--muted)" }}
                              >
                                {room.name}
                              </span>
                            </div>
                            <div className="tl-track" style={cols}>
                              {Array.from({ length: D }, (_, i) => {
                                const occ = (days[i]?.rooms[room.id] || []).length;
                                return (
                                  <div
                                    key={i}
                                    className={`tl-cell${occ ? " here" : " empty"}`}
                                    title={`${room.name} — day ${i + 1}: ${occ ? plural(occ, "person", "people") : "EMPTY"}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty">
                Nobody is down for {monthLabel(key)} yet. Use <b>Add a stint</b> below, or reset
                from the roster on the This month tab.
              </div>
            )}
          </div>
        </div>
        <div className="tl-legend">
          <span>
            <i style={{ background: "var(--accent)" }} />
            In the house — paying that day
          </span>
          <span>
            <i style={{ background: "var(--card-2)", boxShadow: "inset 0 0 0 2px var(--text)" }} />
            Sharing a bedroom
          </span>
          <span>
            <i style={{ background: "var(--red)" }} />
            Bedroom with nobody in it
          </span>
        </div>
      </div>

      <Section
        id="stintlist"
        title="Stints"
        meta={stintSummary}
        iconBg="var(--orange)"
        open={!!state.sectionsOpen.stintlist}
        onToggle={() => props.onToggleSection("stintlist")}
        icon={
          <Icon>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </Icon>
        }
      >
        {!(M.stints || []).length ? (
          <div className="empty">No stints yet.</div>
        ) : (
          (M.stints || []).map((s) => {
            const p = personById(state, s.personId);
            return (
              <div className="stint-row" key={s.id}>
                <span
                  className="swatch"
                  style={{ background: p ? personColor(state, p.id) : "var(--muted)" }}
                />
                <select
                  style={{ width: "auto", minWidth: 104 }}
                  value={s.personId}
                  onChange={(e) => {
                    patchStint(s.id, (st) => {
                      st.personId = e.target.value;
                    });
                  }}
                >
                  {state.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <div className="field compact" style={{ width: "auto" }}>
                  <span className="prefix">day</span>
                  <input
                    type="number"
                    className="num-input daynum"
                    min={1}
                    max={D}
                    value={s.from}
                    onChange={(e) => {
                      patchStint(s.id, (st) => {
                        st.from = Math.round(parseFloat(e.target.value) || 1);
                      });
                    }}
                  />
                </div>
                <span style={{ color: "var(--muted-2)" }}>→</span>
                <div className="field compact" style={{ width: "auto" }}>
                  <input
                    type="number"
                    className="num-input daynum"
                    min={1}
                    max={D}
                    value={s.to}
                    onChange={(e) => {
                      patchStint(s.id, (st) => {
                        st.to = Math.round(parseFloat(e.target.value) || D);
                      });
                    }}
                  />
                </div>
                <select
                  style={{ width: "auto", minWidth: 120 }}
                  value={s.roomId}
                  onChange={(e) => {
                    patchStint(s.id, (st) => {
                      st.roomId = e.target.value;
                    });
                  }}
                >
                  {state.rooms.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.communal}>
                      {r.name}
                      {r.communal ? " (shared)" : ""}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {plural(s.to - s.from + 1, "day")}
                </span>
                <div className="spacer" />
                <button
                  className="btn-icon"
                  title="Split this stint in two"
                  onClick={() => {
                    if (s.to - s.from < 1) {
                      store.announce("A one-day stint can't be split.");
                      return;
                    }
                    store.mutate(() => {
                      const month = ensureMonth(store.state, key);
                      const stints = month.stints || [];
                      const cur = stints.find((x) => x.id === s.id);
                      if (!cur) return;
                      const mid = Math.floor((cur.from + cur.to) / 2);
                      const copy: Stint = { ...cur, id: uid("st"), from: mid + 1, to: cur.to };
                      cur.to = mid;
                      stints.splice(stints.indexOf(cur) + 1, 0, copy);
                    });
                    store.announce(
                      "Split in two — adjust the dates, or delete the half they weren't here for.",
                    );
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <path d="M12 3v18" />
                    <path d="M5 8h4M15 8h4" />
                  </svg>
                </button>
                <button
                  className="btn-icon"
                  title="Remove"
                  onClick={() => {
                    store.mutate(() => {
                      const month = ensureMonth(store.state, key);
                      month.stints = (month.stints || []).filter((x) => x.id !== s.id);
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
              </div>
            );
          })
        )}
        <div className="rowwrap" style={{ marginTop: 10 }}>
          <button
            className="btn-add"
            style={{ width: "auto" }}
            onClick={() => {
              const p = state.people.find((x) => !x.archived);
              if (!p) {
                store.announce("Add someone on the Setup tab first.");
                return;
              }
              store.mutate(() => {
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
            ＋ Add a stint
          </button>
          <button
            className="btn-add"
            style={{ width: "auto" }}
            onClick={() => {
              if (state.people.filter((p) => !p.archived).length >= MAX_PEOPLE) {
                store.announce(`That's the limit of ${MAX_PEOPLE} people.`);
                return;
              }
              const name = prompt("Who is it?", "Someone new");
              if (name === null) return;
              store.mutate(() => {
                const daysN = daysInMonth(key);
                const room = store.state.rooms.find((r) => !r.communal)?.id ?? "";
                const person = {
                  id: uid("p"),
                  name: name.trim() || "Someone new",
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
              store.setTab("stints");
              store.announce("Added — set their dates and which bedroom they're in.");
            }}
          >
            ＋ Add someone new
          </button>
        </div>
        <div className="stack" style={{ marginBottom: 10 }}>
          {gaps.map((g) => (
            <div key={g.roomId} className="badge warn" style={{ display: "inline-block" }}>
              <b>{g.name}</b> empty on{" "}
              {g.days.length === D ? "every day" : "day " + rangeText(g.days)}
            </div>
          ))}
        </div>
        <div className="helper">
          A stint is a block of days someone is in the house, in one bedroom — and it is the{" "}
          <b>only</b> place dates live. Rent and every bill are shared out across these days. Two
          people on one bedroom over the same days split it between them, day by day. Each new month
          starts as a copy of the month before, so in a normal month there is nothing to change.
        </div>
      </Section>
    </div>
  );
}
