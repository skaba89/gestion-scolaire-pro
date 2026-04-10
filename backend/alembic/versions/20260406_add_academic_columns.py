"""Add academic columns to subjects and levels tables.

The academic audit found these model changes that need a migration:
  - subjects: add ects (FLOAT), cm_hours (INT), td_hours (INT),
              tp_hours (INT), description (TEXT)
  - levels:   add label (VARCHAR(255))

All columns are nullable with sensible defaults for existing rows.

Revision ID: 20260406_add_academic_columns
Revises: 20260406_add_academic_year_code
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20260406_add_academic_columns'
down_revision = '20260406_add_academic_year_code'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── subjects table ─────────────────────────────────────────────────────
    op.add_column('subjects',
        sa.Column('ects', sa.Float(), nullable=True, server_default='0'))
    op.add_column('subjects',
        sa.Column('cm_hours', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('subjects',
        sa.Column('td_hours', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('subjects',
        sa.Column('tp_hours', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('subjects',
        sa.Column('description', sa.Text(), nullable=True))

    # ─── levels table ───────────────────────────────────────────────────────
    op.add_column('levels',
        sa.Column('label', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # ─── levels table ───────────────────────────────────────────────────────
    op.drop_column('levels', 'label')

    # ─── subjects table ─────────────────────────────────────────────────────
    op.drop_column('subjects', 'description')
    op.drop_column('subjects', 'tp_hours')
    op.drop_column('subjects', 'td_hours')
    op.drop_column('subjects', 'cm_hours')
    op.drop_column('subjects', 'ects')
