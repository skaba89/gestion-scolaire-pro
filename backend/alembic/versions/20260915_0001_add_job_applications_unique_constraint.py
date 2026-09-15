"""Add missing UNIQUE(student_id, job_offer_id) on job_applications.

Revision ID: 20260915_0001
Revises: 20260827_0003
Create Date: 2026-09-15

Discovered while writing a regression test for the alumni ownership-scoping
fix in operational/alumni.py (institutional-readiness audit, 2026-09):
POST /api/v1/alumni/careers/applications/ inserts with
`ON CONFLICT (student_id, job_offer_id) DO NOTHING`, but no unique
constraint on that pair was ever created (see
app/core/operational_tables.py's job_applications DDL) — so on real
PostgreSQL every single application submission fails with
`InvalidColumnReference: there is no unique or exclusion constraint
matching the ON CONFLICT specification`. This endpoint has apparently
never actually been exercised against Postgres before (no prior test
covered it), which is exactly the "everything must work" risk this whole
audit is closing ahead of the ministerial demo.

A pre-existing accidental duplicate (student_id, job_offer_id) pair, if
any, is deduplicated first (keeping the earliest application) so the
constraint can be created — mirrors the defensive style of the other
"filet de sécurité" migrations in this history.

SQLite: no-op — job_applications is a raw-SQL operational table created
only by app.core.operational_tables (Postgres-only DDL, see
20260827_0003 and its siblings for the same pattern).
"""
from alembic import op
from sqlalchemy import text

revision = "20260915_0001"
down_revision = "20260827_0003"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    try:
        conn.execute(text("SELECT current_database()")).fetchone()
        return False
    except Exception:
        return True


def upgrade():
    conn = op.get_bind()
    if _is_sqlite(conn):
        return

    conn.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'job_applications'
            ) THEN
                DELETE FROM job_applications ja USING job_applications dup
                WHERE ja.student_id = dup.student_id
                  AND ja.job_offer_id = dup.job_offer_id
                  AND ja.created_at > dup.created_at
                  AND ja.id <> dup.id;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_job_applications_student_offer'
                ) THEN
                    ALTER TABLE job_applications
                        ADD CONSTRAINT uq_job_applications_student_offer
                        UNIQUE (student_id, job_offer_id);
                END IF;
            END IF;
        END $$;
    """))


def downgrade():
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    conn.execute(text("""
        ALTER TABLE job_applications
            DROP CONSTRAINT IF EXISTS uq_job_applications_student_offer;
    """))
