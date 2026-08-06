"""Add public_form_submissions.source_ip_hash — RGPD Phase 5.

A non-reversible, tenant-scoped hash of the submitter's IP (see _hash_ip
in app/api/v1/endpoints/core/public_pages.py), kept only for abuse
investigation. Never the raw IP. Nullable/optional so existing rows are
unaffected.

Revision ID: 20260807_0001
Revises: 20260806_0001
Create Date: 2026-08-07

Non-destructive: purely additive, no existing data touched.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "20260807_0001"
down_revision = "20260806_0001"
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
    if not _column_exists(conn, "public_form_submissions", "source_ip_hash"):
        op.add_column(
            "public_form_submissions",
            sa.Column("source_ip_hash", sa.String(length=32), nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    if _column_exists(conn, "public_form_submissions", "source_ip_hash"):
        op.drop_column("public_form_submissions", "source_ip_hash")
