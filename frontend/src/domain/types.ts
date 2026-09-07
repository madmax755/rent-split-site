export type CurrencySymbol = "£" | "$" | "€";

export type TabId =
  | "home"
  | "month"
  | "stints"
  | "balances"
  | "history"
  | "setup"
  | "settings"
  | "how";

export type MonthStatus = "projected" | "collecting" | "reconciled";

export type Room = {
  id: string;
  name: string;
  w: number;
  l: number;
  weight: number;
  communal: boolean;
};

export type Person = {
  id: string;
  name: string;
  isPayer: boolean;
  archived: boolean;
};

export type Bill = {
  id: string;
  name: string;
  est: number;
  payers: string[] | null;
  cycleStartDay: number;
};

export type MonthLine = {
  est: number;
  act: number | null;
};

export type OneOff = MonthLine & {
  id: string;
  name: string;
  payers: string[] | null;
};

export type Stint = {
  id: string;
  personId: string;
  roomId: string;
  from: number;
  to: number;
};

export type MonthConfig = {
  rent: number;
  rentCycleStartDay: number;
  rooms: Room[];
  catchall: number;
  catchallWeight: number;
  bills: Bill[];
  people: Person[];
};

export type MonthRecord = {
  key: string;
  rent: number | null;
  lines: Record<string, MonthLine>;
  oneOffs: OneOff[];
  stints: Stint[];
  collected: boolean;
  charged: Record<string, number> | null;
  chargedAt: string;
  note: string;
  config: MonthConfig | null;
};

export type LedgerEntry = {
  id: string;
  personId: string;
  monthKey: string;
  type: string;
  amount: number;
  date: string;
  note: string;
};

export const SNAPSHOT_FIELDS = [
  "currency",
  "rent",
  "rentCycleStartDay",
  "catchall",
  "catchallWeight",
  "rooms",
  "people",
  "bills",
  "months",
  "ledger",
] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export type Snapshot = {
  currency: string;
  rent: number;
  rentCycleStartDay: number;
  catchall: number;
  catchallWeight: number;
  rooms: Room[];
  people: Person[];
  bills: Bill[];
  months: Record<string, MonthRecord>;
  ledger: LedgerEntry[];
};

export type Preset = {
  name: string;
  snapshot: Snapshot;
};

export type HouseholdState = Snapshot & {
  presets: Preset[];
  activePresetName: string | null;
  currentMonth: string;
  activeTab: TabId;
  sectionsOpen: Record<string, boolean>;
  openStatements: Record<string, boolean>;
};

export type DayModel = {
  key: string;
  d: number;
  liable: string[];
  present: string[];
  rooms: Record<string, string[]>;
};

export type BedroomGap = {
  roomId: string;
  name: string;
  days: number[];
};

export type ComputeMode = "est" | "eff";

export type PeriodCounts = {
  liableDays: Record<string, number>;
  days: DayModel[];
  cycleStartDay: number;
  periodLabel: string;
  periodLength: number;
};

export type MonthLineResult = {
  id: string;
  name: string;
  oneOff: boolean;
  amount: number;
  shares: Record<string, number>;
  units: Record<string, number>;
  how: Record<string, string>;
  unitSum: number;
  fallback: boolean;
  isActual: boolean;
  est: number;
  act: number | null;
  cycleStartDay: number;
  periodLabel: string;
  periodLength: number;
};

export type MonthCompute = {
  key: string;
  mode: ComputeMode;
  counts: {
    nights: Record<string, number>;
    liableDays: Record<string, number>;
    days: DayModel[];
  };
  rentCounts: PeriodCounts;
  rentPence: number;
  rentAmount: number;
  bedroom: Record<string, number>;
  shared: Record<string, number>;
  rentShare: Record<string, number>;
  warn: string[];
  lines: MonthLineResult[];
  totals: Record<string, number>;
  rentTotals: Record<string, number>;
  billTotals: Record<string, number>;
  grand: number;
  billsTotalPence: number;
};

export type BalanceItem = {
  type: string;
  monthKey: string;
  personId: string;
  amount: number;
  date: string;
  note?: string;
  id?: string;
};

export type BalanceSheet = {
  bal: Record<string, number>;
  items: BalanceItem[];
  known: string[];
};

export type CheckResult = {
  key: string;
  ok: boolean;
  problems: string[];
  warn: string[];
};

export type DataEnvelope = {
  app: "rent-split";
  schema: number;
  savedAt: string;
  data: Record<string, unknown>;
};
