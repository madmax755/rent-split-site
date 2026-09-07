from __future__ import annotations

import time
from collections.abc import Generator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.accounts import (
    authenticate,
    create_account,
    disable_for_person,
    get_by_id,
    list_accounts,
    public_of,
    remove_account,
    update_account,
)
from app.auth import (
    client_ip,
    clear_session_cookie_header,
    make_token,
    parse_cookies,
    parse_token,
    read_env_secret,
    session_cookie_header,
)
from app.config import Settings, get_settings
from app.db import get_session_factory
from app.errors import (
    ACCOUNT_ERROR_STATUS,
    AccountError,
    ApiError,
    ConflictError,
    NoHouseholdError,
)
from app.household import (
    append_ledger,
    assemble_document,
    load_household,
    locked_write,
    mutate_household,
    person_name,
    put_household,
    remove_ledger,
    tenant_document,
)
from app.models import Account, utc_now_iso
from app.schemas import (
    CreateAccountRequest,
    DisablePersonRequest,
    LedgerEntryModel,
    LoginRequest,
    PatchAccountRequest,
    PutDataRequest,
    SessionInfo,
    SettleRequest,
)

router = APIRouter()

_attempts: dict[str, dict[str, float | int]] = {}


def db_session() -> Generator[Session, None, None]:
    factory = get_session_factory()
    with factory() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


Db = Annotated[Session, Depends(db_session)]
Cfg = Annotated[Settings, Depends(get_settings)]


def json_error(status: int, message: str, rev: int | None = None) -> JSONResponse:
    body: dict[str, Any] = {"error": message}
    if rev is not None:
        body["rev"] = rev
    return JSONResponse(status_code=status, content=body)


def json_ok(status: int, body: Any) -> JSONResponse:
    return JSONResponse(status_code=status, content=body, headers={"Cache-Control": "no-store"})


def session_account(request: Request, session: Session, settings: Settings) -> Account | None:
    token = parse_cookies(request.headers.get("cookie")).get("rs_session")
    parsed = parse_token(token, read_env_secret(settings))
    if parsed is None:
        return None
    account = get_by_id(session, parsed.account_id)
    if account is None or not account.enabled:
        return None
    if account.token_version != parsed.token_version:
        return None
    return account


def require_account(request: Request, session: Session, settings: Settings) -> Account:
    account = session_account(request, session, settings)
    if account is None:
        raise ApiError(401, "Not signed in")
    return account


def require_admin(account: Account) -> None:
    if account.role != "admin":
        raise ApiError(403, "Admin only")


def session_info(account: Account, household: Any) -> dict[str, Any]:
    info = SessionInfo(
        accountId=account.id,
        username=account.username,
        role=account.role if account.role in ("admin", "tenant") else "tenant",  # type: ignore[arg-type]
        personId=account.person_id,
        personName=person_name(household, account.person_id),
    )
    return info.model_dump()


def throttled(ip: str) -> bool:
    row = _attempts.get(ip)
    if not row:
        return False
    until = float(row.get("until") or 0)
    return until > time.time() * 1000


def note_failure(ip: str) -> None:
    row = _attempts.get(ip) or {"n": 0, "until": 0}
    n = int(row["n"]) + 1
    until = float(row["until"])
    if n >= 5:
        until = time.time() * 1000 + 60_000
        n = 0
    _attempts[ip] = {"n": n, "until": until}


