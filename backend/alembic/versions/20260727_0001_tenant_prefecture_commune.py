"""Add prefecture/commune columns to tenants — national audit Phase 5
(institutional model, préfecture/commune roadmap).

Revision ID: 20260727_0001
Revises: 20260724_0003
Create Date: 2026-07-27

Second deliberate step of the institutional layer above tenants
(Pays/Région/Préfecture/Commune/Académie...), following the exact same
pattern already used for `region`: free text (not an enum/FK — each
country's administrative subdivisions differ), nullable, additive.
Enables PREFECTURE_ADMIN/COMMUNE_ADMIN narrowing in ministry.py, mirroring
REGIONAL_DIRECTOR's existing region-narrowing.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "20260727_0001"
down_revision = "20260724_0003"
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
    if not _column_exists(conn, "tenants", "prefecture"):
        op.add_column("tenants", sa.Column("prefecture", sa.String(length=100), nullable=True))
        op.create_index("ix_tenants_prefecture", "tenants", ["prefecture"])
    if not _column_exists(conn, "tenants", "commune"):
        op.add_column("tenants", sa.Column("commune", sa.String(length=100), nullable=True))
        op.create_index("ix_tenants_commune", "tenants", ["commune"])


def downgrade():
    conn = op.get_bind()
    if _column_exists(conn, "tenants", "commune"):
        op.drop_index("ix_tenants_commune", table_name="tenants")
        op.drop_column("tenants", "commune")
    if _column_exists(conn, "tenants", "prefecture"):
        op.drop_index("ix_tenants_prefecture", table_name="tenants")
        op.drop_column("tenants", "prefecture")
