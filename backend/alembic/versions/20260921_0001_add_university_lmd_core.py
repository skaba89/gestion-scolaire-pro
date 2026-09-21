"""Add university/LMD core structure: faculties, semesters, course prerequisites.

Revision ID: 20260921_0001
Revises: 20260918_0003
Create Date: 2026-09-21

Institutional-readiness audit (2026-09) found the "module université"
(faculties/UE/semesters) was never actually built as distinct entities —
Department stood in for Faculty, Subject already carried ECTS/coefficient/
hours but had no prerequisite relation, and the generic Term served both
"trimestre" and "semestre" with no separate progression logic. This
migration adds the three missing pieces as real tables (not a relabeling
of existing ones), matching each one's own model in app/models/:
- faculties (app/models/faculty.py) — sits above Department; departments
  gets a nullable faculty_id so existing school-type tenants are
  unaffected.
- semesters (app/models/semester.py) — a distinct table from terms, so a
  future semester-specific progression rule (credit-gated advancement)
  can evolve without touching the school trimestre model or its callers.
- subject_prerequisites (app/models/associations.py) — self-referential
  M2M on subjects, enforced (blocking, 422) at enrollment time by
  app/api/v1/endpoints/aliases.py::assign_subjects_to_student.

Same skip-on-SQLite / ENABLE+FORCE RLS pattern as every other tenant-scoped
table added this way (see 20260917_0001_add_student_subjects_table.py,
20260728_0002_kiosk_devices.py).
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260921_0001"
down_revision = "20260918_0003"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


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


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return

    # 1. Faculties
    op.create_table(
        "faculties",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("dean_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["dean_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_faculties_tenant_id"), "faculties", ["tenant_id"], unique=False)
    _enable_rls("faculties")

    # 2. departments.faculty_id (nullable — existing school-type tenants unaffected)
    op.add_column("departments", sa.Column("faculty_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_departments_faculty_id", "departments", "faculties", ["faculty_id"], ["id"], ondelete="SET NULL",
    )

    # 3. Semesters
    op.create_table(
        "semesters",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("academic_year_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_semesters_tenant_id"), "semesters", ["tenant_id"], unique=False)
    _enable_rls("semesters")

    # 4. Subject prerequisites (self-referential M2M on subjects)
    op.create_table(
        "subject_prerequisites",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=False),
        sa.Column("prerequisite_subject_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prerequisite_subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("subject_id", "prerequisite_subject_id"),
        sa.UniqueConstraint("subject_id", "prerequisite_subject_id", name="uix_subject_prerequisite"),
        sa.CheckConstraint("subject_id != prerequisite_subject_id", name="ck_subject_prerequisite_not_self"),
    )
    op.create_index(
        op.f("ix_subject_prerequisites_tenant_id"), "subject_prerequisites", ["tenant_id"], unique=False
    )
    _enable_rls("subject_prerequisites")


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.execute("DROP POLICY IF EXISTS tenant_isolation_subject_prerequisites ON subject_prerequisites")
    op.drop_index(op.f("ix_subject_prerequisites_tenant_id"), table_name="subject_prerequisites")
    op.drop_table("subject_prerequisites")

    op.execute("DROP POLICY IF EXISTS tenant_isolation_semesters ON semesters")
    op.drop_index(op.f("ix_semesters_tenant_id"), table_name="semesters")
    op.drop_table("semesters")

    op.drop_constraint("fk_departments_faculty_id", "departments", type_="foreignkey")
    op.drop_column("departments", "faculty_id")

    op.execute("DROP POLICY IF EXISTS tenant_isolation_faculties ON faculties")
    op.drop_index(op.f("ix_faculties_tenant_id"), table_name="faculties")
    op.drop_table("faculties")
