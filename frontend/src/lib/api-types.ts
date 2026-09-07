# API types shared conceptually with the Node server.
# Keep these in sync with `server/server.js` route handlers.

export type HealthResponse = {
  app: "rent-split";
  version: number;
  authRequired: boolean;
  authed: boolean;
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
