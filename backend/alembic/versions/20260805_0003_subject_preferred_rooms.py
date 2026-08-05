"""Add subject_preferred_rooms table — lets a subject declare preferred
rooms for scheduling (SubjectPreferredRoomsManager UI, previously 404ing).

Revision ID: 20260805_0003
Revises: 20260805_0002
Create Date: 2026-08-05

Non-destructive: purely additive, no existing table touched.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260805_0003"
down_revision = "20260805_0002"
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

    if not _table_exists(conn, "subject_preferred_rooms"):
        op.create_table(
            "subject_preferred_rooms",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("room_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.UniqueConstraint("subject_id", "room_id", name="uq_subject_preferred_room"),
        )
        op.create_index("ix_subject_preferred_rooms_tenant_id", "subject_preferred_rooms", ["tenant_id"])
        op.create_index("ix_subject_preferred_rooms_subject_id", "subject_preferred_rooms", ["subject_id"])
        _enable_rls("subject_preferred_rooms")


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "subject_preferred_rooms"):
        op.drop_table("subject_preferred_rooms")
