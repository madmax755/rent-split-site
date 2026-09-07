"""add rent and bill cycle start days

Revision ID: 0002_cycle_start_days
Revises: 0001_initial
Create Date: 2026-09-07

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_cycle_start_days"
down_revision: Union[str, Sequence[str], None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _sqlite_columns(table: str) -> set[str]:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).all()
    return {str(row[1]) for row in rows}


def upgrade() -> None:
    if "rent_cycle_start_day" not in _sqlite_columns("household"):
        op.add_column(
            "household",
            sa.Column("rent_cycle_start_day", sa.Integer(), nullable=False, server_default="1"),
        )
    if "cycle_start_day" not in _sqlite_columns("bill"):
        op.add_column(
            "bill",
            sa.Column("cycle_start_day", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    op.drop_column("bill", "cycle_start_day")
    op.drop_column("household", "rent_cycle_start_day")
