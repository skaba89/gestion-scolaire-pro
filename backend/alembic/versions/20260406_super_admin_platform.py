"""Make users.tenant_id nullable for SUPER_ADMIN platform-level users.

A SUPER_ADMIN user should NOT be tied to a specific tenant.
They operate at the platform level and can manage all tenants.

Revision ID: 20260406_super_admin_platform
Revises: 20260406_payment_enums
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20260406_super_admin_platform'
down_revision = '20260406_payment_enums'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Make users.tenant_id nullable (SUPER_ADMIN has no tenant)
    op.alter_column('users', 'tenant_id',
                    existing_type=sa.UUID(),
                    nullable=True)

    # 2. Make user_roles.tenant_id nullable (SUPER_ADMIN role is not tenant-scoped)
    op.alter_column('user_roles', 'tenant_id',
                    existing_type=sa.UUID(),
                    nullable=True)

    # 3. Drop the NOT NULL constraint on profiles.tenant_id too
    op.alter_column('profiles', 'tenant_id',
                    existing_type=sa.UUID(),
                    nullable=True)


def downgrade() -> None:
    # Before downgrading, ensure no NULL tenant_id values exist
    op.execute("UPDATE users SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL")
    op.execute("UPDATE user_roles SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL")
    op.execute("UPDATE profiles SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL")

    op.alter_column('users', 'tenant_id',
                    existing_type=sa.UUID(),
                    nullable=False)
    op.alter_column('user_roles', 'tenant_id',
                    existing_type=sa.UUID(),
                    nullable=False)
    op.alter_column('profiles', 'tenant_id',
                    existing_type=sa.UUID(),
                    nullable=False)
