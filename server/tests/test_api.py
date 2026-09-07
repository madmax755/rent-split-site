from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_household import ENVELOPE


def test_health_and_login(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        body = health.json()
        assert body["app"] == "rent-split"
        assert body["authed"] is False
        bad = client.post("/api/login", json={"username": "asoni", "password": "nope"})
        assert bad.status_code == 401
        ok = client.post("/api/login", json={"username": "asoni", "password": "secret"})
        assert ok.status_code == 200
        assert ok.json()["session"]["role"] == "admin"
        me = client.get("/api/me")
        assert me.status_code == 200
        assert me.json()["username"] == "asoni"


def test_put_and_get_data(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.post("/api/login", json={"username": "asoni", "password": "secret"})
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


def test_tenant_sees_own_ledger(settings) -> None:
    from app.main import app

    with TestClient(app) as client:
        client.post("/api/login", json={"username": "asoni", "password": "secret"})
        client.put("/api/data", json={"rev": 0, "payload": ENVELOPE})
        created = client.post(
            "/api/accounts",
            json={"username": "joe", "password": "abcd", "personId": "p2", "role": "tenant"},
        )
        assert created.status_code == 200
        client.post("/api/logout")
        login = client.post("/api/login", json={"username": "joe", "password": "abcd"})
        assert login.status_code == 200
        assert login.json()["session"]["role"] == "tenant"
        forbidden = client.get("/api/data")
        assert forbidden.status_code == 403
        mine = client.get("/api/mine")
        assert mine.status_code == 200
        data = mine.json()["payload"]["data"]
        assert data["presets"] == []
        assert {row["id"] for row in data["ledger"]} == {"lg1", "lg2"}
        for row in data["ledger"]:
            assert row["personId"] == "p2"
