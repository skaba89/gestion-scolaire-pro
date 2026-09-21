"""Add semester progression gate: subjects.semester_id, semesters.credits_required_to_advance.

Revision ID: 20260921_0002
Revises: 20260921_0001
Create Date: 2026-09-21

Follow-up to 20260921_0001 (faculties/semesters/subject_prerequisites):
links a UE (Subject) to the Semester it belongs to, and lets a semester
declare an ECTS threshold a student must clear before enrolling in the
NEXT semester's subjects (see app/services/progression.py). Both columns
are nullable — a subject with no semester_id, or a semester with no
credits_required_to_advance, never gates anything, so existing tenants
(school-type or university-type alike) are unaffected until an admin
opts in.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260921_0002"
down_revision = "20260921_0001"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return

    op.add_column("subjects", sa.Column("semester_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_subjects_semester_id", "subjects", "semesters", ["semester_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(op.f("ix_subjects_semester_id"), "subjects", ["semester_id"], unique=False)

    op.add_column("semesters", sa.Column("credits_required_to_advance", sa.Float(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return

    op.drop_column("semesters", "credits_required_to_advance")

    op.drop_index(op.f("ix_subjects_semester_id"), table_name="subjects")
    op.drop_constraint("fk_subjects_semester_id", "subjects", type_="foreignkey")
    op.drop_column("subjects", "semester_id")
