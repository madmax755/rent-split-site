import { todayKey } from "./dates";
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

export const DEFAULT_ROOMS: Room[] = [
  { id: "bed1", name: "Master Bedroom", w: 3.89, l: 3.0, weight: 1.0, communal: false },
  { id: "bed2", name: "2nd Bedroom", w: 3.89, l: 2.41, weight: 1.0, communal: false },
  { id: "bed3", name: "3rd Bedroom", w: 3.89, l: 1.96, weight: 1.0, communal: false },
  { id: "bath1", name: "Bathroom 1", w: 2.0, l: 1.5, weight: 0.5, communal: true },
  { id: "bath2", name: "Bathroom 2", w: 1.5, l: 1.2, weight: 0.5, communal: true },
  { id: "kitchen", name: "Kitchen", w: 4.26, l: 2.69, weight: 1.0, communal: true },
  { id: "lounge", name: "Lounge", w: 4.78, l: 4.26, weight: 1.0, communal: true },
];

export const DEFAULT_PEOPLE: Person[] = [
  { id: "p1", name: "Ach", isPayer: true, archived: false },
  { id: "p2", name: "Joe", isPayer: false, archived: false },
  { id: "p3", name: "Alice", isPayer: false, archived: false },
  { id: "p4", name: "Max", isPayer: false, archived: false },
];

export const DEFAULT_ROOM_OF: Record<string, string> = {
  p1: "bed2",
  p2: "bed3",
  p3: "bed1",
  p4: "bed1",
};

export const DEFAULT_CYCLE_START_DAY = 1;
export const DEFAULT_TENANCY_START = "2026-08-09";

export const DEFAULT_BILLS: Bill[] = [
  { id: "energy", name: "Energy (gas & electric)", est: 195, payers: null, cycleStartDay: 1 },
  { id: "water", name: "Water", est: 36, payers: null, cycleStartDay: 1 },
  { id: "wifi", name: "Wi-Fi", est: 35, payers: null, cycleStartDay: 1 },
  { id: "insurance", name: "Renters insurance", est: 15, payers: null, cycleStartDay: 1 },
  { id: "counciltax", name: "Council tax", est: 200, payers: null, cycleStartDay: 1 },
];

export const DEFAULT_RENT = 3500;
export const DEFAULT_CATCHALL = 14.3;
export const DEFAULT_CATCHALL_WEIGHT = 0.5;

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

export function freshHousehold(): HouseholdState {
  return {
    currency: "£",
    rent: DEFAULT_RENT,
    rentCycleStartDay: DEFAULT_CYCLE_START_DAY,
    tenancyStart: DEFAULT_TENANCY_START,
    catchall: DEFAULT_CATCHALL,
    catchallWeight: DEFAULT_CATCHALL_WEIGHT,
    rooms: DEFAULT_ROOMS.map((r) => ({ ...r })),
    people: DEFAULT_PEOPLE.map((p) => ({ ...p })),
    bills: DEFAULT_BILLS.map((b) => ({ ...b })),
    months: {},
    ledger: [],
    presets: [],
    activePresetName: null,
    currentMonth: todayKey(),
    activeTab: "month",
    sectionsOpen: { ...DEFAULT_SECTIONS_OPEN },
    openStatements: {},
  };
}
