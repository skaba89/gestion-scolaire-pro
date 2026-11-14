"""Add versioned education module policies; retain all legacy school data.

Revision ID: 20261114_0002
Revises: 20261114_0001
"""
import sqlalchemy as sa
from alembic import op

revision = "20261114_0002"
down_revision = "20261114_0001"
branch_labels = None
depends_on = None
backward_compatible = True


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    inspector = sa.inspect(op.get_bind())
    if not any(c["name"] == "education_modules_configured" for c in inspector.get_columns("tenants")):
        op.add_column("tenants", sa.Column("education_modules_configured", sa.Boolean(), nullable=False, server_default=sa.false()))
    if not inspector.has_table("education_configurations"):
        op.create_table(
            "education_configurations",
            sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("profile_id", sa.String(50), nullable=False),
            sa.Column("overrides", sa.JSON(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("revision >= 1", name="ck_education_config_revision"),
        )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE education_configurations ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE education_configurations FORCE ROW LEVEL SECURITY")
        op.execute("DROP POLICY IF EXISTS education_configurations_tenant_isolation ON education_configurations")
        predicate = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
        op.execute(f"CREATE POLICY education_configurations_tenant_isolation ON education_configurations USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    # Policy data must survive a code rollback, just like notes and payments.
    # Older code ignores these additive objects; removal needs a separate,
    # approved retention/export procedure rather than silently dropping them.
    pass
