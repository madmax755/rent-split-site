#!/usr/bin/env bash
# Run on server1 as max-kendall (has passwordless sudo).
#
# Production path (current): pull rent-split from the Tailscale registry and
# `docker compose up -d`. Preserves /opt/rent-split-site/data and /etc/rent-split.env.
#
# Legacy path (systemd + bun/uv on the host) is retired — see deploy/rent-split.service
# and deploy/CUTOVER.md.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rent-split-site}"
IMAGE="${IMAGE:-100.81.62.22:5000/rent-split:latest}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-/etc/rent-split.env}"
NGINX_SRC="${NGINX_SRC:-/tmp/rent-split-nginx.conf}"
export PATH="${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

log() { printf '[deploy] %s\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  log "docker not found on PATH (${PATH})"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  log "Missing env file ${ENV_FILE}"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  log "Missing compose file ${COMPOSE_FILE}"
  exit 1
fi

log "Ensuring data directory exists (preserving SQLite + backups)"
sudo mkdir -p "${DEPLOY_DIR}/data" "${DEPLOY_DIR}/data/backups"
# Image USER is uid 1000. Align host data ownership so the bind-mount is writable.
# Override with RENT_SPLIT_UID / RENT_SPLIT_GID if the container user differs.
RENT_SPLIT_UID="${RENT_SPLIT_UID:-1000}"
RENT_SPLIT_GID="${RENT_SPLIT_GID:-1000}"
sudo chown -R "${RENT_SPLIT_UID}:${RENT_SPLIT_GID}" "${DEPLOY_DIR}/data"
sudo chmod -R u+rwX,g+rwX "${DEPLOY_DIR}/data"
# nginx (and admins in group rent-split) still need to traverse the deploy dir.
sudo chmod 2771 "${DEPLOY_DIR}"

log "Stopping legacy systemd unit if present"
if systemctl list-unit-files rent-split.service >/dev/null 2>&1; then
  if systemctl is-active --quiet rent-split.service 2>/dev/null; then
    sudo systemctl stop rent-split.service
    log "Stopped rent-split.service"
  fi
  if systemctl is-enabled --quiet rent-split.service 2>/dev/null; then
    sudo systemctl disable rent-split.service
    log "Disabled rent-split.service (legacy)"
  fi
fi

log "Pulling ${IMAGE}"
export IMAGE
export RENT_SPLIT_UID RENT_SPLIT_GID
docker pull "${IMAGE}"

log "Starting compose stack"
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --force-recreate

if [[ -f "${NGINX_SRC}" ]]; then
  log "Refreshing nginx site (full reverse-proxy to container)"
  sudo cp "${NGINX_SRC}" /etc/nginx/sites-enabled/tms.maxkendall.com
  sudo nginx -t
  sudo systemctl reload nginx
else
  log "No nginx conf at ${NGINX_SRC} — skipping nginx refresh"
fi

log "Waiting for health"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" >/tmp/rent-split-health.json 2>/dev/null; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "${ok}" -ne 1 ]]; then
  log "Health check failed"
  docker compose -f "${COMPOSE_FILE}" ps || true
  docker compose -f "${COMPOSE_FILE}" logs --tail 80 || true
  exit 1
fi
cat /tmp/rent-split-health.json
echo
log "Container data path inside image: DATA_DIR=/data → host ${DEPLOY_DIR}/data"
log "Done (${IMAGE})"
