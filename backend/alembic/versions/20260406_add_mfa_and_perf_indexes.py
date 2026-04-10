"""Merge MFA + performance indexes into main chain (after native_auth + drop_keycloak_id)

This migration consolidates two orphan branches back into a single linear chain:
  - Branch A: enforce_RLS → native_auth → drop_keycloak_id (our main chain)
  - Branch B: enforce_RLS → perf_indexes → final_sync → add_mfa_tables (orphan)

This migration applies the operations from both Branch B files:
  - 20240301_add_performance_indexes
  - 20260310_2240_00c064158d74_final_sync
  - 20260311_add_mfa_tables

Revision ID: 20260406_merge_mfa_perf
Revises: 20260406_drop_keycloak_id
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20260406_merge_mfa_perf'
down_revision = '20260406_drop_keycloak_id'
branch_labels = None
depends_on = None


def _create_index_if_not_exists(index_name, table_name, columns, unique=False):
    """Create an index only if it does not already exist (idempotent)."""
    op.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({', '.join(columns)})")


def upgrade() -> None:
    # ─── 1. Performance indexes (from add_perf_indexes) ────────────────────
    # All use IF NOT EXISTS to be safe against duplicates from earlier migrations
    _create_index_if_not_exists('ix_students_tenant_id', 'students', ['tenant_id'])
    _create_index_if_not_exists('ix_grades_student_id', 'grades', ['student_id'])
    _create_index_if_not_exists('ix_grades_subject_id', 'grades', ['subject_id'])
    _create_index_if_not_exists('ix_attendance_student_id', 'attendance', ['student_id'])
    _create_index_if_not_exists('ix_attendance_date', 'attendance', ['date'])
    _create_index_if_not_exists('ix_payments_student_id', 'payments', ['student_id'])
    _create_index_if_not_exists('ix_payments_status', 'payments', ['status'])
    _create_index_if_not_exists('ix_users_email', 'users', ['email'])
    _create_index_if_not_exists('ix_audit_logs_tenant_id', 'audit_logs', ['tenant_id'])
    _create_index_if_not_exists('ix_notifications_user_id', 'notifications', ['user_id'])
    _create_index_if_not_exists('ix_notifications_tenant_id', 'notifications', ['tenant_id'])
    _create_index_if_not_exists('ix_user_roles_user_id', 'user_roles', ['user_id'])
    _create_index_if_not_exists('ix_user_roles_tenant_id', 'user_roles', ['tenant_id'])

    # ─── 2. Final sync adjustments (from final_sync) ───────────────────────
    # Ensure all FK constraints have ON DELETE CASCADE where appropriate
    # (these are idempotent — safe to run even if already present)
    op.execute("""
        DO $$
        BEGIN
            -- Ensure tenants FK cascades on key tables
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_students_tenant_cascade'
            ) THEN
                ALTER TABLE students ADD CONSTRAINT fk_students_tenant_cascade
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
            END IF;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ─── 3. MFA tables (from add_mfa_tables) ──────────────────────────────
    # Add mfa_enabled column (idempotent)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'mfa_enabled'
            ) THEN
                ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false;
            END IF;
        END $$;
    """)

    op.create_table('mfa_backup_codes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('used', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    _create_index_if_not_exists('ix_mfa_backup_codes_user_id', 'mfa_backup_codes', ['user_id'])

    op.create_table('email_otps',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('is_valid', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    _create_index_if_not_exists('ix_email_otps_user_id', 'email_otps', ['user_id'])


def _drop_index_if_exists(index_name, table_name):
    """Drop an index only if it exists (idempotent)."""
    op.execute(f"DROP INDEX IF EXISTS {index_name}")


def downgrade() -> None:
    # Reverse: 3 → 2 → 1
    _drop_index_if_exists('ix_email_otps_user_id', 'email_otps')
    op.drop_table('email_otps')
    _drop_index_if_exists('ix_mfa_backup_codes_user_id', 'mfa_backup_codes')
    op.drop_table('mfa_backup_codes')
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS mfa_enabled")

    _drop_index_if_exists('ix_user_roles_tenant_id', 'user_roles')
    _drop_index_if_exists('ix_user_roles_user_id', 'user_roles')
    _drop_index_if_exists('ix_notifications_tenant_id', 'notifications')
    _drop_index_if_exists('ix_notifications_user_id', 'notifications')
    _drop_index_if_exists('ix_audit_logs_tenant_id', 'audit_logs')
    _drop_index_if_exists('ix_users_email', 'users')
    _drop_index_if_exists('ix_payments_status', 'payments')
    _drop_index_if_exists('ix_payments_student_id', 'payments')
    _drop_index_if_exists('ix_attendance_date', 'attendance')
    _drop_index_if_exists('ix_attendance_student_id', 'attendance')
    _drop_index_if_exists('ix_grades_subject_id', 'grades')
    _drop_index_if_exists('ix_grades_student_id', 'grades')
    _drop_index_if_exists('ix_students_tenant_id', 'students')
