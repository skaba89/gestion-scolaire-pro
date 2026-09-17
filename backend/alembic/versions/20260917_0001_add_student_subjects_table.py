"""Add missing student_subjects table (individual course registration).

Revision ID: 20260917_0001
Revises: 20260915_0001
Create Date: 2026-09-17

Discovered while extending the university/LMD "base structure" (faculties
via Department, courses-with-credits via Subject.ects) — POST
/student-subjects/ (app/api/v1/endpoints/aliases.py, assigns a student to
one or more courses) has existed for a while and inserts directly into
`student_subjects`, but that table was never actually created anywhere:
no ORM model, no Table() object, no migration, not in
app/core/operational_tables.py either. Every call to that endpoint
against real PostgreSQL has always failed with
"relation student_subjects does not exist" — this endpoint has
apparently never been exercised against Postgres before (no prior test
covered it), same class of previously-undiscovered gap as the
job_applications unique-constraint fix in 20260915_0001.

Now backed by a real Table() (app/models/associations.py), matching its
sibling association tables (subject_departments, class_subjects, etc.) —
tests pick it up automatically via Base.metadata.create_all(); this
migration is the Postgres-only equivalent for real deployments.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260917_0001"
down_revision = "20260915_0001"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.create_table(
        "student_subjects",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("student_id", "subject_id"),
    )
    op.create_index(
        op.f("ix_student_subjects_tenant_id"), "student_subjects", ["tenant_id"], unique=False
    )
    # RLS: every table with a tenant_id column must be scoped (CI's
    # PostgreSQL readiness check enforces this generically) — same
    # ENABLE+FORCE+policy pattern as its sibling association tables (see
    # 20260805_0003_subject_preferred_rooms.py).
    op.execute("ALTER TABLE student_subjects ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE student_subjects FORCE ROW LEVEL SECURITY")
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_student_subjects ON student_subjects;
        CREATE POLICY tenant_isolation_student_subjects ON student_subjects
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.current_tenant_id', true) IS NULL
        )
    """)


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.execute("DROP POLICY IF EXISTS tenant_isolation_student_subjects ON student_subjects")
    op.drop_index(op.f("ix_student_subjects_tenant_id"), table_name="student_subjects")
    op.drop_table("student_subjects")
