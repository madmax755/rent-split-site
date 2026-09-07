from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.bootstrap import bootstrap
from app.config import MAX_BODY_BYTES, Settings, get_settings
from app.errors import ApiError
from app.routes import router

logger = logging.getLogger("rent-split")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    bootstrap(settings)
    admin = _first_admin_name()
    print(f"Rent Split listening (FastAPI)  data: {settings.database_path}")
    print(f"  admin:    {admin or '(none)'}")
    if not settings.secure_cookie:
        print("  note:     set SECURE_COOKIE=1 once you are serving over https")
    yield


def _first_admin_name() -> str | None:
    from sqlalchemy import select

    from app.db import get_session_factory
    from app.models import Account

    factory = get_session_factory()
    with factory() as session:
        account = session.scalar(
            select(Account).where(Account.role == "admin", Account.enabled.is_(True))
        )
        return account.username if account else None


app = FastAPI(title="Rent Split", docs_url=None, redoc_url=None, lifespan=lifespan)
app.include_router(router)


@app.middleware("http")
async def limit_body(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > MAX_BODY_BYTES:
                return JSONResponse(
                    status_code=400,
                    content={"error": "too large"},
                    headers={"Cache-Control": "no-store"},
                )
        except ValueError:
            pass
    return await call_next(request)


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    body: dict[str, object] = {"error": exc.message}
    if exc.rev is not None:
        body["rev"] = exc.rev
    return JSONResponse(status_code=exc.status, content=body, headers={"Cache-Control": "no-store"})


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "Bad JSON"},
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException) -> Response:
    if request.url.path.startswith("/api/"):
        message = exc.detail if isinstance(exc.detail, str) else "Server error"
        if exc.status_code == 404:
            message = "No such endpoint"
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": message},
            headers={"Cache-Control": "no-store"},
        )
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(Exception)
async def unhandled(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Server error"},
        headers={"Cache-Control": "no-store"},
    )


def _safe_file(public_dir: Path, rel: str) -> Path | None:
    full = (public_dir / rel.lstrip("/")).resolve()
    try:
        full.relative_to(public_dir.resolve())
    except ValueError:
        return None
    return full


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
async def spa(full_path: str, request: Request) -> Response:
    settings: Settings = get_settings()
    public_dir = settings.public_dir
    rel = full_path if full_path else "index.html"
    target = _safe_file(public_dir, rel)
    if target is None:
        return Response(status_code=403, content="Forbidden")
    if not target.is_file():
        index = public_dir / "index.html"
        if not index.is_file():
            return Response(status_code=404, content="Not found")
        target = index
    return _send_file(target, request)


def _send_file(path: Path, request: Request) -> Response:
    stat = path.stat()
    etag = f'W/"{stat.st_size}-{int(stat.st_mtime * 1000):x}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)
    suffix = path.suffix.lower()
    media = MIME.get(suffix, "application/octet-stream")
    hashed = f"{path.parent.name}" == "assets"
    cache = "public, max-age=31536000, immutable" if hashed else "no-cache"
    headers = {
        "ETag": etag,
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
    }
    if request.method == "HEAD":
        return Response(status_code=200, headers=headers, media_type=media)
    return FileResponse(path, headers=headers, media_type=media)


@app.api_route("/{full_path:path}", methods=["POST", "PUT", "PATCH", "DELETE"])
async def method_not_allowed(full_path: str) -> JSONResponse:
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"error": "No such endpoint"})
    return JSONResponse(status_code=405, content={"error": "Method not allowed"})


def run() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        factory=False,
        app_dir=str(Path(__file__).resolve().parent.parent),
    )
