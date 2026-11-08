"""Tenant-isolated early warnings, manually authored and auditable.

Revision ID: 20261108_0001
Revises: 20261026_0001
"""
import sqlalchemy as sa
from alembic import op

revision = "20261108_0001"
down_revision = "20261026_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "early_warnings",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("student_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("alert_type", sa.String(32), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("recommended_actions", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("acknowledged_by", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'dismissed')", name="ck_early_warnings_status"),
        sa.CheckConstraint("severity IN ('low', 'medium', 'high', 'critical')", name="ck_early_warnings_severity"),
        sa.CheckConstraint("alert_type IN ('academic', 'attendance', 'behavior', 'engagement', 'wellbeing')", name="ck_early_warnings_type"),
    )
    op.create_index("ix_early_warnings_tenant_status_created", "early_warnings", ["tenant_id", "status", "created_at"])
    op.create_index("ix_early_warnings_tenant_student", "early_warnings", ["tenant_id", "student_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE early_warnings ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE early_warnings FORCE ROW LEVEL SECURITY")
        op.execute("""
            CREATE POLICY early_warnings_tenant_isolation ON early_warnings
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
        """)


def downgrade():
    op.drop_index("ix_early_warnings_tenant_student", table_name="early_warnings")
    op.drop_index("ix_early_warnings_tenant_status_created", table_name="early_warnings")
    op.drop_table("early_warnings")
