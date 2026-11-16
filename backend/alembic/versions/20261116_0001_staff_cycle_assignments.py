"""Add opt-in staff restrictions to pedagogical cycles.

Revision ID: 20261116_0001
Revises: 20261115_0002

Additive only: no existing row is read or changed, so every existing account
keeps its current access (no row = no cycle restriction).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261116_0001"
down_revision = "20261115_0002"
branch_labels = None
depends_on = None
backward_compatible = True

TABLE = "staff_cycle_assignments"


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("cycle_id", sa.Uuid(), nullable=False),
            sa.Column("assigned_by", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("tenant_id", "user_id", "cycle_id", name="uq_staff_cycle_assignments_user_cycle"),
            sa.ForeignKeyConstraint(
                ["tenant_id", "cycle_id"], ["education_cycles.tenant_id", "education_cycles.id"],
                name="fk_staff_cycle_assignments_tenant_cycle",
            ),
        )
    inspector = sa.inspect(bind)
    existing = {index["name"] for index in inspector.get_indexes(TABLE)}
    for column in ("tenant_id", "user_id", "cycle_id"):
        name = f"ix_{TABLE}_{column}"
        if name not in existing:
            op.create_index(name, TABLE, [column])
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {TABLE}_tenant_isolation ON {TABLE}")
        predicate = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
        op.execute(f"CREATE POLICY {TABLE}_tenant_isolation ON {TABLE} USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    # Restrictions are security configuration chosen by an administrator.
    # Older code ignores this additive table; dropping it would silently
    # widen access if the code were re-deployed, so removal needs a
    # separately approved operation.
    pass
