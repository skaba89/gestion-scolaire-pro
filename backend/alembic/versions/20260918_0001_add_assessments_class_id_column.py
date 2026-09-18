"""Add missing assessments.class_id column.

Revision ID: 20260918_0001
Revises: 20260917_0001
Create Date: 2026-09-18

Discovered during the institutional-readiness audit (2026-09):
academic/assessments.py's AssessmentCreate/AssessmentUpdate schemas and
create_assessment/update_assessment endpoints reference `class_id`, and
it was even conditionally added to update_assessment's dynamic UPDATE
statement — but the column never existed on the Assessment ORM model or
the migrated `assessments` table at all. Any request supplying class_id
(the "attach this assessment to a specific classroom" use case) raised
UndefinedColumn against real Postgres — same class of previously-
undiscovered "never worked" gap as the student_subjects table fix in
20260917_0001.

Now backed by a real column on the ORM model (app/models/assessment.py) —
SQLite test runs pick it up automatically via Base.metadata.create_all();
this migration is the Postgres-only equivalent for real deployments.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260918_0001"
down_revision = "20260917_0001"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.add_column("assessments", sa.Column("class_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "assessments_class_id_fkey", "assessments", "classes",
        ["class_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.drop_constraint("assessments_class_id_fkey", "assessments", type_="foreignkey")
    op.drop_column("assessments", "class_id")
