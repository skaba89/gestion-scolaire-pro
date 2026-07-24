"""Create jobs table for async job status tracking (Arq).

Revision ID: 20260724_0002
Revises: 20260724_0001
Create Date: 2026-07-24

National audit Phase 5 (workers et traitements asynchrones): status
visibility for jobs run via the Arq/Redis queue (app/core/jobs.py,
app/workers/tasks.py). tenant_id is nullable — some future job types are
platform-level rather than tied to a single tenant.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "20260724_0002"
down_revision = "20260724_0001"
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
    if _table_exists(conn, "jobs"):
        return

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("job_type", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_jobs_tenant_id", "jobs", ["tenant_id"])
    op.create_index("ix_jobs_job_type", "jobs", ["job_type"])
    op.create_index("ix_jobs_status", "jobs", ["status"])
    # Composite for a future "recent jobs of this type for this tenant"
    # dashboard query — same rationale as 20260724_0001.
    op.create_index("ix_jobs_tenant_created", "jobs", ["tenant_id", "created_at"])

    # RLS: matches the pattern used for every other tenant-scoped table
    # (enforced dynamically by the enforce_rls_* migrations), but jobs can
    # be tenant_id IS NULL for platform-level work — the policy must allow
    # those rows through regardless of the current tenant context, not
    # hide them, since they aren't any tenant's data to isolate.
    op.execute("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE jobs FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_jobs ON jobs;
        CREATE POLICY tenant_isolation_jobs ON jobs
        USING (
            tenant_id IS NULL
            OR tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "jobs"):
        op.drop_table("jobs")
