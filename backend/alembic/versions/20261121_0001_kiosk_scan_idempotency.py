"""Add stable event identity to classroom kiosk scans.

Revision ID: 20261121_0001
Revises: 20261116_0001
Create Date: 2026-11-21

Additive only. Existing pointages keep both columns null. The unique
constraint is scoped by tenant and device so two establishments or two
tablets may safely generate the same client UUID without colliding.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261121_0001"
down_revision = "20261116_0001"
branch_labels = None
depends_on = None

# Deployment applies migrations before the new API image. Both columns are
# nullable and the constraint ignores historical NULL values, so the code at
# down_revision keeps working while the database is one revision ahead.
backward_compatible = True


def upgrade():
    op.add_column(
        "student_check_ins",
        sa.Column("kiosk_device_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "student_check_ins",
        sa.Column("client_event_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_student_check_ins_kiosk_device_id",
        "student_check_ins",
        "kiosk_devices",
        ["kiosk_device_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_student_check_ins_kiosk_device_id",
        "student_check_ins",
        ["kiosk_device_id"],
    )
    op.create_unique_constraint(
        "ux_student_check_ins_kiosk_event",
        "student_check_ins",
        ["tenant_id", "kiosk_device_id", "client_event_id"],
    )


def downgrade():
    op.drop_constraint(
        "ux_student_check_ins_kiosk_event", "student_check_ins", type_="unique"
    )
    op.drop_index(
        "ix_student_check_ins_kiosk_device_id", table_name="student_check_ins"
    )
    op.drop_constraint(
        "fk_student_check_ins_kiosk_device_id", "student_check_ins", type_="foreignkey"
    )
    op.drop_column("student_check_ins", "client_event_id")
    op.drop_column("student_check_ins", "kiosk_device_id")
