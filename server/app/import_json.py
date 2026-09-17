from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.config import HOUSEHOLD_ID, Settings
from app.household import parse_envelope, put_household
from app.models import Household


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


def import_legacy_json(session: Session, settings: Settings) -> None:
    import_household_json(session, settings)
