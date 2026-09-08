import { uid } from "./ids";
import { clampCycleDay, clampTenancyStart, daysInMonth } from "./dates";
import { DEFAULT_BILLS, DEFAULT_ROOMS, DEFAULT_TENANCY_START, MAX_PEOPLE } from "./defaults";
import { ensureMonth } from "./months";
import type { HouseholdState, MonthConfig } from "./types";

function normaliseMonthConfig(cfg: MonthConfig): void {
  cfg.rentCycleStartDay = clampCycleDay(cfg.rentCycleStartDay);
  cfg.tenancyStart = clampTenancyStart(cfg.tenancyStart, DEFAULT_TENANCY_START);
  if (Array.isArray(cfg.bills)) {
    cfg.bills.forEach((b) => {
      b.cycleStartDay = clampCycleDay(b.cycleStartDay);
    });
  }
}

export function normalise(state: HouseholdState): void {
  if (!Array.isArray(state.rooms) || !state.rooms.length) {
    state.rooms = DEFAULT_ROOMS.map((r) => ({ ...r }));
  }
  state.rooms.forEach((r) => {
    r.w = +r.w || 0;
    r.l = +r.l || 0;
    if (typeof r.weight !== "number") r.weight = 1;
    r.communal = !!r.communal;
    if (!r.id) r.id = uid("rm");
  });
  const roomIds = state.rooms.map((r) => r.id);
  const firstPrivate = (state.rooms.find((r) => !r.communal) || state.rooms[0])?.id ?? "";

  if (!Array.isArray(state.people)) state.people = [];
  state.people = state.people.slice(0, MAX_PEOPLE);
  state.people.forEach((p, i) => {
    if (!p.id) p.id = `p${i + 1}`;
    if (typeof p.name !== "string") p.name = `Person ${i + 1}`;
    p.isPayer = !!p.isPayer;
    p.archived = !!p.archived;
    delete (p as { role?: unknown }).role;
    delete (p as { awayBasis?: unknown }).awayBasis;
    delete (p as { fixedBasis?: unknown }).fixedBasis;
    delete (p as { moveIn?: unknown }).moveIn;
    delete (p as { moveOut?: unknown }).moveOut;
    delete (p as { roomId?: unknown }).roomId;
  });
  const live = state.people.filter((p) => !p.archived);
  if (live.length && !live.some((p) => p.isPayer) && live[0]) live[0].isPayer = true;

  state.rentCycleStartDay = clampCycleDay(state.rentCycleStartDay);
  state.tenancyStart = clampTenancyStart(state.tenancyStart, DEFAULT_TENANCY_START);

  if (!Array.isArray(state.bills)) state.bills = DEFAULT_BILLS.map((b) => ({ ...b }));
  state.bills.forEach((b) => {
    if (!b.id) b.id = uid("bl");
    if (typeof b.name !== "string") b.name = b.id;
    delete (b as { kind?: unknown }).kind;
    if (typeof b.est !== "number") b.est = 0;
    if (b.payers && !Array.isArray(b.payers)) b.payers = null;
    b.cycleStartDay = clampCycleDay(b.cycleStartDay);
  });

  if (!state.months || typeof state.months !== "object") state.months = {};
  Object.keys(state.months).forEach((k) => {
    const M = state.months[k];
    if (!M || typeof M !== "object") {
      delete state.months[k];
      return;
    }
    M.key = k;
    if (!M.lines || typeof M.lines !== "object") M.lines = {};
    const lineDefs = M.config && Array.isArray(M.config.bills) ? M.config.bills : state.bills;
    lineDefs.forEach((b) => {
      if (!M.lines[b.id]) M.lines[b.id] = { est: b.est ?? 0, act: null };
      const L = M.lines[b.id];
      if (!L) return;
      L.est = typeof L.est === "number" ? L.est : 0;
      L.act = typeof L.act === "number" ? L.act : null;
    });
    if (!Array.isArray(M.oneOffs)) M.oneOffs = [];
    M.oneOffs.forEach((x) => {
      if (!x.id) x.id = uid("oo");
      if (typeof x.est !== "number") x.est = 0;
      if (typeof x.act !== "number") x.act = null;
      delete (x as { kind?: unknown }).kind;
    });
    if (!Array.isArray(M.stints)) M.stints = [];
    const D = daysInMonth(k);
    const cfg = M.config && Array.isArray(M.config.rooms) ? M.config : null;
    const validRooms = cfg ? cfg.rooms.map((r) => r.id) : roomIds;
    const validPeople =
      cfg && Array.isArray(cfg.people)
        ? cfg.people.map((x) => x.id)
        : state.people.map((x) => x.id);
    const fallbackRoom = cfg
      ? ((cfg.rooms.find((r) => !r.communal) || cfg.rooms[0])?.id ?? "")
      : firstPrivate;
    M.stints = M.stints.filter((s) => validPeople.includes(s.personId));
    M.stints.forEach((s) => {
      if (!s.id) s.id = uid("st");
      s.from = Math.min(D, Math.max(1, Math.round(+s.from || 1)));
      s.to = Math.min(D, Math.max(s.from, Math.round(+s.to || D)));
      if (!validRooms.includes(s.roomId)) s.roomId = fallbackRoom;
      delete (s as { here?: unknown }).here;
    });
    M.collected = !!M.collected;
    if (M.charged && typeof M.charged !== "object") M.charged = null;
    if (M.config && typeof M.config !== "object") M.config = null;
    if (M.config && !Array.isArray(M.config.rooms)) M.config = null;
    if (M.config) normaliseMonthConfig(M.config);
    if (typeof M.note !== "string") M.note = "";
  });
  if (!state.months[state.currentMonth]) ensureMonth(state, state.currentMonth);

  if (!Array.isArray(state.ledger)) state.ledger = [];
  state.ledger.forEach((e) => {
    if (!e.id) e.id = uid("lg");
  });
}
