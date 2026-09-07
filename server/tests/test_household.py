from __future__ import annotations

from typing import Any

from app.household import assemble_payload, load_household, put_household

ENVELOPE: dict[str, Any] = {
    "app": "rent-split",
    "schema": 5,
    "savedAt": "2026-04-01T12:00:00.000Z",
    "data": {
        "currency": "£",
        "rent": 3500,
        "rentCycleStartDay": 8,
        "catchall": 14.3,
        "catchallWeight": 0.5,
        "rooms": [
            {"id": "bed1", "name": "Master Bedroom", "w": 3.89, "l": 3.0, "weight": 1, "communal": False},
            {"id": "lounge", "name": "Lounge", "w": 4.78, "l": 4.26, "weight": 1, "communal": True},
        ],
        "people": [
            {"id": "p1", "name": "Ach", "isPayer": True, "archived": False},
            {"id": "p2", "name": "Joe", "isPayer": False, "archived": False},
        ],
        "bills": [
            {"id": "energy", "name": "Energy", "est": 195, "payers": None, "cycleStartDay": 1},
            {"id": "wifi", "name": "Wi-Fi", "est": 35, "payers": ["p1"], "cycleStartDay": 15},
        ],
        "months": {
            "2026-03": {
                "key": "2026-03",
                "rent": 3500,
                "lines": {
                    "energy": {"est": 195, "act": 210},
                    "wifi": {"est": 35, "act": None},
                },
                "oneOffs": [
                    {
                        "id": "oo1",
                        "name": "Skip",
                        "est": 40,
                        "act": 40,
                        "payers": ["p2"],
                    }
                ],
                "stints": [
                    {"id": "st1", "personId": "p1", "roomId": "bed1", "from": 1, "to": 31},
                    {"id": "st2", "personId": "p2", "roomId": "bed1", "from": 10, "to": 31},
                ],
                "collected": True,
                "charged": {"p1": 12000, "p2": 8000},
                "chargedAt": "2026-03-28",
                "note": "March closed",
                "config": {
                    "rent": 3500,
                    "catchall": 14.3,
                    "catchallWeight": 0.5,
                    "rooms": [
                        {
                            "id": "bed1",
                            "name": "Master Bedroom",
                            "w": 3.89,
                            "l": 3.0,
                            "weight": 1,
                            "communal": False,
                        }
                    ],
                    "bills": [{"id": "energy", "name": "Energy", "est": 195, "payers": None}],
                    "people": [{"id": "p1", "name": "Ach", "isPayer": True, "archived": False}],
                },
            },
            "2026-04": {
                "key": "2026-04",
                "rent": None,
                "lines": {"energy": {"est": 210, "act": None}},
                "oneOffs": [],
                "stints": [{"id": "st3", "personId": "p1", "roomId": "bed1", "from": 1, "to": 30}],
                "collected": False,
                "charged": None,
                "chargedAt": "",
                "note": "",
                "config": None,
            },
        },
        "ledger": [
            {
                "id": "lg1",
                "personId": "p2",
                "monthKey": "2026-03",
                "type": "charge",
                "amount": 8000,
                "date": "2026-03-28",
                "note": "March",
            },
            {
                "id": "lg2",
                "personId": "p2",
                "monthKey": "",
                "type": "settle",
                "amount": -4000,
                "date": "2026-04-02",
                "note": "partial",
            },
        ],
        "presets": [
            {
                "name": "Default",
                "snapshot": {
                    "currency": "£",
                    "rent": 3500,
                    "catchall": 14.3,
                    "catchallWeight": 0.5,
                    "rooms": [],
                    "people": [],
                    "bills": [],
                    "months": {},
                    "ledger": [],
                },
            }
        ],
        "activePresetName": "Default",
        "currentMonth": "2026-04",
        "sectionsOpen": {"people": True, "bills": False},
    },
}


def test_envelope_round_trip(db, settings) -> None:
    put_household(db, ENVELOPE, expected_rev=0, force=True, settings=settings)
    db.commit()
    household = load_household(db)
    assert household is not None
    payload = assemble_payload(household)
    assert payload["app"] == "rent-split"
    assert payload["schema"] == 5
    assert payload["data"] == ENVELOPE["data"]
    assert payload["data"]["rentCycleStartDay"] == 8
    assert payload["data"]["bills"][0]["cycleStartDay"] == 1
    assert payload["data"]["bills"][1]["cycleStartDay"] == 15


def test_conflict_on_stale_rev(db, settings) -> None:
    put_household(db, ENVELOPE, expected_rev=0, force=True, settings=settings)
    db.commit()
    from app.errors import ConflictError

    try:
        put_household(db, ENVELOPE, expected_rev=0, force=False, settings=settings)
        raise AssertionError("expected conflict")
    except ConflictError as err:
        assert err.rev == 1


def test_schema_4_cycle_days_default(db, settings) -> None:
    payload = {
        "app": "rent-split",
        "schema": 4,
        "savedAt": "2026-04-01T12:00:00.000Z",
        "data": {
            "currency": "£",
            "rent": 100,
            "catchall": 0,
            "catchallWeight": 0,
            "rooms": [],
            "people": [{"id": "p1", "name": "Ann", "isPayer": True, "archived": False}],
            "bills": [{"id": "energy", "name": "Energy", "est": 10, "payers": None}],
            "months": {},
            "ledger": [],
            "presets": [],
            "activePresetName": None,
            "currentMonth": "2026-04",
            "sectionsOpen": {},
        },
    }
    put_household(db, payload, expected_rev=0, force=True, settings=settings)
    db.commit()
    household = load_household(db)
    assert household is not None
    assembled = assemble_payload(household)
    assert assembled["data"]["rentCycleStartDay"] == 1
    assert assembled["data"]["bills"][0]["cycleStartDay"] == 1
