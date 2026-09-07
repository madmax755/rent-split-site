"""initial sqlite schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-07

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "household",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rev", sa.Integer(), nullable=False),
        sa.Column("saved_at", sa.String(), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False),
        sa.Column("rent", sa.Float(), nullable=False),
        sa.Column("catchall", sa.Float(), nullable=False),
        sa.Column("catchall_weight", sa.Float(), nullable=False),
        sa.Column("current_month", sa.String(), nullable=False),
        sa.Column("active_preset_name", sa.String(), nullable=True),
        sa.Column("sections_open", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "account",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("salt", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("password_set_at", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "person",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_payer", sa.Boolean(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "room",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("w", sa.Float(), nullable=False),
        sa.Column("l", sa.Float(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("communal", sa.Boolean(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "bill",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("est", sa.Float(), nullable=False),
        sa.Column("payers_restricted", sa.Boolean(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "bill_payer",
        sa.Column("bill_id", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["bill_id"], ["bill.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("bill_id", "person_id"),
    )
    op.create_table(
        "month",
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("rent", sa.Float(), nullable=True),
        sa.Column("collected", sa.Boolean(), nullable=False),
        sa.Column("charged_is_null", sa.Boolean(), nullable=False),
        sa.Column("charged_at", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "month_line",
        sa.Column("month_key", sa.String(), nullable=False),
        sa.Column("bill_id", sa.String(), nullable=False),
        sa.Column("est", sa.Float(), nullable=False),
        sa.Column("act", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["month_key"], ["month.key"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("month_key", "bill_id"),
    )
    op.create_table(
        "month_charge",
        sa.Column("month_key", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["month_key"], ["month.key"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("month_key", "person_id"),
    )
    op.create_table(
        "one_off",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("month_key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("est", sa.Float(), nullable=False),
        sa.Column("act", sa.Float(), nullable=True),
        sa.Column("payers_restricted", sa.Boolean(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["month_key"], ["month.key"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "one_off_payer",
        sa.Column("one_off_id", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["one_off_id"], ["one_off.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("one_off_id", "person_id"),
    )
    op.create_table(
        "stint",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("month_key", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=False),
        sa.Column("from_day", sa.Integer(), nullable=False),
        sa.Column("to_day", sa.Integer(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["month_key"], ["month.key"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "ledger_entry",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("month_key", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "preset",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("preset")
    op.drop_table("ledger_entry")
    op.drop_table("stint")
    op.drop_table("one_off_payer")
    op.drop_table("one_off")
    op.drop_table("month_charge")
    op.drop_table("month_line")
    op.drop_table("month")
    op.drop_table("bill_payer")
    op.drop_table("bill")
    op.drop_table("room")
    op.drop_table("person")
    op.drop_table("account")
    op.drop_table("household")
