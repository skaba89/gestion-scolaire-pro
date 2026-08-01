"""Add notification_events table — WhatsApp Cloud API industrialization.

Revision ID: 20260801_0001
Revises: 20260728_0002
Create Date: 2026-08-01

Dispatch log for outbound WhatsApp/Push/SMS/Email sends. Distinct from the
existing `notifications` table (in-app activity feed) — this one tracks
provider-level delivery so incoming webhook status updates (Meta sends
sent/delivered/read/failed per message id) can be matched and applied
idempotently, and so support can see why a given notification never
reached a parent. provider_message_id is unique so a webhook replay or a
duplicate enqueue can never be recorded twice.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260801_0001"
down_revision = "20260728_0002"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return conn.execute(text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.tables"
        "  WHERE table_schema = 'public' AND table_name = :t"
        ")"
    ), {"t": table_name}).scalar()


def upgrade():
    conn = op.get_bind()
    if _table_exists(conn, "notification_events"):
        return

    op.create_table(
        "notification_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("recipient_phone", sa.String(length=30), nullable=True),
        sa.Column("recipient_email", sa.String(length=255), nullable=True),
        sa.Column("template_name", sa.String(length=100), nullable=True),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("error_reason", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("failed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_notification_events_tenant_id", "notification_events", ["tenant_id"])
    op.create_index("ix_notification_events_user_id", "notification_events", ["user_id"])
    op.create_index("ix_notification_events_student_id", "notification_events", ["student_id"])
    op.create_index("ix_notification_events_parent_id", "notification_events", ["parent_id"])
    op.create_index("ix_notification_events_event_type", "notification_events", ["event_type"])
    op.create_index("ix_notification_events_channel", "notification_events", ["channel"])
    op.create_index("ix_notification_events_status", "notification_events", ["status"])
    op.create_index(
        "ux_notification_events_provider_message_id",
        "notification_events",
        ["provider_message_id"],
        unique=True,
        postgresql_where=sa.text("provider_message_id IS NOT NULL"),
    )
    op.create_index("ix_notification_events_tenant_created", "notification_events", ["tenant_id", "created_at"])

    # RLS, consistent with every other tenant-scoped table in this project.
    op.execute("ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE notification_events FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_notification_events ON notification_events;
        CREATE POLICY tenant_isolation_notification_events ON notification_events
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "notification_events"):
        op.drop_table("notification_events")
