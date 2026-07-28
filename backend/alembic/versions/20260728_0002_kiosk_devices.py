"""Add kiosk_devices table — QR kiosk mode (Phase 6 PWA backlog).

Revision ID: 20260728_0002
Revises: 20260728_0001
Create Date: 2026-07-28

A kiosk is a shared, unattended device that checks students in/out via
QR scan without a staff JWT session on it. Auth is a per-device bearer
token (X-Kiosk-Token header), issued by a TENANT_ADMIN/DIRECTOR and
revocable at any time; only its SHA-256 hash is stored. The plaintext
token is shown once at creation and never again.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260728_0002"
down_revision = "20260728_0001"
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
    if _table_exists(conn, "kiosk_devices"):
        return

    op.create_table(
        "kiosk_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        # No FK to users.id — informational lineage only, same rationale as
        # AuditLog.user_id (tests use fake JWT user ids with no backing row;
        # in production this also survives the user later being deleted).
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_kiosk_devices_tenant_id", "kiosk_devices", ["tenant_id"])
    op.create_index("ix_kiosk_devices_token_hash", "kiosk_devices", ["token_hash"], unique=True)

    op.execute("ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE kiosk_devices FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_kiosk_devices ON kiosk_devices;
        CREATE POLICY tenant_isolation_kiosk_devices ON kiosk_devices
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "kiosk_devices"):
        op.drop_table("kiosk_devices")
