"""Add notification_preferences table — Phase 6 PWA backlog follow-up.

Revision ID: 20260728_0001
Revises: 20260727_0003
Create Date: 2026-07-28

src/hooks/usePushNotifications.ts only ever persisted preference toggles
(grades/absences/messages/homework/events/payments) to localStorage —
they never synced across a user's devices and the server had no way to
know about them. This table is the source of truth going forward, one
row per user. Actually filtering server-sent notifications by these
preferences is a separate, larger change (many call sites create
Notification rows / push sends today) and is intentionally out of scope
here — this migration only lays the persistence foundation.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260728_0001"
down_revision = "20260727_0003"
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
    if _table_exists(conn, "notification_preferences"):
        return

    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("grades", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("absences", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("messages", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("homework", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("events", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("payments", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notification_preferences_user_id", "notification_preferences", ["user_id"], unique=True)
    op.create_index("ix_notification_preferences_tenant_id", "notification_preferences", ["tenant_id"])

    # RLS, consistent with every other tenant-scoped table in this project.
    # tenant_id can be NULL for SUPER_ADMIN users (no tenant) — those rows
    # stay visible regardless of tenant context, same rationale as
    # payment_webhook_events.
    op.execute("ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_notification_preferences ON notification_preferences;
        CREATE POLICY tenant_isolation_notification_preferences ON notification_preferences
        USING (
            tenant_id IS NULL
            OR tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "notification_preferences"):
        op.drop_table("notification_preferences")
