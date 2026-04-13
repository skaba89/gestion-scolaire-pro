"""add severity and user_agent columns to audit_logs

Revision ID: 20260411_add_audit_columns
Revises: 20260406_super_admin_platform
Create Date: 2025-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = "20260411_add_audit_columns"
down_revision = "20260406_super_admin_platform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add severity column if not exists
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'severity'
            ) THEN
                ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(20) DEFAULT 'INFO';
            END IF;
        END $$
    """)

    # Add index on severity
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_audit_logs_severity
        ON audit_logs(severity)
    """)

    # Add user_agent column if not exists
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'user_agent'
            ) THEN
                ALTER TABLE audit_logs ADD COLUMN user_agent TEXT;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_severity", table_name="audit_logs")
    op.drop_column("audit_logs", "user_agent")
    op.drop_column("audit_logs", "severity")
