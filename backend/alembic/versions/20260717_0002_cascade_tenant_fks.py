"""Cascade tenant deletion to profiles, admission_applications and schedule.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-17

Deleting a tenant relies on ON DELETE CASCADE to remove child rows. Three
tenant-scoped tables still had their FK to ``tenants`` created with the
default NO ACTION, so any establishment that had ever created a user profile,
a timetable entry or an admission application could not be deleted: the
delete failed with a foreign-key violation and the API returned 500.

This migration recreates those three foreign keys with ON DELETE CASCADE.
``billing_events`` keeps its intentional ON DELETE SET NULL (the billing
journal is meant to survive tenant removal).
"""
from __future__ import annotations

from alembic import op


revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None

# (table, constraint name, fk column)
_FKS = [
    ("profiles", "profiles_tenant_id_fkey", "tenant_id"),
    ("admission_applications", "admission_applications_tenant_id_fkey", "tenant_id"),
    ("schedule", "schedule_tenant_id_fkey", "tenant_id"),
]


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        # SQLite (tests/dev) does not enforce these FKs the same way.
        return
    for table, constraint, column in _FKS:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(
            constraint,
            table,
            "tenants",
            [column],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    for table, constraint, column in _FKS:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(
            constraint,
            table,
            "tenants",
            [column],
            ["id"],
        )
