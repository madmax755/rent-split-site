from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.bootstrap import run_migrations
from app.config import Settings, reset_settings
from app.db import configure_engine, get_session_factory, reset_engine


@pytest.fixture
def data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    directory = tmp_path / "data"
    directory.mkdir()
    monkeypatch.setenv("DATA_DIR", str(directory))
    monkeypatch.setenv("PUBLIC_DIR", str(tmp_path / "public"))
    monkeypatch.setenv("RENT_SPLIT_ADMIN_USER", "asoni")
    monkeypatch.setenv("RENT_SPLIT_ADMIN_PASSWORD", "secret")
    monkeypatch.setenv("RENT_SPLIT_SECRET", "test-secret-value")
    monkeypatch.setenv("SECURE_COOKIE", "0")
    reset_settings()
    reset_engine()
    yield directory
    reset_engine()
    reset_settings()


@pytest.fixture
def settings(data_dir: Path) -> Settings:
    reset_settings()
    from app.config import get_settings

    return get_settings()


@pytest.fixture
def db(settings: Settings) -> Generator[Session, None, None]:
    configure_engine(settings)
    run_migrations(settings)
    factory = get_session_factory()
    with factory() as session:
        yield session
        session.rollback()