@router.get("/api/health")
def health(request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = session_account(request, db, settings)
    household = load_household(db) if account else None
    return json_ok(
        200,
        {
            "app": "rent-split",
            "version": 2,
            "authRequired": True,
            "authed": account is not None,
            "session": session_info(account, household) if account else None,
        },
    )


@router.post("/api/login")
def login(request: Request, db: Db, settings: Cfg, body: LoginRequest) -> JSONResponse:
    ip = client_ip(request.headers.get("x-forwarded-for"), request.client.host if request.client else None)
    if throttled(ip):
        return json_error(429, "Too many attempts. Wait a minute.")
    account = authenticate(db, body.username, body.password)
    if account is None:
        note_failure(ip)
        return json_error(401, "Wrong username or password")
    _attempts.pop(ip, None)
    household = load_household(db)
    response = json_ok(200, {"ok": True, "session": session_info(account, household)})
    response.headers["Set-Cookie"] = session_cookie_header(make_token(account, read_env_secret(settings)), settings)
    return response


@router.post("/api/logout")
def logout() -> JSONResponse:
    response = json_ok(200, {"ok": True})
    response.headers["Set-Cookie"] = clear_session_cookie_header()
    return response


@router.get("/api/me")
def me(request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = require_account(request, db, settings)
    return json_ok(200, session_info(account, load_household(db)))


@router.get("/api/rev")
def rev(request: Request, db: Db, settings: Cfg) -> JSONResponse:
    require_account(request, db, settings)
    household = load_household(db)
    return json_ok(
        200,
        {
            "rev": 0 if household is None else household.rev,
            "savedAt": None if household is None else household.saved_at,
        },
    )


@router.get("/api/data")
def get_data(request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    doc = assemble_document(load_household(db))
    return json_ok(200, doc.model_dump())


@router.put("/api/data")
def put_data(request: Request, db: Db, settings: Cfg, body: PutDataRequest) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    payload = body.payload
    if not isinstance(payload, dict) or payload.get("app") != "rent-split" or not isinstance(
        payload.get("schema"), (int, float)
    ):
        if not isinstance(payload, dict):
            return json_error(400, "Missing payload")
        return json_error(400, "Not a rent-split payload")
    with locked_write():
        try:
            doc = put_household(db, payload, body.rev, body.force, settings)
            db.commit()
        except ConflictError as err:
            db.rollback()
            return json_error(409, "conflict", err.rev)
        except Exception:
            db.rollback()
            raise
    return json_ok(200, {"rev": doc.rev, "savedAt": doc.savedAt})


@router.get("/api/mine")
def mine(request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = require_account(request, db, settings)
    doc = assemble_document(load_household(db))
    if account.role == "admin":
        return json_ok(200, doc.model_dump())
    if not account.person_id:
        return json_error(403, "This login is not linked to a person yet.")
    return json_ok(200, tenant_document(doc, account.person_id).model_dump())


@router.post("/api/settle")
def settle(request: Request, db: Db, settings: Cfg, body: SettleRequest) -> JSONResponse:
    account = require_account(request, db, settings)
    person_id = str(body.personId or "")
    amount = round(float(body.amount)) if body.amount is not None else 0
    if not person_id or amount == 0:
        return json_error(400, "Need a person and a non-zero amount.")
    if account.role != "admin" and person_id != account.person_id:
        return json_error(403, "You can only record your own settlement.")
    entry = LedgerEntryModel(
        id=body.id if body.id else "lg" + format(int(time.time() * 1000), "x"),
        personId=person_id,
        monthKey=body.monthKey or "",
        type="settle",
        amount=amount,
        date=body.date if body.date else utc_now_iso()[:10],
        note=body.note or "",
    )

    def mutate(household: Any) -> None:
        append_ledger(household, entry)

    with locked_write():
        try:
            doc = mutate_household(db, mutate, body.rev, body.force, settings)
            db.commit()
        except ConflictError as err:
            db.rollback()
            return json_error(409, "conflict", err.rev)
        except NoHouseholdError as err:
            db.rollback()
            return json_error(400, str(err))
        except Exception:
            db.rollback()
            raise
    return json_ok(200, {"rev": doc.rev, "savedAt": doc.savedAt, "entry": entry.model_dump()})


@router.delete("/api/ledger/{entry_id}")
def delete_ledger(entry_id: str, request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = require_account(request, db, settings)
    if not entry_id:
        return json_error(400, "Missing id")

    def mutate(household: Any) -> None:
        try:
            row = remove_ledger(household, entry_id)
        except KeyError as err:
            missing = ApiError(404, "No such record.")
            raise missing from err
        if account.role != "admin":
            if row.person_id != account.person_id or row.type != "settle":
                raise ApiError(403, "You can only undo your own settlements.")

    with locked_write():
        try:
            doc = mutate_household(db, mutate, None, True, settings)
            db.commit()
        except ApiError as err:
            db.rollback()
            return json_error(err.status, err.message)
        except NoHouseholdError as err:
            db.rollback()
            return json_error(400, str(err))
        except Exception:
            db.rollback()
            raise
    return json_ok(200, {"rev": doc.rev, "savedAt": doc.savedAt})


@router.get("/api/accounts")
def get_accounts(request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    return json_ok(200, {"accounts": [public_of(a).model_dump() for a in list_accounts(db)]})


@router.post("/api/accounts")
def post_account(request: Request, db: Db, settings: Cfg, body: CreateAccountRequest) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    try:
        created = create_account(
            db,
            username=body.username,
            password=body.password,
            person_id=body.personId,
            role=body.role,
        )
        db.commit()
    except AccountError as err:
        db.rollback()
        return json_error(ACCOUNT_ERROR_STATUS[err.code], str(err))
    return json_ok(200, public_of(created).model_dump())


@router.post("/api/accounts/disable-person")
def disable_person(request: Request, db: Db, settings: Cfg, body: DisablePersonRequest) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    disable_for_person(db, str(body.personId or ""))
    db.commit()
    return json_ok(200, {"ok": True, "accounts": [public_of(a).model_dump() for a in list_accounts(db)]})


@router.patch("/api/accounts/{account_id}")
def patch_account(
    account_id: str, request: Request, db: Db, settings: Cfg, body: PatchAccountRequest
) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    patch: dict[str, object] = body.model_dump(exclude_unset=True)
    renamed = {}
    for key, value in patch.items():
        if key == "personId":
            renamed["personId"] = value
        else:
            renamed[key] = value
    try:
        updated = update_account(db, account_id, renamed)
        db.commit()
    except AccountError as err:
        db.rollback()
        return json_error(ACCOUNT_ERROR_STATUS[err.code], str(err))
    return json_ok(200, public_of(updated).model_dump())


@router.delete("/api/accounts/{account_id}")
def delete_account(account_id: str, request: Request, db: Db, settings: Cfg) -> JSONResponse:
    account = require_account(request, db, settings)
    require_admin(account)
    try:
        remove_account(db, account_id)
        db.commit()
    except AccountError as err:
        db.rollback()
        return json_error(ACCOUNT_ERROR_STATUS[err.code], str(err))
    return json_ok(200, {"ok": True})


@router.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
def api_missing(full_path: str, request: Request, db: Db, settings: Cfg) -> JSONResponse:
    require_account(request, db, settings)
    return json_error(404, "No such endpoint")
