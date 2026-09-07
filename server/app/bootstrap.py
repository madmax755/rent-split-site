from __future__ import annotations

from alembic import command
from alembic.config import Config

from app.config import SERVER_DIR, Settings
from app.db import configure_engine, get_session_factory


def run_migrations(settings: Settings) -> None:
    ini = SERVER_DIR / "alembic.ini"
    cfg = Config(str(ini))
    cfg.set_main_option("script_location", str(SERVER_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(cfg, "head")


def bootstrap(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.backup_dir.mkdir(parents=True, exist_ok=True)
    configure_engine(settings)
    run_migrations(settings)
    from app.accounts import ensure_seeded
    from app.import_json import import_legacy_json

    factory = get_session_factory()
    with factory() as session:
        import_legacy_json(session, settings)
        ensure_seeded(session, settings)
        session.commit()


def alembic_config_for(url: str) -> Config:
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg
