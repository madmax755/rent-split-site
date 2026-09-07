from __future__ import annotations

from sqlalchemy import inspect, text

from app.bootstrap import run_migrations
from app.db import configure_engine, get_engine
from app.models import Base


def test_alembic_upgrade_matches_models(settings) -> None:
    run_migrations(settings)
    configure_engine(settings)
    engine = get_engine()
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    expected = set(Base.metadata.tables) | {"alembic_version"}
    assert tables == expected


def test_cycle_start_days_upgrade_skips_existing_columns(settings) -> None:
    run_migrations(settings)
    configure_engine(settings)
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num = '0001_initial'"))
    run_migrations(settings)
    inspector = inspect(engine)
    household_cols = {col["name"] for col in inspector.get_columns("household")}
    bill_cols = {col["name"] for col in inspector.get_columns("bill")}
    assert "rent_cycle_start_day" in household_cols
    assert "cycle_start_day" in bill_cols
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == "0002_cycle_start_days"
