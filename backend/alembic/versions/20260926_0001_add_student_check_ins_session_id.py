"""Add student_check_ins.session_id — scope QR check-ins to their session.

Revision ID: 20260926_0001
Revises: 20260921_0002
Create Date: 2026-09-26

Permissions/completeness audit (2026-09): the TEACHER "Badges" QR check-in
scanner (ClassSessionAttendance.tsx) has always posted and read a
`session_id` when recording/listing check-ins, but student_check_ins had
no such column — Pydantic silently dropped the field on write, and the
list query ignored it on read. Every check-in was recorded generically,
and the "present" count shown for a live session actually included every
check-in ever made for the tenant, not just the current session's.

No FK constraint to check_in_sessions(id): that table is a raw-SQL
"operational table" created at application startup by
app.core.operational_tables.ensure_operational_tables(), not by an
Alembic migration — it may not exist yet when this migration runs in an
environment where migrations run before the app has ever started. The
relationship is enforced at the application layer (school_life.py) only,
same reasoning as other cross raw-SQL/ORM-table references in this
codebase (see docs/PERMISSIONS_MATRIX.md's audit notes on unconstrained
actor references).
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260926_0001"
down_revision = "20260921_0002"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.add_column("student_check_ins", sa.Column("session_id", sa.UUID(), nullable=True))
    op.create_index("ix_student_check_ins_session_id", "student_check_ins", ["session_id"])


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.drop_index("ix_student_check_ins_session_id", table_name="student_check_ins")
    op.drop_column("student_check_ins", "session_id")
