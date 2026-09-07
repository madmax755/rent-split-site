from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import normalise_username
from app.config import HOUSEHOLD_ID, Settings
from app.household import parse_envelope, put_household
from app.models import Account, Household


def _load_json(path: Any) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def import_household_json(session: Session, settings: Settings) -> bool:
    path = settings.json_data_file
    if not path.is_file():
        return False
    if session.get(Household, HOUSEHOLD_ID) is not None:
        return False
    raw = _load_json(path)
    payload: dict[str, Any]
    if isinstance(raw, dict) and isinstance(raw.get("payload"), dict):
        payload = raw["payload"]
    elif isinstance(raw, dict) and raw.get("app") == "rent-split":
        payload = raw
    else:
        return False
    try:
        parse_envelope(payload)
    except Exception:
        return False
    put_household(session, payload, expected_rev=0, force=True, settings=settings)
    if isinstance(raw, dict) and isinstance(raw.get("rev"), int):
        household = session.get(Household, HOUSEHOLD_ID)
        if household is not None:
            household.rev = int(raw["rev"])
            saved = raw.get("savedAt")
            if isinstance(saved, str):
                household.saved_at = saved
            session.flush()
    return True


def import_accounts_json(session: Session, settings: Settings) -> bool:
    path = settings.json_accounts_file
    if not path.is_file():
        return False
    if session.scalar(select(Account).limit(1)) is not None:
        return False
    raw = _load_json(path)
    rows = raw.get("accounts") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        return False
    imported = 0
    for item in rows:
        if not isinstance(item, dict):
            continue
        account_id = item.get("id")
        username = item.get("username")
        password_hash = item.get("passwordHash")
        salt = item.get("salt")
        role = item.get("role")
        if not isinstance(account_id, str) or not isinstance(username, str):
            continue
        if not isinstance(password_hash, str) or not isinstance(salt, str):
            continue
        if role not in ("admin", "tenant"):
            continue
        person_id = item.get("personId")
        session.add(
            Account(
                id=account_id,
                username=normalise_username(username),
                person_id=person_id if isinstance(person_id, str) and person_id else None,
                password_hash=password_hash,
                salt=salt,
                role=role,
                enabled=item.get("enabled") is not False,
                token_version=int(item["tokenVersion"])
                if isinstance(item.get("tokenVersion"), (int, float))
                else 1,
                password_set_at=item.get("passwordSetAt")
                if isinstance(item.get("passwordSetAt"), str)
                else None,
            )
        )
        imported += 1
    session.flush()
    return imported > 0


def import_legacy_json(session: Session, settings: Settings) -> None:
    import_accounts_json(session, settings)
    import_household_json(session, settings)


def seed_admin_if_needed(session: Session, settings: Settings) -> None:
    from app.accounts import ensure_seeded

    ensure_seeded(session, settings)
