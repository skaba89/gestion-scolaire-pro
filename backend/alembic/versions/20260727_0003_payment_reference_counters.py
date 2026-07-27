"""Add payment_reference_counters table — sequential receipt numbering.

Revision ID: 20260727_0003
Revises: 20260727_0002
Create Date: 2026-07-27

docs/PAYMENTS_READINESS.md flagged this as "à clarifier avec le premier
client avant de considérer que c'est un vrai blocage" — building it now
on a reasonable, documented assumption (per-tenant, per-year sequential
counter, format REC-{year}-{seq}) since it's additive and low-risk: the
old random-hex format (PAY-{hex}) keeps working unchanged for any caller
that supplies its own `reference`, and every payment ever created keeps
its existing reference untouched. Only the *default* reference generated
when none is supplied changes format.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260727_0003"
down_revision = "20260727_0002"
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
    if _table_exists(conn, "payment_reference_counters"):
        return

    op.create_table(
        "payment_reference_counters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_unique_constraint(
        "uq_payment_reference_counters_tenant_year",
        "payment_reference_counters", ["tenant_id", "year"],
    )
    op.create_index("ix_payment_reference_counters_tenant_id", "payment_reference_counters", ["tenant_id"])

    op.execute("ALTER TABLE payment_reference_counters ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE payment_reference_counters FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_payment_reference_counters ON payment_reference_counters;
        CREATE POLICY tenant_isolation_payment_reference_counters ON payment_reference_counters
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "payment_reference_counters"):
        op.drop_table("payment_reference_counters")
