from __future__ import annotations

import json

from app.import_json import import_legacy_json
from app.models import Household
from tests.test_household import ENVELOPE


def test_import_legacy_json_files(db, settings) -> None:
    settings.json_data_file.write_text(
        json.dumps({"rev": 12, "savedAt": "2026-04-01T00:00:00.000Z", "payload": ENVELOPE}),
        encoding="utf-8",
    )
    import_legacy_json(db, settings)
    db.commit()
    household = db.get(Household, 1)
    assert household is not None
    assert household.rev == 12
