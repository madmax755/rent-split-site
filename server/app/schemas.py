from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class RoomModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    w: float = 0
    l: float = 0
    weight: float = 1
    communal: bool = False


class PersonModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    isPayer: bool = False
    archived: bool = False


class BillModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    est: float = 0
    payers: list[str] | None = None
    cycleStartDay: int = Field(default=1, ge=1, le=31)


class MonthLineModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    est: float = 0
    act: float | None = None


class OneOffModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    est: float = 0
    act: float | None = None
    payers: list[str] | None = None


class StintModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str
    personId: str
    roomId: str
    from_day: int = Field(alias="from")
    to: int


class MonthRecordModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str = ""
    rent: float | None = None
    lines: dict[str, MonthLineModel] = Field(default_factory=dict)
    oneOffs: list[OneOffModel] = Field(default_factory=list)
    stints: list[StintModel] = Field(default_factory=list)
    collected: bool = False
    charged: dict[str, float] | None = None
    chargedAt: str = ""
    note: str = ""
    config: dict[str, Any] | None = None


class LedgerEntryModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    personId: str
    monthKey: str = ""
    type: str
    amount: int
    date: str
    note: str = ""


class PresetModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    snapshot: dict[str, Any]


class HouseholdData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    currency: str = "£"
    rent: float = 0
    rentCycleStartDay: int = Field(default=1, ge=1, le=31)
    catchall: float = 0
    catchallWeight: float = 0
    rooms: list[RoomModel] = Field(default_factory=list)
    people: list[PersonModel] = Field(default_factory=list)
    bills: list[BillModel] = Field(default_factory=list)
    months: dict[str, MonthRecordModel] = Field(default_factory=dict)
    ledger: list[LedgerEntryModel] = Field(default_factory=list)
    presets: list[PresetModel] = Field(default_factory=list)
    activePresetName: str | None = None
    currentMonth: str = ""
    sectionsOpen: dict[str, bool] = Field(default_factory=dict)


class DataEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    app: Literal["rent-split"]
    schema_version: int = Field(validation_alias="schema", serialization_alias="schema")
    savedAt: str | None = None
    data: HouseholdData


class StoredDocument(BaseModel):
    rev: int
    savedAt: str | None
    payload: dict[str, Any] | None


class PutDataRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    payload: dict[str, Any]
    rev: int | None = None
    force: bool = False


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    username: str = ""
    password: str = ""


class CreateAccountRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    username: str
    password: str
    personId: str | None = None
    role: Literal["admin", "tenant"] = "tenant"


class PatchAccountRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    username: str | None = None
    password: str | None = None
    personId: str | None = None
    role: Literal["admin", "tenant"] | None = None
    enabled: bool | None = None


class SettleRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    personId: str = ""
    amount: float | None = None
    date: str | None = None
    note: str = ""
    monthKey: str = ""
    rev: int | None = None
    force: bool = False


class PutStintsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    monthKey: str = ""
    stints: list[StintModel] = Field(default_factory=list)
    rev: int | None = None
    force: bool = False


class DisablePersonRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    personId: str = ""


class PublicAccount(BaseModel):
    id: str
    username: str
    personId: str | None
    role: Literal["admin", "tenant"]
    enabled: bool
    passwordSetAt: str | None


class SessionInfo(BaseModel):
    accountId: str
    username: str
    role: Literal["admin", "tenant"]
    personId: str | None
    personName: str | None
