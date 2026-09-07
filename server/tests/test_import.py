from __future__ import annotations

import json

from sqlalchemy import select

from app.auth import hash_password
from app.import_json import import_legacy_json
from app.models import Account, Household
from tests.test_household import ENVELOPE


def test_import_legacy_json_files(db, settings) -> None:
    salt, hashed = hash_password("imported")
    accounts = {
        "v": 1,
        "accounts": [
            {
                "id": "acct_imported",
                "username": "max",
                "personId": "p4",
                "passwordHash": hashed,
                "salt": salt,
                "role": "admin",
                "enabled": True,
                "tokenVersion": 3,
                "passwordSetAt": "2026-01-01T00:00:00.000Z",
            }
        ],
    }
    settings.json_accounts_file.write_text(json.dumps(accounts), encoding="utf-8")
    settings.json_data_file.write_text(
        json.dumps({"rev": 12, "savedAt": "2026-04-01T00:00:00.000Z", "payload": ENVELOPE}),
        encoding="utf-8",
    )
    import_legacy_json(db, settings)
    db.commit()
    account = db.scalar(select(Account).where(Account.username == "max"))
    assert account is not None
    assert account.id == "acct_imported"
    assert account.token_version == 3
    household = db.get(Household, 1)
    assert household is not None
    assert household.rev == 12
    from app.auth import password_matches

    assert password_matches("imported", account)
