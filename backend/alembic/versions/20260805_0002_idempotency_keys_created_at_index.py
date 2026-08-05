"""Add index on idempotency_keys.created_at (fine points brief, Phase 3).

The unique (tenant_id, user_id, key) index and the expires_at index
already exist (see 20260804_0002_idempotency_keys.py) — this migration
only adds the missing created_at index, used by the purge job's ordering
and by any future "recent activity" admin view. Purely additive.

Revision ID: 20260805_0002
Revises: 20260805_0001
Create Date: 2026-08-05
"""
from alembic import op

revision = "20260805_0002"
down_revision = "20260805_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_idempotency_keys_created_at "
        "ON idempotency_keys (created_at)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_idempotency_keys_created_at")
