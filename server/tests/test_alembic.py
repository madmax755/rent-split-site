from __future__ import annotations

from sqlalchemy import inspect

from app.bootstrap import run_migrations
from app.db import get_engine
from app.models import Base


def test_alembic_upgrade_matches_models(settings) -> None:
    run_migrations(settings)
    from app.db import configure_engine

    configure_engine(settings)
    engine = get_engine()
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    expected = set(Base.metadata.tables) | {"alembic_version"}
    assert tables == expected
