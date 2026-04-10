"""Drop legacy keycloak_id column from users table

Revision ID: 20260406_drop_keycloak_id
Revises: 20260325_0845_9b2c54f5d1aa
Create Date: 2026-04-06 00:00:00.000000

"""
from alembic import op

# revision identifiers
revision = '20260406_drop_keycloak_id'
down_revision = '9b2c54f5d1aa'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the index if it exists, then the column
    op.drop_index('ix_users_keycloak_id', table_name='users', if_exists=True)
    op.drop_column('users', 'keycloak_id', if_exists=True)


def downgrade() -> None:
    # Re-add the column as nullable for rollback
    op.add_column('users', op.Column('keycloak_id', op.String(255), nullable=True))
    op.create_index('ix_users_keycloak_id', 'users', ['keycloak_id'], unique=True)
