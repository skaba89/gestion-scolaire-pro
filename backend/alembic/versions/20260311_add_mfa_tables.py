"""add_mfa_tables

Revision ID: add_mfa_tables_001
Revises: 00c064158d74
Create Date: 2026-03-11 23:25:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_mfa_tables_001'
down_revision = '00c064158d74'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add mfa_enabled to users
    op.add_column('users', sa.Column('mfa_enabled', sa.Boolean(), server_default='false', nullable=False))

    # 2. Create mfa_backup_codes table
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
    op.create_index(op.f('ix_mfa_backup_codes_user_id'), 'mfa_backup_codes', ['user_id'], unique=False)

    # 3. Create email_otps table
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
    op.create_index(op.f('ix_email_otps_user_id'), 'email_otps', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_email_otps_user_id'), table_name='email_otps')
    op.drop_table('email_otps')
    op.drop_index(op.f('ix_mfa_backup_codes_user_id'), table_name='mfa_backup_codes')
    op.drop_table('mfa_backup_codes')
    op.drop_column('users', 'mfa_enabled')
