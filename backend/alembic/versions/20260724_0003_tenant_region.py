"""Add region column to tenants — national audit Phase 2 (institutional model).

Revision ID: 20260724_0003
Revises: 20260724_0002
Create Date: 2026-07-24

First, deliberately minimal step of the institutional layer above tenants
(Pays/Région/Préfecture/Commune/Académie...): a free-text region on the
tenant itself, enough for a future ministry dashboard to group
establishments geographically. Not an enum or a separate `regions` table —
per the audit's own rule against a one-shot RBAC/model overhaul, the full
hierarchy is deferred until there's a real ministry-module consumer for it.
Nullable and additive: every existing tenant keeps working unchanged.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "20260724_0003"
down_revision = "20260724_0002"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return conn.execute(text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.columns"
        "  WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ")"
    ), {"t": table_name, "c": column_name}).scalar()


def upgrade():
    conn = op.get_bind()
    if not _column_exists(conn, "tenants", "region"):
        op.add_column("tenants", sa.Column("region", sa.String(length=100), nullable=True))
        op.create_index("ix_tenants_region", "tenants", ["region"])


def downgrade():
    conn = op.get_bind()
    if _column_exists(conn, "tenants", "region"):
        op.drop_index("ix_tenants_region", table_name="tenants")
        op.drop_column("tenants", "region")
