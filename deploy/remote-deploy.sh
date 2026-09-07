#!/usr/bin/env bash
# Run on server1 as max-kendall (has passwordless sudo).
# Converts /opt/rent-split-site to a git checkout if needed, pulls, builds, restarts.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/rent-split-site}"
REPO_URL="${REPO_URL:-https://github.com/madmax755/rent-split-site.git}"
REF="${REF:-main}"
export PATH="${HOME}/.local/bin:${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

log() { printf '[deploy] %s\n' "$*"; }

sync_to_ref() {
  log "Fetching ${REF}"
  git remote set-url origin "${REPO_URL}" 2>/dev/null || git remote add origin "${REPO_URL}"
  git fetch --depth 1 origin "${REF}"
  git checkout --force --detach FETCH_HEAD
  git clean -fd --exclude=data --exclude=frontend/node_modules --exclude=node_modules --exclude=frontend/dist --exclude=server/.venv
}

if ! command -v bun >/dev/null 2>&1; then
  log "bun not found on PATH (${PATH})"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  log "python3 not found"
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  log "Installing uv"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
fi

if [[ ! -d "${DEPLOY_DIR}" ]]; then
  log "Creating ${DEPLOY_DIR}"
  sudo mkdir -p "${DEPLOY_DIR}"
  sudo chown rent-split:rent-split "${DEPLOY_DIR}"
  sudo chmod 2770 "${DEPLOY_DIR}"
fi

cd "${DEPLOY_DIR}"

# Repo is owned by rent-split; deploy runs as max-kendall (group member).
git config --global --add safe.directory "${DEPLOY_DIR}" 2>/dev/null || true

# --- bootstrap: turn a manual copy into a git checkout, keeping data/ ---
if [[ ! -d .git ]]; then
  log "No git repo yet — bootstrapping from ${REPO_URL} (${REF})"
  TMP="$(mktemp -d /tmp/rent-split-bootstrap.XXXXXX)"
  cleanup() { rm -rf "${TMP}"; }
  trap cleanup EXIT

  git clone --depth 1 "${REPO_URL}" "${TMP}/repo"
  git -C "${TMP}/repo" fetch --depth 1 origin "${REF}"
  git -C "${TMP}/repo" checkout --force --detach FETCH_HEAD

  if [[ -d data ]]; then
    log "Preserving existing data/"
    sudo rm -rf "${TMP}/repo/data"
    sudo cp -a data "${TMP}/repo/data"
  fi

  # Replace tree in place (keep the directory inode / parent permissions).
  shopt -s dotglob nullglob
  for item in ./* ./.[!.]* ./..?*; do
    [[ -e "${item}" ]] || continue
    base="$(basename "${item}")"
    [[ "${base}" == "." || "${base}" == ".." ]] && continue
    sudo rm -rf "${item}"
  done
  sudo cp -a "${TMP}/repo"/. .
  trap - EXIT
  cleanup

  sudo chown -R rent-split:rent-split "${DEPLOY_DIR}"
  sudo chmod -R g+rwX "${DEPLOY_DIR}"
  sudo find "${DEPLOY_DIR}" -type d -exec chmod g+s {} +
  sudo chmod 2770 "${DEPLOY_DIR}"
fi

if [[ ! -w "${DEPLOY_DIR}" ]]; then
  log "Making deploy dir group-writable"
  sudo chgrp -R rent-split "${DEPLOY_DIR}"
  sudo chmod -R g+rwX "${DEPLOY_DIR}"
fi

# Bootstrap already left the tree at REF; still re-sync so retries are idempotent.
sync_to_ref

log "Installing dependencies"
bun install
bun install --cwd frontend
# System Python only: uv's default can symlink .venv/bin/python into
# ~/.local/share/uv/python, which ProtectHome=true then hides from rent-split (203/EXEC).
uv sync --directory server --frozen --python /usr/bin/python3

# Vite empties outDir at the start of a build. Keep the last good tree so a
# failed compile cannot 404 the live site.
DIST_BACKUP=""
if [[ -f frontend/dist/index.html ]]; then
  DIST_BACKUP="$(mktemp -d /tmp/rent-split-dist.XXXXXX)"
  cp -a frontend/dist/. "${DIST_BACKUP}/"
fi
restore_dist() {
  if [[ -n "${DIST_BACKUP}" && -f "${DIST_BACKUP}/index.html" ]]; then
    log "Restoring previous frontend/dist"
    rm -rf frontend/dist
    mkdir -p frontend/dist
    cp -a "${DIST_BACKUP}/." frontend/dist/
  fi
}

log "Building frontend"
if ! bun run --cwd frontend build; then
  restore_dist
  log "Frontend build failed"
  exit 1
fi
if [[ ! -f frontend/dist/index.html ]]; then
  restore_dist
  log "Build failed — frontend/dist/index.html missing"
  exit 1
fi
rm -rf "${DIST_BACKUP}"

# nginx (www-data) must traverse the deploy dir and read dist, but not data/.
sudo chmod 2771 "${DEPLOY_DIR}"
sudo chmod -R a+rX "${DEPLOY_DIR}/frontend/dist"

log "Refreshing systemd unit"
sudo cp deploy/rent-split.service /etc/systemd/system/rent-split.service
sudo systemctl daemon-reload

sudo chown -R rent-split:rent-split "${DEPLOY_DIR}/data"
sudo chmod -R u+rwX,g+rwX "${DEPLOY_DIR}/data"
sudo chgrp -R rent-split "${DEPLOY_DIR}/server/.venv"
sudo chmod -R g+rX "${DEPLOY_DIR}/server/.venv"

log "Restarting rent-split.service"
sudo systemctl restart rent-split
sleep 1
sudo systemctl --no-pager --full status rent-split

if [[ -f /etc/nginx/sites-enabled/tms.maxkendall.com || -f deploy/tms.maxkendall.com.conf ]]; then
  log "Refreshing nginx site"
  sudo cp deploy/tms.maxkendall.com.conf /etc/nginx/sites-enabled/tms.maxkendall.com
  sudo nginx -t
  sudo systemctl reload nginx
fi

log "Health check"
curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health"
echo
log "Done"
