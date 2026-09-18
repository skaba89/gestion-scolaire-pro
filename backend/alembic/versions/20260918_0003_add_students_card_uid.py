"""Add students.card_uid — NFC/RFID student badge.

Revision ID: 20260918_0003
Revises: 20260918_0002
Create Date: 2026-09-18

Feature: a student can be issued a physical NFC/RFID card. Its UID is
stored on students.card_uid and matched by the classroom badge-in kiosk
(operational/kiosk.py::kiosk_scan, alongside registration_number/id) and
by the library circulation desk to check for overdue loans before letting
a student borrow again. The UID is a hardware-manufactured identifier —
globally unique, not just per-tenant — hence the global UNIQUE constraint
rather than a per-tenant one.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260918_0003"
down_revision = "20260918_0002"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.add_column("students", sa.Column("card_uid", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_students_card_uid", "students", ["card_uid"])
    op.create_index("ix_students_card_uid", "students", ["card_uid"])


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.drop_index("ix_students_card_uid", table_name="students")
    op.drop_constraint("uq_students_card_uid", "students", type_="unique")
    op.drop_column("students", "card_uid")
