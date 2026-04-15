"""Add must_change_password column to users table

The /users/me/ endpoint now returns must_change_password alongside mfa_enabled.
The mfa_enabled column was added in a prior migration; this migration adds the
missing must_change_password BOOLEAN column to the users table.

Revision ID: 20260411_add_user_must_change_password
Revises: 20260411_add_audit_columns
Create Date: 2025-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = "20260411_add_user_must_change_password"
down_revision = "20260411_add_audit_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guard: only proceed if the users table exists
    conn = op.get_bind()
    if not conn.dialect.has_table(conn, "users"):
        return

    # Add must_change_password column (idempotent)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'must_change_password'
            ) THEN
                ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
            END IF;
        END $$
    """)


def downgrade() -> None:
    # Guard: only proceed if the users table exists
    conn = op.get_bind()
    if not conn.dialect.has_table(conn, "users"):
        return

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS must_change_password")
