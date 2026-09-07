// API types shared conceptually with the Python FastAPI server.
// Keep these in sync with `server/app/routes.py` and `server/app/schemas.py`.

export type AccountRole = "admin" | "tenant";

export type SessionInfo = {
  accountId: string;
  username: string;
  role: AccountRole;
  personId: string | null;
  personName: string | null;
};

export type PublicAccount = {
  id: string;
  username: string;
  personId: string | null;
  role: AccountRole;
  enabled: boolean;
  passwordSetAt: string | null;
};

export type HealthResponse = {
  app: "rent-split";
  version: number;
  authRequired: boolean;
  authed: boolean;
  session: SessionInfo | null;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  ok: true;
  session: SessionInfo;
};

export type CreateAccountRequest = {
  username: string;
  password: string;
  personId: string | null;
  role: AccountRole;
};

export type PatchAccountRequest = {
  username?: string;
  password?: string;
  personId?: string | null;
  role?: AccountRole;
  enabled?: boolean;
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
