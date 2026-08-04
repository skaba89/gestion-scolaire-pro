"""Add message_threads / message_items tables — WhatsApp inbound message
persistence (Phase 3, WhatsApp/offline hardening brief).

Revision ID: 20260804_0001
Revises: 20260801_0001
Create Date: 2026-08-04

A real, readable conversation per parent/student, distinct from
notification_events (a dispatch log for one-off outbound sends like
payment reminders). Non-destructive: purely additive, no existing table
touched.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260804_0001"
down_revision = "20260801_0001"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return conn.execute(text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.tables"
        "  WHERE table_schema = 'public' AND table_name = :t"
        ")"
    ), {"t": table_name}).scalar()


def _enable_rls(table_name: str) -> None:
    op.execute(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        DROP POLICY IF EXISTS tenant_isolation_{table_name} ON {table_name};
        CREATE POLICY tenant_isolation_{table_name} ON {table_name}
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def upgrade():
    conn = op.get_bind()

    if not _table_exists(conn, "message_threads"):
        op.create_table(
            "message_threads",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True),
            sa.Column("subject", sa.String(length=255), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="OPEN"),
            sa.Column("source_channel", sa.String(length=20), nullable=False, server_default="whatsapp"),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_message_threads_tenant_id", "message_threads", ["tenant_id"])
        op.create_index("ix_message_threads_parent_id", "message_threads", ["parent_id"])
        op.create_index("ix_message_threads_student_id", "message_threads", ["student_id"])
        op.create_index("ix_message_threads_status", "message_threads", ["status"])
        op.create_index("ix_message_threads_tenant_updated", "message_threads", ["tenant_id", "updated_at"])
        _enable_rls("message_threads")

    if not _table_exists(conn, "message_items"):
        op.create_table(
            "message_items",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False),
            sa.Column("sender_type", sa.String(length=20), nullable=False),
            sa.Column("sender_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("direction", sa.String(length=10), nullable=False),
            sa.Column("channel", sa.String(length=20), nullable=False, server_default="whatsapp"),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("provider_message_id", sa.String(length=255), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="RECEIVED"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("read_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_message_items_tenant_id", "message_items", ["tenant_id"])
        op.create_index("ix_message_items_thread_id", "message_items", ["thread_id"])
        op.create_index("ix_message_items_status", "message_items", ["status"])
        op.create_index(
            "ux_message_items_provider_message_id",
            "message_items",
            ["provider_message_id"],
            unique=True,
            postgresql_where=sa.text("provider_message_id IS NOT NULL"),
        )
        op.create_index("ix_message_items_thread_created", "message_items", ["thread_id", "created_at"])
        _enable_rls("message_items")


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "message_items"):
        op.drop_table("message_items")
    if _table_exists(conn, "message_threads"):
        op.drop_table("message_threads")
