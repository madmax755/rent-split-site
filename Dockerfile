# syntax=docker/dockerfile:1
#
# Production image for Rent Split.
# Multi-stage: Bun builds the Vite frontend; Python/uv runs FastAPI with
# PUBLIC_DIR pointing at the baked-in assets (same shape as `bun start`).
#
# Host nginx (tms.maxkendall.com) terminates TLS and reverse-proxies the whole
# site to 127.0.0.1:8080 — see deploy/tms.maxkendall.com.conf.

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS frontend

WORKDIR /src

COPY package.json bun.lock ./
COPY frontend/package.json frontend/bun.lock ./frontend/

RUN bun install --frozen-lockfile \
  && bun install --frozen-lockfile --cwd frontend

COPY frontend ./frontend

RUN bun run --cwd frontend build \
  && test -f frontend/dist/index.html

# ---------------------------------------------------------------------------
# Python runtime
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.12.13 /uv /usr/local/bin/uv

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PORT=8080 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public

# Install deps first for better layer caching (project metadata only).
COPY server/pyproject.toml server/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY server/app ./app
COPY server/alembic ./alembic
COPY server/alembic.ini ./alembic.ini

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY --from=frontend /src/frontend/dist /app/public

RUN useradd --create-home --uid 1000 --user-group rent-split \
  && mkdir -p /data \
  && chown -R rent-split:rent-split /app /data

USER rent-split

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4)"]

CMD ["/app/.venv/bin/rent-split"]
