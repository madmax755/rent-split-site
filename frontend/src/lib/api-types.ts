// API types shared conceptually with the Python FastAPI server.
// Keep these in sync with `server/app/routes.py` and `server/app/schemas.py`.

export type AccountRole = "admin" | "tenant";

export type SessionInfo = {
  personId: string;
  personName: string;
  role: AccountRole;
};

export type PickerPerson = {
  id: string;
  name: string;
  isPayer: boolean;
  archived: boolean;
};

export type HealthResponse = {
  app: "rent-split";
  version: number;
  siteTitle?: string;
  people: PickerPerson[];
};

export type SettleRequest = {
  id: string;
  personId: string;
  amount: number;
  date: string;
  note: string;
  monthKey?: string;
  rev?: number;
  force?: boolean;
};

export type PutStintsRequest = {
  monthKey: string;
  personId: string;
  stints: Array<{
    id: string;
    personId: string;
    roomId: string;
    from: number;
    to: number;
  }>;
  rev?: number;
  force?: boolean;
};

export type DataEnvelope = {
  app: "rent-split";
  schema: number;
  savedAt?: string;
  data: unknown;
};

export type StoredDocument = {
  rev: number;
  savedAt: string | null;
  payload: DataEnvelope | null;
};

export type PutDataRequest = {
  payload: DataEnvelope;
  rev: number;
  force?: boolean;
};

export type PutDataResponse = {
  rev: number;
  savedAt: string;
};

export type ApiError = {
  error: string;
  rev?: number;
};
