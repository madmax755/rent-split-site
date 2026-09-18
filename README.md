# Rent Split

Self-hosted household rent & bill splitter. One deploy = one household: clone the
image, give it its own data directory and `SITE_TITLE`, and rename the
placeholder people in the UI.

- **Frontend:** Vite 8 + React 19 + React Compiler + Tailwind 4 + TypeScript
- **Server:** FastAPI + SQLAlchemy 2 + Alembic + SQLite (`server/`) — shared household, backups
- **Tooling:** Bun (frontend) and uv (Python API); oxfmt / oxlint
- **Production:** Docker image on a private registry + compose on the host

## Layout

```
rent-split-site/
├── frontend/                 Vite React app (build → frontend/dist)
│   └── src/                  typed React UI, domain engine, storage adapters
├── server/                   FastAPI API + static file server
│   └── alembic/              SQLite schema migrations
├── deploy/                   compose cutover notes, nginx examples, legacy systemd
├── Dockerfile                multi-stage production image
├── docker-compose.prod.yml   example compose (registry image + data bind-mount)
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
`bun start`). On the host, **nginx terminates TLS** and reverse-proxies the
whole site to `127.0.0.1:<port>` — it no longer serves static files from disk.

```bash
docker build -t rent-split:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/data:/data" \
  -e DATA_DIR=/data -e PUBLIC_DIR=/app/public -e SITE_TITLE="Rent Split" \
  rent-split:local
curl -fsS http://127.0.0.1:8080/api/health
```

### Deploy (example: existing server1 install)

Live install pattern: Docker Compose under `/opt/rent-split-site`, credentials in
`/etc/rent-split.env`, SQLite bind-mounted from `/opt/rent-split-site/data`
(**must preserve** across deploys). Images are pulled from your registry.

GitHub Actions (this repo):

1. **`build-push`** (self-hosted) — `docker buildx build` → Tailscale registry
   (`:sha`, `:latest` on main, version tags on `v*`)
2. **`deploy`** — after a successful build-push on main (or manual dispatch),
   copies compose/nginx to server1 and runs `deploy/remote-deploy.sh`
   (pull + `compose up -d`, stop/disable legacy `rent-split.service`, reload nginx)

Cutover details and rollback notes: [`deploy/CUTOVER.md`](deploy/CUTOVER.md).

Important env vars (host file, e.g. `/etc/rent-split.env`):

- `SITE_TITLE` — brand shown in the shell and browser tab (default `Rent Split`)
- `DATA_DIR` — on the host historically `/opt/rent-split-site/data`; compose forces `/data` inside the container

Who you are is stored in the browser (`localStorage`). There are no server-side
sessions or passwords — pick a household person on the first visit. The payer
sees household setup; everyone else sees their own dashboard.

The systemd unit in `deploy/rent-split.service` is **legacy** (rollback only).

## Second household (separate instance)

A second flat share is another compose stack + data volume + nginx
`server_name` — not multi-tenant in one process.

1. **Empty data dir** — e.g. `/opt/friend-rent-split/data` (do not reuse Max's DB).
2. **Env file** — copy `.env.example` → `/etc/friend-rent-split.env` and set:
   - `SITE_TITLE=Friend Flat` (or whatever brand you want)
   - leave `DATA_DIR` alone if compose sets `/data` inside the container
3. **Compose** — copy `docker-compose.prod.yml`, change:
   - `container_name` (must be unique)
   - host port mapping (e.g. `127.0.0.1:8081:8080` if 8080 is taken)
   - `env_file` path
   - volume bind to the new data dir
4. **nginx** — copy `deploy/nginx.conf.example`, set `server_name`, TLS paths, and
   `proxy_pass` to the new localhost port. Enable the site and reload nginx.
5. **Boot** — `docker compose -f … up -d`, open the site, sign in as **Person 1**
   (payer), then rename people/rooms/bills and set rent in Household.

Upgrading an existing install never reseeds people: migrations only change
schema. Defaults apply when the DB has no household document yet (or after an
explicit reset in Settings).

## Data

Household numbers are stored relationally in SQLite (`people`, `rooms`, `bills`, `months`, `ledger`, …) behind the same JSON document API the React app already uses. Every household write keeps a timestamped JSON backup (capped at 200). Concurrent edits: last write with matching `rev` wins; conflicts ask the user to keep/overwrite. The payer can edit the household; everyone else sees their own dashboard and can record a settlement.

On first boot, if `data/` still has the old `rent-split.json` and the database is empty, it is imported. The JSON file is left in place. A brand-new empty `DATA_DIR` starts with no household rows; the UI seeds generic **Person 1** / **Person 2** placeholders until the payer saves.

## New features

Prefer React components under `frontend/src/`. Split and storage logic lives in `frontend/src/domain/` so the UI stays a view over that engine.
