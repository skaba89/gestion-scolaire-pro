"""Add public_form_submissions table — storage for the "contact_form"
public page widget, which previously discarded every submission
client-side (see app/models/public_form_submission.py for the full
rationale).

Revision ID: 20260806_0001
Revises: 20260805_0003
Create Date: 2026-08-06

Non-destructive: purely additive, no existing table touched.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260806_0001"
down_revision = "20260805_0003"
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

    if not _table_exists(conn, "public_form_submissions"):
        op.create_table(
            "public_form_submissions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("page_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("public_pages.id", ondelete="SET NULL"), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("phone", sa.String(length=50), nullable=True),
            sa.Column("subject", sa.String(length=500), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_public_form_submissions_tenant_id", "public_form_submissions", ["tenant_id"])
        op.create_index("ix_public_form_submissions_page_id", "public_form_submissions", ["page_id"])
        op.create_index("ix_public_form_submissions_tenant_created", "public_form_submissions", ["tenant_id", "created_at"])
        _enable_rls("public_form_submissions")


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "public_form_submissions"):
        op.drop_table("public_form_submissions")
