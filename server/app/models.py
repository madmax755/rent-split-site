from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.config import HOUSEHOLD_ID
from app.db import Base


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class Household(Base):
    __tablename__ = "household"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=HOUSEHOLD_ID)
    rev: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    saved_at: Mapped[str | None] = mapped_column(String, nullable=True)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="£")
    rent: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    rent_cycle_start_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    catchall: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    catchall_weight: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    current_month: Mapped[str] = mapped_column(String, nullable=False, default="")
    active_preset_name: Mapped[str | None] = mapped_column(String, nullable=True)
    sections_open: Mapped[dict[str, bool]] = mapped_column(JSON, nullable=False, default=dict)

    people: Mapped[list[Person]] = relationship(back_populates="household", cascade="all, delete-orphan")
    rooms: Mapped[list[Room]] = relationship(back_populates="household", cascade="all, delete-orphan")
    bills: Mapped[list[Bill]] = relationship(back_populates="household", cascade="all, delete-orphan")
    months: Mapped[list[Month]] = relationship(back_populates="household", cascade="all, delete-orphan")
    ledger: Mapped[list[LedgerEntry]] = relationship(back_populates="household", cascade="all, delete-orphan")
    presets: Mapped[list[Preset]] = relationship(back_populates="household", cascade="all, delete-orphan")


class Person(Base):
    __tablename__ = "person"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"),
        nullable=False,
        default=HOUSEHOLD_ID,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_payer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    household: Mapped[Household] = relationship(back_populates="people")


class Room(Base):
    __tablename__ = "room"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"),
        nullable=False,
        default=HOUSEHOLD_ID,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    width: Mapped[float] = mapped_column("w", Float, nullable=False, default=0)
    length: Mapped[float] = mapped_column("l", Float, nullable=False, default=0)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    communal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    household: Mapped[Household] = relationship(back_populates="rooms")


class Bill(Base):
    __tablename__ = "bill"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"),
        nullable=False,
        default=HOUSEHOLD_ID,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    est: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    cycle_start_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payers_restricted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    household: Mapped[Household] = relationship(back_populates="bills")
    payers: Mapped[list[BillPayer]] = relationship(back_populates="bill", cascade="all, delete-orphan")


class BillPayer(Base):
    __tablename__ = "bill_payer"

    bill_id: Mapped[str] = mapped_column(ForeignKey("bill.id", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[str] = mapped_column(String, primary_key=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    bill: Mapped[Bill] = relationship(back_populates="payers")


class Month(Base):
    __tablename__ = "month"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"),
        nullable=False,
        default=HOUSEHOLD_ID,
    )
    rent: Mapped[float | None] = mapped_column(Float, nullable=True)
    collected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    charged_is_null: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    charged_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    household: Mapped[Household] = relationship(back_populates="months")
    lines: Mapped[list[MonthLine]] = relationship(back_populates="month", cascade="all, delete-orphan")
    charges: Mapped[list[MonthCharge]] = relationship(back_populates="month", cascade="all, delete-orphan")
    one_offs: Mapped[list[OneOff]] = relationship(back_populates="month", cascade="all, delete-orphan")
    stints: Mapped[list[Stint]] = relationship(back_populates="month", cascade="all, delete-orphan")


class MonthLine(Base):
    __tablename__ = "month_line"

    month_key: Mapped[str] = mapped_column(ForeignKey("month.key", ondelete="CASCADE"), primary_key=True)
    bill_id: Mapped[str] = mapped_column(String, primary_key=True)
    est: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    act: Mapped[float | None] = mapped_column(Float, nullable=True)

    month: Mapped[Month] = relationship(back_populates="lines")


class MonthCharge(Base):
    __tablename__ = "month_charge"

    month_key: Mapped[str] = mapped_column(ForeignKey("month.key", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[str] = mapped_column(String, primary_key=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)

    month: Mapped[Month] = relationship(back_populates="charges")


class OneOff(Base):
    __tablename__ = "one_off"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    month_key: Mapped[str] = mapped_column(ForeignKey("month.key", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    est: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    act: Mapped[float | None] = mapped_column(Float, nullable=True)
    payers_restricted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    month: Mapped[Month] = relationship(back_populates="one_offs")
    payers: Mapped[list[OneOffPayer]] = relationship(back_populates="one_off", cascade="all, delete-orphan")


class OneOffPayer(Base):
    __tablename__ = "one_off_payer"

    one_off_id: Mapped[str] = mapped_column(ForeignKey("one_off.id", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[str] = mapped_column(String, primary_key=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    one_off: Mapped[OneOff] = relationship(back_populates="payers")


class Stint(Base):
    __tablename__ = "stint"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    month_key: Mapped[str] = mapped_column(ForeignKey("month.key", ondelete="CASCADE"), nullable=False)
    person_id: Mapped[str] = mapped_column(String, nullable=False)
    room_id: Mapped[str] = mapped_column(String, nullable=False)
    from_day: Mapped[int] = mapped_column(Integer, nullable=False)
    to_day: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    month: Mapped[Month] = relationship(back_populates="stints")


class LedgerEntry(Base):
    __tablename__ = "ledger_entry"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"),
        nullable=False,
        default=HOUSEHOLD_ID,
    )
    person_id: Mapped[str] = mapped_column(String, nullable=False)
    month_key: Mapped[str] = mapped_column(String, nullable=False, default="")
    type: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    household: Mapped[Household] = relationship(back_populates="ledger")


class Preset(Base):
    __tablename__ = "preset"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"),
        nullable=False,
        default=HOUSEHOLD_ID,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    household: Mapped[Household] = relationship(back_populates="presets")


class Account(Base):
    __tablename__ = "account"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    person_id: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    salt: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    password_set_at: Mapped[str | None] = mapped_column(String, nullable=True)
