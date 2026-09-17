from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
SERVER_DIR = APP_DIR.parent
REPO_ROOT = SERVER_DIR.parent

MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_BACKUPS = 200
HOUSEHOLD_ID = 1


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    port: int = Field(default=8080, validation_alias="PORT")
    data_dir: Path = Field(default=REPO_ROOT / "data", validation_alias="DATA_DIR")
    public_dir: Path = Field(
        default=REPO_ROOT / "frontend" / "dist",
        validation_alias="PUBLIC_DIR",
    )

    @property
    def database_path(self) -> Path:
        return self.data_dir / "rent-split.db"

    @property
    def database_url(self) -> str:
        return "sqlite:///" + self.database_path.resolve().as_posix()

    @property
    def backup_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def json_data_file(self) -> Path:
        return self.data_dir / "rent-split.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir = Path(settings.data_dir).resolve()
    settings.public_dir = Path(settings.public_dir).resolve()
    return settings


def reset_settings() -> None:
    get_settings.cache_clear()
