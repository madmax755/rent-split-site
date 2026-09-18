import { currentTenancyMonthKey, todayIsoDate } from "./dates";
import type { Bill, HouseholdState, Person, Room } from "./types";

export const MAX_PEOPLE = 8;
export const PERSON_COLORS = [
  "#ff9f0a",
  "#30b0c7",
  "#bf5af2",
  "#34c759",
  "#ff375f",
  "#5e5ce6",
  "#ff6482",
  "#66d4cf",
];

/** Generic layout for a new empty household — replace dimensions in-app. */
export const DEFAULT_ROOMS: Room[] = [
  { id: "bed1", name: "Bedroom 1", w: 3, l: 3, weight: 1.0, communal: false },
  { id: "bed2", name: "Bedroom 2", w: 3, l: 3, weight: 1.0, communal: false },
  { id: "bed3", name: "Bedroom 3", w: 3, l: 2.5, weight: 1.0, communal: false },
  { id: "bath1", name: "Bathroom", w: 2, l: 1.5, weight: 0.5, communal: true },
  { id: "kitchen", name: "Kitchen", w: 3, l: 3, weight: 1.0, communal: true },
  { id: "lounge", name: "Lounge", w: 4, l: 4, weight: 1.0, communal: true },
];

/** Placeholder people for a fresh install; rename in Household setup. */
export const DEFAULT_PEOPLE: Person[] = [
  { id: "p1", name: "Person 1", isPayer: true, archived: false },
  { id: "p2", name: "Person 2", isPayer: false, archived: false },
];

export const DEFAULT_CYCLE_START_DAY = 1;

/** Fallback only when a stored date is missing or invalid — not a real tenancy. */
export const DEFAULT_TENANCY_START = "2000-01-01";

export function freshTenancyStart(now: Date = new Date()): string {
  return todayIsoDate(now);
}

export const DEFAULT_BILLS: Bill[] = [
  { id: "energy", name: "Energy", est: 0, payers: null, cycleStartDay: 1 },
  { id: "water", name: "Water", est: 0, payers: null, cycleStartDay: 1 },
  { id: "wifi", name: "Internet", est: 0, payers: null, cycleStartDay: 1 },
  { id: "insurance", name: "Insurance", est: 0, payers: null, cycleStartDay: 1 },
  { id: "counciltax", name: "Council tax", est: 0, payers: null, cycleStartDay: 1 },
];

export const DEFAULT_RENT = 0;
export const DEFAULT_CATCHALL = 0;
export const DEFAULT_CATCHALL_WEIGHT = 0.5;

export const DEFAULT_SITE_TITLE = "Rent Split";

export const DEFAULT_SECTIONS_OPEN: Record<string, boolean> = {
  mbills: true,
  mstmt: true,
  mnote: false,
  stintlist: true,
  balnow: true,
  balhist: false,
  hpeople: true,
  hbills: true,
  tenanthome: true,
  people: true,
  access: true,
  property: false,
  bills: false,
  data: false,
  howbody: true,
  setaway: true,
  setmoney: true,
  setspace: false,
  setlook: false,
};

export function freshHousehold(now: Date = new Date()): HouseholdState {
  const tenancyStart = freshTenancyStart(now);
  return {
    currency: "£",
    rent: DEFAULT_RENT,
    rentCycleStartDay: DEFAULT_CYCLE_START_DAY,
    tenancyStart,
    catchall: DEFAULT_CATCHALL,
    catchallWeight: DEFAULT_CATCHALL_WEIGHT,
    rooms: DEFAULT_ROOMS.map((r) => ({ ...r })),
    people: DEFAULT_PEOPLE.map((p) => ({ ...p })),
    bills: DEFAULT_BILLS.map((b) => ({ ...b })),
    months: {},
    ledger: [],
    presets: [],
    activePresetName: null,
    currentMonth: currentTenancyMonthKey(tenancyStart, now),
    activeTab: "month",
    sectionsOpen: { ...DEFAULT_SECTIONS_OPEN },
    openStatements: {},
  };
}
