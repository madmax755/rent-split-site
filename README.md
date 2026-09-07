# Rent Split

Self-hosted household rent & bill splitter.

- **Frontend:** Vite 8 + React 19 + React Compiler + Tailwind 4 + TypeScript
- **Server:** FastAPI + SQLAlchemy 2 + Alembic + SQLite (`server/`) — per-person logins, backups
- **Tooling:** Bun (frontend) and uv (Python API); oxfmt / oxlint

## Layout

```
rent-split-site/
├── frontend/          Vite React app (build → frontend/dist)
│   └── src/           typed React UI, domain engine, storage adapters
├── server/            FastAPI API + static file server
│   └── alembic/       SQLite schema migrations
├── deploy/            systemd + nginx examples
├── data/              runtime SQLite + backups (gitignored)
└── .env.example
```

## Develop

Requires **Bun**, **uv**, and **Python 3.12+**.

```bash
bun run install:all
bun run dev
```

- UI: http://127.0.0.1:5173 (Vite proxies `/api` → server on :8080)
- API/static prod shape: http://127.0.0.1:8080 after `bun run build && bun start`

Server tests: `bun run test:server`. New schema: edit SQLAlchemy models in `server/app/models.py`, then `uv run --directory server alembic revision --autogenerate -m "…"`.

## Production

```bash
bun run build
# set env from .env.example
bun start
```

Locally, `bun start` serves `frontend/dist` and `/api/*` from one process. In production nginx serves the Vite build and reverse-proxies only `/api/*` to FastAPI (`deploy/nginx.conf.example`, `deploy/rent-split.service`).

On first boot, if `data/` still has the old `rent-split.json` / `accounts.json` and the database is empty, they are imported. The JSON files are left in place.

### Deploy to server1 (tms.maxkendall.com)

Live install: systemd unit `rent-split.service`, app dir `/opt/rent-split-site`, credentials in `/etc/rent-split.env`.

GitHub Actions (`.github/workflows/deploy.yml`) on push to `main` (or manual dispatch):

1. Self-hosted runner SSHs to `server1` as `max-kendall`
2. Runs `deploy/remote-deploy.sh` — bootstrap/pull, frontend build, `uv sync`, refresh unit, `systemctl restart rent-split`, reload nginx (static `frontend/dist`, `/api/*` proxied)

First run converts the old manual copy into a git checkout and keeps `data/` intact.

Important env vars:

- `RENT_SPLIT_ADMIN_USER` / `RENT_SPLIT_ADMIN_PASSWORD` — seeded into SQLite if the account table is empty
- `DATA_DIR` — where `rent-split.db`, `backups/`, and optional legacy JSON live
- `SECURE_COOKIE=1` — once on https

Disable or reset a person's login to revoke them. Changing `RENT_SPLIT_SECRET` signs everyone out.

## Data

Household numbers are stored relationally in SQLite (`people`, `rooms`, `bills`, `months`, `ledger`, …) behind the same JSON document API the React app already uses. Logins live in the `account` table; password hashes never go to the browser. Every household write keeps a timestamped JSON backup (capped at 200). Concurrent edits: last write with matching `rev` wins; conflicts ask the user to keep/overwrite. Admins can edit the household; tenants see only their own dashboard and can record a settlement.

## New features

Prefer React components under `frontend/src/`. Split and storage logic lives in `frontend/src/domain/` so the UI stays a view over that engine.
