"""Add tenant-owned education cycles and optional level attachment.

Revision ID: 20261114_0003
Revises: 20261114_0002
"""
import sqlalchemy as sa
from alembic import op

revision = "20261114_0003"
down_revision = "20261114_0002"
branch_labels = None
depends_on = None
backward_compatible = True


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    inspector = sa.inspect(bind)
    if not inspector.has_table("education_cycles"):
        op.create_table(
            "education_cycles",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("institution_type", sa.String(50), nullable=False),
            sa.Column("period_type", sa.String(30), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("tenant_id", "code", name="uq_education_cycles_tenant_code"),
            sa.UniqueConstraint("tenant_id", "id", name="uq_education_cycles_tenant_id_id"),
            sa.CheckConstraint("revision >= 1", name="ck_education_cycles_revision"),
        )
        op.create_index("ix_education_cycles_tenant_id", "education_cycles", ["tenant_id"])
    inspector = sa.inspect(bind)
    cycle_indexes = {index["name"] for index in inspector.get_indexes("education_cycles")}
    if "ix_education_cycles_tenant_id" not in cycle_indexes:
        op.create_index("ix_education_cycles_tenant_id", "education_cycles", ["tenant_id"])
    level_columns = {column["name"] for column in inspector.get_columns("levels")}
    if "cycle_id" not in level_columns:
        op.add_column("levels", sa.Column("cycle_id", sa.Uuid(), nullable=True))
    inspector = sa.inspect(bind)
    level_indexes = {index["name"] for index in inspector.get_indexes("levels")}
    if "ix_levels_cycle_id" not in level_indexes:
        op.create_index("ix_levels_cycle_id", "levels", ["cycle_id"])
    level_foreign_keys = {foreign_key.get("name") for foreign_key in inspector.get_foreign_keys("levels")}
    if "fk_levels_tenant_cycle" not in level_foreign_keys:
        op.create_foreign_key(
            "fk_levels_tenant_cycle", "levels", "education_cycles",
            ["tenant_id", "cycle_id"], ["tenant_id", "id"],
        )
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE education_cycles ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE education_cycles FORCE ROW LEVEL SECURITY")
        op.execute("DROP POLICY IF EXISTS education_cycles_tenant_isolation ON education_cycles")
        predicate = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
        op.execute(f"CREATE POLICY education_cycles_tenant_isolation ON education_cycles USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    # Cycle assignments and definitions are historical configuration. Older
    # code ignores these additive objects; destructive removal needs a
    # separately approved export/retention operation.
    pass
