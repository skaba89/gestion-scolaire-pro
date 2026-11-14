"""Restore the missing grades.academic_year_id foreign key without rewriting history.

Revision ID: 20261114_0001
Revises: 20261112_0002
"""
import sqlalchemy as sa
from alembic import op

revision = "20261114_0001"
down_revision = "20261112_0002"
branch_labels = None
depends_on = None
backward_compatible = True

CONSTRAINT = "fk_grades_academic_year_id"
INDEX = "ix_grades_academic_year_id"


def upgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return  # SQLite tests build the FK from ORM metadata.
    # Fail rather than wait indefinitely for a busy production table. These
    # transaction-local settings are restored by commit/rollback.
    op.execute("SET LOCAL lock_timeout = '5s'")
    orphan_count = conn.execute(sa.text("""
        SELECT count(*) FROM grades g
        WHERE g.academic_year_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM academic_years y WHERE y.id=g.academic_year_id)
    """)).scalar_one()
    if orphan_count:
        raise RuntimeError(
            f"SCHEMA-DRIFT-01: {orphan_count} grade(s) reference a missing academic year; "
            "migration stopped without changing data. Reconcile references from verified school history first."
        )
    foreign_keys = sa.inspect(conn).get_foreign_keys("grades")
    existing = next((fk for fk in foreign_keys
                     if fk["constrained_columns"] == ["academic_year_id"]
                     and fk["referred_table"] == "academic_years"
                     and fk["referred_columns"] == ["id"]), None)
    if existing:
        quoted = conn.dialect.identifier_preparer.quote(existing["name"])
        op.execute(f"ALTER TABLE grades VALIDATE CONSTRAINT {quoted}")
    else:
        # New writes are protected immediately; validation then checks the
        # retained rows, including a writer racing the preflight check above.
        op.create_foreign_key(CONSTRAINT, "grades", "academic_years",
                              ["academic_year_id"], ["id"], ondelete="SET NULL",
                              postgresql_not_valid=True)
        op.execute(f"ALTER TABLE grades VALIDATE CONSTRAINT {CONSTRAINT}")
    indexes = sa.inspect(conn).get_indexes("grades")
    if not any(i["column_names"] and i["column_names"][0] == "academic_year_id" for i in indexes):
        op.create_index(INDEX, "grades", ["academic_year_id"])


def downgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    if any(i["name"] == INDEX for i in sa.inspect(conn).get_indexes("grades")):
        op.drop_index(INDEX, table_name="grades")
    if any(fk["name"] == CONSTRAINT for fk in sa.inspect(conn).get_foreign_keys("grades")):
        op.drop_constraint(CONSTRAINT, "grades", type_="foreignkey")
