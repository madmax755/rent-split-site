# Rent Split

Self-hosted household rent & bill splitter.

- **Frontend:** Vite 8 + React 19 + React Compiler + Tailwind 4 + TypeScript
- **Server:** zero-dependency Node 18+ (`server/server.js`) — JSON file store, per-person logins, backups
- **Tooling:** Bun workspaces-style scripts (sterling-lite), oxfmt / oxlint

## Layout

```
rent-split-site/
├── frontend/          Vite React app (build → frontend/dist)
│   └── src/           typed React UI, domain engine, storage adapters
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

### Deploy to server1 (tms.maxkendall.com)

Live install: systemd unit `rent-split.service`, app dir `/opt/rent-split-site`, credentials in `/etc/rent-split.env`.

GitHub Actions (`.github/workflows/deploy.yml`) on push to `main` (or manual dispatch):

1. Self-hosted runner SSHs to `server1` as `max-kendall`
2. Runs `deploy/remote-deploy.sh` — bootstrap/pull, `bun run install:all && bun run build`, refresh unit, `systemctl restart rent-split`

First run converts the old manual copy into a git checkout and keeps `data/` intact.

Important env vars:

- `RENT_SPLIT_ADMIN_USER` / `RENT_SPLIT_ADMIN_PASSWORD` — seeded into `accounts.json` if that file is empty
- `DATA_DIR` — where `rent-split.json`, `accounts.json`, and `backups/` live
- `SECURE_COOKIE=1` — once on https

Disable or reset a person's login to revoke them. Changing `RENT_SPLIT_SECRET` signs everyone out.

## Data

Household numbers are one JSON document with a revision. Logins (password hashes) live in a separate `accounts.json` next to it and are never sent to the browser. Every household write keeps a timestamped backup (capped at 200). Concurrent edits: last write with matching `rev` wins; conflicts ask the user to keep/overwrite. Admins can edit the household; tenants see only their own dashboard and can record a settlement.

## New features

Prefer React components under `frontend/src/`. Split and storage logic lives in `frontend/src/domain/` so the UI stays a view over that engine.
