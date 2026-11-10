"""Student registration number unique per school, no longer platform-wide (A2).

20260424_0001 added uq_students_tenant_registration (tenant_id,
registration_number) but left the platform-wide UNIQUE index
ix_students_registration_number created in 20260221: a school could not use
a matricule already taken by another school (HTTP 500 on creation, and the
error revealed the matricule existed elsewhere), and the CSV import silently
skipped such students while counting them as created.

The global index is replaced by a plain index (lookups stay fast). The upgrade
only relaxes a constraint: it cannot fail on existing data.

Revision ID: 20261110_0001
Revises: 20261108_0001
"""
import sqlalchemy as sa
from alembic import op

revision = "20261110_0001"
down_revision = "20261108_0001"
branch_labels = None
depends_on = None
# The previous release's CSV import uses ON CONFLICT (registration_number),
# which needs the global unique index removed here: that code must not run on
# this schema (roll back with `alembic downgrade` first).
backward_compatible = False


def _unique_constraint_exists(conn, name: str) -> bool:
    return conn.execute(sa.text(
        "SELECT 1 FROM pg_constraint WHERE conname = :name AND conrelid = 'students'::regclass"
    ), {"name": name}).first() is not None


def upgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    # Per-school uniqueness must exist before the global index goes away.
    if not _unique_constraint_exists(conn, "uq_students_tenant_registration"):
        op.create_unique_constraint(
            "uq_students_tenant_registration", "students", ["tenant_id", "registration_number"],
        )
    op.execute("DROP INDEX IF EXISTS ix_students_registration_number")
    op.execute("CREATE INDEX IF NOT EXISTS ix_students_registration_number ON students (registration_number)")


def downgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    duplicates = conn.execute(sa.text("""
        SELECT registration_number, count(DISTINCT tenant_id) AS schools
          FROM students
         GROUP BY registration_number
        HAVING count(*) > 1
         ORDER BY registration_number
         LIMIT 20
    """)).fetchall()
    if duplicates:
        listed = ", ".join(f"{r.registration_number} ({r.schools} établissements)" for r in duplicates)
        raise RuntimeError(
            "Retour arrière impossible : des matricules sont utilisés par plusieurs établissements "
            f"({listed}). Aucune donnée n'a été modifiée ; renommez ces matricules avant de relancer."
        )
    op.execute("DROP INDEX IF EXISTS ix_students_registration_number")
    op.execute("CREATE UNIQUE INDEX ix_students_registration_number ON students (registration_number)")
