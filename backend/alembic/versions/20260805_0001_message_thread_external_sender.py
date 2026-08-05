"""Add external_sender_hash/external_sender_masked to message_threads —
distinguishes unknown WhatsApp senders (fine points brief, Phase 1).

Before this migration, every inbound message from a phone number we
couldn't match to a User was funneled into the SAME thread (the query
matched on `parent_id IS NULL` alone), silently merging unrelated
strangers' conversations. `external_sender_hash` gives each unknown phone
number its own stable identity (so repeat messages from the same unknown
number reuse one thread) without ever storing the phone number itself —
only a salted hash and a masked display value.

Non-destructive: purely additive, no existing column or table touched.

Revision ID: 20260805_0001
Revises: 20260804_0002
Create Date: 2026-08-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "20260805_0001"
down_revision = "20260804_0002"
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

    if not _column_exists(conn, "message_threads", "external_sender_hash"):
        op.add_column(
            "message_threads",
            sa.Column("external_sender_hash", sa.String(length=64), nullable=True),
        )
    if not _column_exists(conn, "message_threads", "external_sender_masked"):
        op.add_column(
            "message_threads",
            sa.Column("external_sender_masked", sa.String(length=32), nullable=True),
        )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_message_threads_external_sender_hash "
        "ON message_threads (external_sender_hash)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_message_threads_external_sender_hash")
    op.drop_column("message_threads", "external_sender_masked")
    op.drop_column("message_threads", "external_sender_hash")
