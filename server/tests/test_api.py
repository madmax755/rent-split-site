from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_household import ENVELOPE


def test_health_lists_people(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        empty = client.get("/api/health")
        assert empty.status_code == 200
        body = empty.json()
        assert body["app"] == "rent-split"
        assert body["people"] == []
        written = client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        assert written.status_code == 200
        health = client.get("/api/health")
        assert health.status_code == 200
        names = [row["name"] for row in health.json()["people"]]
        assert names == ["Ach", "Joe"]


def test_put_and_get_data(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        empty = client.get("/api/data")
        assert empty.status_code == 200
        assert empty.json()["rev"] == 0
        written = client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        assert written.status_code == 200
        assert written.json()["rev"] == 1
        stale = client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        assert stale.status_code == 409
        got = client.get("/api/data")
        assert got.status_code == 200
        assert got.json()["payload"]["data"] == ENVELOPE["data"]
        settle = client.post(
            "/api/settle",
            json={"personId": "p2", "amount": 150, "date": "2026-04-03", "note": "cash", "rev": 1},
        )
        assert settle.status_code == 200
        entry_id = settle.json()["entry"]["id"]
        undone = client.delete(f"/api/ledger/{entry_id}")
        assert undone.status_code == 200


def test_can_edit_own_stints(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        written = client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        assert written.status_code == 200
        updated = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-03",
                "personId": "p2",
                "stints": [
                    {"id": "st2", "personId": "p2", "roomId": "bed1", "from": 1, "to": 5},
                    {"id": "st-joe-late", "personId": "p2", "roomId": "bed1", "from": 20, "to": 31},
                ],
            },
        )
        assert updated.status_code == 200
        data = client.get("/api/data").json()["payload"]["data"]
        march = data["months"]["2026-03"]["stints"]
        by_person: dict[str, list[dict[str, object]]] = {}
        for row in march:
            by_person.setdefault(row["personId"], []).append(row)
        assert {row["id"] for row in by_person["p1"]} == {"st1"}
        assert by_person["p1"][0]["from"] == 1
        assert by_person["p1"][0]["to"] == 31
        joe_days = {(row["from"], row["to"]) for row in by_person["p2"]}
        assert joe_days == {(1, 5), (20, 31)}


def test_cannot_edit_someone_elses_stints(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        stolen = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-03",
                "personId": "p2",
                "stints": [{"id": "st1", "personId": "p1", "roomId": "bed1", "from": 1, "to": 2}],
            },
        )
        assert stolen.status_code == 403


def test_empty_stints_means_out(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        cleared = client.put(
            "/api/stints",
            json={"rev": 1, "monthKey": "2026-03", "personId": "p2", "stints": []},
        )
        assert cleared.status_code == 200
        data = client.get("/api/data").json()["payload"]["data"]
        march = data["months"]["2026-03"]["stints"]
        assert all(row["personId"] != "p2" for row in march)
        assert any(row["personId"] == "p1" for row in march)


def test_new_month_copies_other_people(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        created = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-05",
                "personId": "p2",
                "stints": [
                    {"id": "st-joe-may", "personId": "p2", "roomId": "bed1", "from": 3, "to": 10}
                ],
            },
        )
        assert created.status_code == 200
        data = client.get("/api/data").json()["payload"]["data"]
        may = data["months"]["2026-05"]["stints"]
        by_person = {row["personId"]: row for row in may}
        assert by_person["p2"]["from"] == 3
        assert by_person["p2"]["to"] == 10
        assert by_person["p1"]["from"] == 1
        assert by_person["p1"]["to"] == 31
        assert by_person["p1"]["id"] != "st3"


def test_can_edit_own_stints_when_linked(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        written = client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        assert written.status_code == 200
        updated = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-04",
                "personId": "p1",
                "stints": [{"id": "st3", "personId": "p1", "roomId": "bed1", "from": 8, "to": 20}],
            },
        )
        assert updated.status_code == 200
        data = client.get("/api/data").json()["payload"]["data"]
        april = data["months"]["2026-04"]["stints"]
        assert april == [{"id": "st3", "personId": "p1", "roomId": "bed1", "from": 8, "to": 20}]


def test_unknown_person_cannot_use_own_stints(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        refused = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-04",
                "personId": "p-missing",
                "stints": [{"id": "st3", "personId": "p-missing", "roomId": "bed1", "from": 1, "to": 2}],
            },
        )
        assert refused.status_code == 400


def test_own_stints_reject_bad_days_and_communal_room(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        bad_days = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-03",
                "personId": "p2",
                "stints": [{"id": "st2", "personId": "p2", "roomId": "bed1", "from": 1, "to": 40}],
            },
        )
        assert bad_days.status_code == 400
        communal = client.put(
            "/api/stints",
            json={
                "rev": 1,
                "monthKey": "2026-03",
                "personId": "p2",
                "stints": [{"id": "st2", "personId": "p2", "roomId": "lounge", "from": 1, "to": 10}],
            },
        )
        assert communal.status_code == 400
