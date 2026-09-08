"""add household tenancy start date

Revision ID: 0003_tenancy_start
Revises: 0002_cycle_start_days
Create Date: 2026-09-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_tenancy_start"
down_revision: Union[str, Sequence[str], None] = "0002_cycle_start_days"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _sqlite_columns(table: str) -> set[str]:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).all()
    return {str(row[1]) for row in rows}


def upgrade() -> None:
    if "tenancy_start" not in _sqlite_columns("household"):
        op.add_column(
            "household",
            sa.Column("tenancy_start", sa.String(), nullable=False, server_default="2026-08-09"),
        )


def downgrade() -> None:
    op.drop_column("household", "tenancy_start")
