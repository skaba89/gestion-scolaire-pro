"""add native auth password hash

Revision ID: 9b2c54f5d1aa
Revises: 659b47b029bd
Create Date: 2026-03-25 08:45:00
"""
from alembic import op
import sqlalchemy as sa

revision = "9b2c54f5d1aa"
down_revision = "659b47b029bd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
