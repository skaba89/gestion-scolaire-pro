"""Add payment_webhook_events table — commercialisation Priorité 3 follow-up.

Revision ID: 20260727_0002
Revises: 20260727_0001
Create Date: 2026-07-27

CinetPay/PayTech webhook handlers only ever called logger.warning() on a
failure — nothing was queryable. The tenant support health endpoint
(GET /platform/tenants/{id}/health/) had to return an honest "not
available" for last_failed_payment_webhook. This table closes that gap
with the minimum needed: one row per webhook call received, its outcome,
and a short reason — never the raw payload (which may contain payer
phone numbers / card-adjacent fields depending on the gateway).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260727_0002"
down_revision = "20260727_0001"
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
    if _table_exists(conn, "payment_webhook_events"):
        return

    op.create_table(
        "payment_webhook_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Nullable: some outcomes (no transaction_id, payment not found) are
        # rejected before the tenant can even be resolved from the payload.
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("gateway", sa.String(length=20), nullable=False),
        sa.Column("transaction_id", sa.String(length=255), nullable=True),
        sa.Column("outcome", sa.String(length=30), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_payment_webhook_events_tenant_id", "payment_webhook_events", ["tenant_id"])
    op.create_index("ix_payment_webhook_events_transaction_id", "payment_webhook_events", ["transaction_id"])
    op.create_index("ix_payment_webhook_events_outcome", "payment_webhook_events", ["outcome"])
    op.create_index("ix_payment_webhook_events_tenant_created", "payment_webhook_events", ["tenant_id", "created_at"])

    # RLS, consistent with every other tenant-scoped table in this project
    # (same pattern as 20260724_0002_jobs_table.py). tenant_id IS NULL rows
    # (pre-resolution failures) are visible regardless of tenant context —
    # acceptable since they carry no tenant-specific data at all.
    op.execute("ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE payment_webhook_events FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_payment_webhook_events ON payment_webhook_events;
        CREATE POLICY tenant_isolation_payment_webhook_events ON payment_webhook_events
        USING (
            tenant_id IS NULL
            OR tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "payment_webhook_events"):
        op.drop_table("payment_webhook_events")
