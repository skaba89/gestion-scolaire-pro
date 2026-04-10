"""Add 'code' column to academic_years table.

The AcademicYear model defines code = Column(String, nullable=False) but the
initial migration never created this column. This migration adds it and
backfills existing rows with a generated code.

Revision ID: 20260406_add_academic_year_code
Revises: 20260406_super_admin_platform
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20260406_add_academic_year_code'
down_revision = '20260406_super_admin_platform'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add code column with a temporary default so existing rows don't violate NOT NULL
    op.add_column('academic_years',
                  sa.Column('code', sa.String(), nullable=True))

    # Backfill existing rows: use the name as code (e.g. "2025-2026" → "2025-2026")
    op.execute("UPDATE academic_years SET code = name WHERE code IS NULL")

    # Now make it NOT NULL
    op.alter_column('academic_years', 'code',
                    existing_type=sa.String(),
                    nullable=False)


def downgrade() -> None:
    op.drop_column('academic_years', 'code')
