"""Add kiosk_devices.room_id — classroom door badge sensor.

Revision ID: 20260918_0002
Revises: 20260918_0001
Create Date: 2026-09-18

Feature: a kiosk device can now be bound to a specific room (a badge
sensor mounted at a classroom door) instead of only the school's main
entrance. A scan at a room-bound device is matched against that room's
current schedule slot and can auto-mark the scanning student PRESENT for
that course — see operational/kiosk.py::kiosk_scan and the new
GET /schedule/{slot_id}/roster/ endpoint teachers use to see who has
badged in for their course.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260918_0002"
down_revision = "20260918_0001"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.add_column("kiosk_devices", sa.Column("room_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "kiosk_devices_room_id_fkey", "kiosk_devices", "rooms",
        ["room_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    op.drop_constraint("kiosk_devices_room_id_fkey", "kiosk_devices", type_="foreignkey")
    op.drop_column("kiosk_devices", "room_id")
