# Cutover: systemd → Docker Compose (server1)

## Architecture choice

**One production image** builds the Vite frontend in a multi-stage Dockerfile and
runs FastAPI with `PUBLIC_DIR=/app/public` (same shape as local `bun start`).

Host **nginx keeps TLS** (`cert-sterling.pem`) and reverse-proxies the **whole
site** to `127.0.0.1:8080`. We no longer serve `frontend/dist` from the host
filesystem — that avoided needing bun/uv on server1 and matched the image.

| Piece | Before | After |
| --- | --- | --- |
| App process | `rent-split.service` + venv | `docker compose` container |
| Image | n/a | `100.81.62.22:5000/rent-split:<tag>` |
| Static assets | nginx `root …/frontend/dist` | baked into image; nginx proxies `/` |
| API | nginx `/api/` → `:8080` | same port; full-site proxy |
| Data | `/opt/rent-split-site/data` | **unchanged** bind-mount → `/data` |
| Secrets | `/etc/rent-split.env` | **unchanged** `env_file` |

## One-time cutover on server1

Run after the first successful `build-push` (or build locally and push).

1. Confirm Docker is installed and can reach the registry on the tailnet:
   ```bash
   docker pull 100.81.62.22:5000/rent-split:latest
   ```
2. Ensure `/etc/rent-split.env` still has `SECURE_COOKIE=1` and secrets.
   You may leave a host-style `DATA_DIR=/opt/rent-split-site/data` in that file;
   compose overrides `DATA_DIR` / `PUBLIC_DIR` / `PORT` for the container.
3. Place compose (Actions does this) or copy manually:
   ```bash
   sudo mkdir -p /opt/rent-split-site
   # from a checkout:
   sudo cp docker-compose.prod.yml /opt/rent-split-site/
   ```
4. Align data ownership with the container user (image uid/gid **1000**):
   ```bash
   sudo chown -R 1000:1000 /opt/rent-split-site/data
   ```
   If you prefer the existing `rent-split` host user, set
   `RENT_SPLIT_UID` / `RENT_SPLIT_GID` to that user's ids when calling compose /
   `remote-deploy.sh`.
5. Deploy (or let GitHub Actions `deploy` workflow do it):
   ```bash
   IMAGE=100.81.62.22:5000/rent-split:latest \
     bash deploy/remote-deploy.sh
   ```
   The script stops/disables `rent-split.service`, pulls the image, runs compose,
   refreshes nginx, and curls `/api/health`.
6. Verify:
   ```bash
   curl -fsS http://127.0.0.1:8080/api/health
   docker compose -f /opt/rent-split-site/docker-compose.prod.yml ps
   ls -la /opt/rent-split-site/data/rent-split.db
   ```

## Rollback to systemd (emergency)

1. `docker compose -f /opt/rent-split-site/docker-compose.prod.yml down`
2. Restore a host checkout with `frontend/dist` + `server/.venv` if still present,
   or re-bootstrap from git using the old script from git history.
3. Re-enable the legacy unit in `deploy/rent-split.service` and the old nginx
   `root …/frontend/dist` config from git history.
4. `sudo chown -R rent-split:rent-split /opt/rent-split-site/data` if needed.

Prefer fixing the container path; systemd is legacy only.

## CI / CD

- `.github/workflows/build-push.yml` — self-hosted runner, `docker buildx build --push`
  to `100.81.62.22:5000/rent-split` (`:sha`, `:latest` on main, version tags on `v*`).
- `.github/workflows/deploy.yml` — after successful build-push on main (or manual
  dispatch with a tag), scp compose/nginx/script to server1 and run `remote-deploy.sh`.
- `.github/workflows/ci.yml` — unchanged unit/typecheck/build on `ubuntu-latest`.
