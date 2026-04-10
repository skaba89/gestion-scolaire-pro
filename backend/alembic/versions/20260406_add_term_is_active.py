"""Add 'is_active' column to terms table.

The Term model defines is_active = Column(Boolean, default=False) but no
migration ever created this column. This migration adds it with a server
default of false so existing rows are handled correctly.

Revision ID: 20260406_add_term_is_active
Revises: 20260406_add_academic_columns
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20260406_add_term_is_active'
down_revision = '20260406_add_academic_columns'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('terms',
                  sa.Column('is_active', sa.Boolean(), server_default='false', nullable=True))


def downgrade() -> None:
    op.drop_column('terms', 'is_active')
