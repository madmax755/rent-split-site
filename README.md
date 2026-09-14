# Rent Split

Self-hosted household rent & bill splitter.

- **Frontend:** Vite 8 + React 19 + React Compiler + Tailwind 4 + TypeScript
- **Server:** FastAPI + SQLAlchemy 2 + Alembic + SQLite (`server/`) — per-person logins, backups
- **Tooling:** Bun (frontend) and uv (Python API); oxfmt / oxlint
- **Production:** Docker image on the Tailscale registry + compose on server1

## Layout

```
rent-split-site/
├── frontend/                 Vite React app (build → frontend/dist)
│   └── src/                  typed React UI, domain engine, storage adapters
├── server/                   FastAPI API + static file server
│   └── alembic/              SQLite schema migrations
├── deploy/                   compose cutover notes, nginx, legacy systemd
├── Dockerfile                multi-stage production image
├── docker-compose.prod.yml   server1 compose (registry image + data bind-mount)
├── data/                     runtime SQLite + backups (gitignored)
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

### Local (no Docker)

```bash
bun run build
# set env from .env.example
bun start
```

`bun start` serves `frontend/dist` and `/api/*` from one process.

### Docker image (preferred)

The production image builds the frontend in a multi-stage Dockerfile and runs
FastAPI with `PUBLIC_DIR` pointing at the baked-in assets (same shape as
`bun start`). On server1, **host nginx terminates TLS** and reverse-proxies the
whole site to `127.0.0.1:8080` — it no longer serves static files from disk.

```bash
docker build -t rent-split:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/data:/data" \
  -e DATA_DIR=/data -e PUBLIC_DIR=/app/public -e SECURE_COOKIE=0 \
  rent-split:local
curl -fsS http://127.0.0.1:8080/api/health
```

### Deploy to server1 (tms.maxkendall.com)

Live install: Docker Compose under `/opt/rent-split-site`, credentials in
`/etc/rent-split.env`, SQLite bind-mounted from `/opt/rent-split-site/data`
(**must preserve** across deploys). Images:
`100.81.62.22:5000/rent-split:<tag>`.

GitHub Actions:

1. **`build-push`** (self-hosted) — `docker buildx build` → Tailscale registry
   (`:sha`, `:latest` on main, version tags on `v*`)
2. **`deploy`** — after a successful build-push on main (or manual dispatch),
   copies compose/nginx to server1 and runs `deploy/remote-deploy.sh`
   (pull + `compose up -d`, stop/disable legacy `rent-split.service`, reload nginx)

Cutover details and rollback notes: [`deploy/CUTOVER.md`](deploy/CUTOVER.md).

Important env vars (host file `/etc/rent-split.env`; never commit secrets):

- `RENT_SPLIT_ADMIN_USER` / `RENT_SPLIT_ADMIN_PASSWORD` — seeded into SQLite if the account table is empty
- `DATA_DIR` — on the host historically `/opt/rent-split-site/data`; compose forces `/data` inside the container
- `SECURE_COOKIE=1` — once on https

Disable or reset a person's login to revoke them. Changing `RENT_SPLIT_SECRET` signs everyone out.

The systemd unit in `deploy/rent-split.service` is **legacy** (rollback only).

## Data

Household numbers are stored relationally in SQLite (`people`, `rooms`, `bills`, `months`, `ledger`, …) behind the same JSON document API the React app already uses. Logins live in the `account` table; password hashes never go to the browser. Every household write keeps a timestamped JSON backup (capped at 200). Concurrent edits: last write with matching `rev` wins; conflicts ask the user to keep/overwrite. Admins can edit the household; tenants see only their own dashboard and can record a settlement.

On first boot, if `data/` still has the old `rent-split.json` / `accounts.json` and the database is empty, they are imported. The JSON files are left in place.

## New features

Prefer React components under `frontend/src/`. Split and storage logic lives in `frontend/src/domain/` so the UI stays a view over that engine.
