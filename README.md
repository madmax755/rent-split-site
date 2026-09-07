# Rent Split

Self-hosted household rent & bill splitter.

- **Frontend:** Vite 8 + React 19 + React Compiler + Tailwind 4 + TypeScript
- **Server:** zero-dependency Node 18+ (`server/server.js`) — JSON file store, shared password, backups
- **Tooling:** Bun workspaces-style scripts (sterling-lite), oxfmt / oxlint

## Layout

```
rent-split-site/
├── frontend/          Vite React app (build → frontend/dist)
│   └── src/legacy/    existing UI bridge — peel into React over time
├── server/            Node API + static file server
├── deploy/            systemd + nginx examples
├── data/              runtime JSON + backups (gitignored)
└── .env.example
```

## Develop

Requires **Bun** and **Node 18+**.

```bash
bun run install:all
bun run dev
```

- UI: http://127.0.0.1:5173 (Vite proxies `/api` → server on :8080)
- API/static prod shape: http://127.0.0.1:8080 after `bun run build && bun start`

## Production

```bash
bun run build
# set env from .env.example
bun start
```

The server serves `frontend/dist` and `/api/*`. Put nginx in front with TLS (`deploy/nginx.conf.example`) and optionally run under systemd (`deploy/rent-split.service`).

Important env vars:

- `RENT_SPLIT_PASSWORD` — shared household lock (unset = open)
- `DATA_DIR` — where `rent-split.json` + `backups/` live
- `SECURE_COOKIE=1` — once on https

Changing the password invalidates every session (signing key mixes it in).

## Data

Everything is one JSON document with a revision. Every write keeps a timestamped backup (capped at 200). Concurrent edits: last write with matching `rev` wins; conflicts ask the user to keep/overwrite.

## New features

Prefer React components under `frontend/src/`. The current screens still boot via `src/legacy/` so behaviour stays intact; migrate screen-by-screen rather than growing `legacy/app.js`.
