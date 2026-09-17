from __future__ import annotations

import time
from collections.abc import Generator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session_factory
from app.errors import ApiError, ConflictError, NoHouseholdError, StintWriteError
from app.household import (
    append_ledger,
    assemble_document,
    load_household,
    locked_write,
    mutate_household,
    put_household,
    remove_ledger,
    replace_person_stints,
)
from app.models import utc_now_iso
from app.schemas import (
    LedgerEntryModel,
    PutDataRequest,
    PutStintsRequest,
    SettleRequest,
)

router = APIRouter()


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


def household_people(session: Session) -> list[dict[str, Any]]:
    household = load_household(session)
    if household is None:
        return []
    people = sorted(household.people, key=lambda person: person.sort_index)
    return [
        {
            "id": person.id,
            "name": person.name,
            "isPayer": person.is_payer,
            "archived": person.archived,
        }
        for person in people
    ]


@router.get("/api/health")
def health(db: Db) -> JSONResponse:
    return json_ok(
        200,
        {
            "app": "rent-split",
            "version": 2,
            "people": household_people(db),
        },
    )


@router.get("/api/rev")
def rev(db: Db) -> JSONResponse:
    household = load_household(db)
    return json_ok(
        200,
        {
            "rev": 0 if household is None else household.rev,
            "savedAt": None if household is None else household.saved_at,
        },
    )


@router.get("/api/data")
def get_data(db: Db) -> JSONResponse:
    return json_ok(200, assemble_document(load_household(db)).model_dump())


@router.put("/api/data")
def put_data(db: Db, settings: Cfg, body: PutDataRequest) -> JSONResponse:
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


@router.post("/api/settle")
def settle(db: Db, settings: Cfg, body: SettleRequest) -> JSONResponse:
    person_id = str(body.personId or "")
    amount = round(float(body.amount)) if body.amount is not None else 0
    if not person_id or amount == 0:
        return json_error(400, "Need a person and a non-zero amount.")
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


@router.put("/api/stints")
def put_stints(db: Db, settings: Cfg, body: PutStintsRequest) -> JSONResponse:
    person_id = str(body.personId or "")
    if not person_id:
        return json_error(400, "Need a person.")
    for stint in body.stints:
        if stint.personId != person_id:
            return json_error(403, "You can only edit your own stints.")

    def mutate(household: Any) -> None:
        replace_person_stints(household, body.monthKey, person_id, body.stints)

    with locked_write():
        try:
            doc = mutate_household(db, mutate, body.rev, body.force, settings)
            db.commit()
        except StintWriteError as err:
            db.rollback()
            return json_error(400, str(err))
        except ConflictError as err:
            db.rollback()
            return json_error(409, "conflict", err.rev)
        except NoHouseholdError as err:
            db.rollback()
            return json_error(400, str(err))
        except Exception:
            db.rollback()
            raise
    return json_ok(200, {"rev": doc.rev, "savedAt": doc.savedAt})


@router.delete("/api/ledger/{entry_id}")
def delete_ledger(entry_id: str, db: Db, settings: Cfg) -> JSONResponse:
    if not entry_id:
        return json_error(400, "Missing id")

    def mutate(household: Any) -> None:
        try:
            remove_ledger(household, entry_id)
        except KeyError as err:
            missing = ApiError(404, "No such record.")
            raise missing from err

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


@router.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
def api_missing(full_path: str, request: Request) -> JSONResponse:
    return json_error(404, "No such endpoint")
