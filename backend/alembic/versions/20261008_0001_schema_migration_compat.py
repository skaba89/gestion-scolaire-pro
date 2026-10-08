"""Create `schema_migration_compat` (P2 — no 503 window during migrations).

Revision ID: 20261008_0001
Revises: 20261007_0002
Create Date: 2026-10-08

One row per applied migration: its down_revision and whether it is
backward compatible (the code of its down_revision keeps working against
it). Rows are written/removed by the `on_version_apply` hook in
alembic/env.py, from each migration's module-level `backward_compatible`.
The running API reads the table only when the database is ahead of its own
Alembic head — see app/core/schema_compat.py.

Platform metadata, no tenant_id, nothing sensitive (revision ids only):
no RLS. SELECT is granted to PUBLIC so every runtime role can read it
whatever its default privileges.

From this revision on, every migration MUST declare `backward_compatible`
(enforced by tests/test_schema_compat.py).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261008_0001"
down_revision = "20261007_0002"
branch_labels = None
depends_on = None

# Adding a table nothing in 20261007_0002's code references.
backward_compatible = True

TABLE = "schema_migration_compat"


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("revision", sa.String(64), primary_key=True),
            sa.Column("down_revision", sa.String(255), nullable=True),
            sa.Column("backward_compatible", sa.Boolean(), nullable=False),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    if bind.dialect.name == "postgresql":
        op.execute(f"GRANT SELECT ON {TABLE} TO PUBLIC")


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table(TABLE):
        op.drop_table(TABLE)
