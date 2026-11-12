"""Tenant isolation for elearning_enrollments.

Revision ID: 20261112_0002
Revises: 20261112_0001

elearning_enrollments had no tenant_id and no RLS (reads only went through a
join on elearning_courses). No route writes it today — participation
statistics are now derived from elearning_lesson_progress — but the table is
kept for a future explicit enrolment, so it gets the same isolation as the
other e-learning tables. Production checked 2026-11-12 (read-only): 0 rows.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261112_0002"
down_revision = "20261112_0001"
branch_labels = None
depends_on = None
# Additive; no route of the previous release inserts into this table.
backward_compatible = True

_TABLE = "elearning_enrollments"
_POLICY_NAME = "elearning_enrollments_tenant_isolation"
_POLICY = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"


def _has_table() -> bool:
    return sa.inspect(op.get_bind()).has_table(_TABLE)


def _has_tenant_column() -> bool:
    return any(c["name"] == "tenant_id" for c in sa.inspect(op.get_bind()).get_columns(_TABLE))


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade():
    if not _has_table() or _has_tenant_column():
        return
    op.add_column(_TABLE, sa.Column("tenant_id", sa.Uuid(as_uuid=False), nullable=True))
    op.execute(f"""
        UPDATE {_TABLE} e SET tenant_id = c.tenant_id
          FROM elearning_courses c WHERE c.id = e.course_id
    """)
    op.alter_column(_TABLE, "tenant_id", nullable=False)
    op.create_foreign_key("fk_elearning_enrollments_tenant", _TABLE, "tenants",
                          ["tenant_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_elearning_enrollments_tenant", _TABLE, ["tenant_id"])
    if _is_pg():
        op.execute(f"ALTER TABLE {_TABLE} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {_TABLE} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {_POLICY_NAME} ON {_TABLE}")
        op.execute(f"CREATE POLICY {_POLICY_NAME} ON {_TABLE} USING ({_POLICY}) WITH CHECK ({_POLICY})")


def downgrade():
    if not _has_table() or not _has_tenant_column():
        return
    if _is_pg():
        op.execute(f"DROP POLICY IF EXISTS {_POLICY_NAME} ON {_TABLE}")
        op.execute(f"ALTER TABLE {_TABLE} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {_TABLE} DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_elearning_enrollments_tenant", table_name=_TABLE)
    op.drop_constraint("fk_elearning_enrollments_tenant", _TABLE, type_="foreignkey")
    op.drop_column(_TABLE, "tenant_id")
