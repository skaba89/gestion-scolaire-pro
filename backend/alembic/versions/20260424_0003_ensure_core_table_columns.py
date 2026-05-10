"""Extract _ensure_all_table_columns DDL from main.py into a proper migration.

Revision ID: 20260424_0003
Revises: 20260424_0002
Create Date: 2026-04-24
"""
from alembic import op
from sqlalchemy import text

revision = "20260424_0003"
down_revision = "20260424_0002"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)",
    ]

    for stmt in statements:
        try:
            conn.execute(text(stmt))
        except Exception as exc:
            print(f"[20260424_0003] warning: {stmt} -> {exc}")
            conn.rollback()


def downgrade():
    pass
