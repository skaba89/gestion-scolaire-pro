"""Guard the RLS platform bypass (`OR current_setting(...) IS NULL`) against the same NULL-vs-empty-string reality as migration 20260928_0001.

Revision ID: 20260929_0001
Revises: 20260928_0001
Create Date: 2026-09-29

BUG FOUND while building worker RLS tenant-context propagation (security
audit, ARQ workers pass - docs/POSTGRES_APP_ROLE.md). 15 RLS policies
(jobs, notification_events, idempotency_keys, public_form_submissions,
payment_webhook_events, payment_reference_counters,
notification_preferences, kiosk_devices, message_threads, message_items,
subject_preferred_rooms, semesters, student_subjects, faculties,
subject_prerequisites) deliberately grant platform-wide visibility with no
tenant context via a bypass clause:

    (tenant_id)::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_tenant_id', true) IS NULL

Migration 20260928_0001 already proved, against a real PostgreSQL 16
instance, that `set_config('app.current_tenant_id', NULL, false)` - what
app/core/database.py::get_db() runs on EVERY request with no tenant, and
what the new platform_db_session()/worker_db_session() helpers in this
same PR run too - does not clear a custom GUC to SQL NULL. It resets it to
an empty string. That migration fixed the `::uuid` cast policies (a
crash); this one fixes a different, quieter failure mode in the policies
above: `current_setting(...) IS NULL` reads FALSE once a connection has
ever run that reset, so the bypass silently stops granting visibility -
not a crash, just an empty result set - on any pooled connection that
happens to have served a tenant-scoped request or job before.

Confirmed directly (real PostgreSQL 16, disposable NOSUPERUSER NOBYPASSRLS
role, no ORM): a `jobs` row with a real, non-NULL tenant_id becomes
invisible to `_job_finished()` in app/workers/tasks.py on any connection
that has ever executed `set_config('app.current_tenant_id', NULL, false)`
- which, in the worker process, is every connection the moment the new
platform_db_session() (this same PR) has run on it even once. Every
tenant-scoped ARQ job would silently fail to mark its own job row
SUCCESS/FAILED as the pool "wears in", eventually leaving jobs stuck at
RUNNING forever with no error ever raised or logged.

Fix, same principle as 20260928_0001: `current_setting(...) IS NULL`
becomes `NULLIF(current_setting(...), '') IS NULL`, so an explicit reset
to empty string is treated exactly like a connection that was never
touched at all - restoring the bypass's intended behaviour regardless of
what a previous job/request did to this pooled connection.

Dynamically discovers every affected policy via pg_policies (same
principle as 20260713_0002, 20260827_0003 and 20260928_0001) rather than
the hardcoded table list above, which is only this migration's own
paper trail of what it found on the day it was written - not a
maintenance list.

SQLite: RLS is PostgreSQL-only; this migration is a no-op there.
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20260929_0001"
down_revision = "20260928_0001"
branch_labels = None
depends_on = None

# Exact text as PostgreSQL's own pg_get_expr() renders it back (confirmed
# against a real instance).
_BUGGY_BYPASS = "current_setting('app.current_tenant_id'::text, true) IS NULL"
_FIXED_BYPASS = "NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text) IS NULL"


def _is_sqlite(conn) -> bool:
    try:
        conn.execute(text("SELECT current_database()")).fetchone()
        return False
    except Exception:
        return True


def _swap(conn, buggy: str, fixed: str) -> None:
    quote = conn.dialect.identifier_preparer.quote
    rows = conn.execute(
        text(
            """
            SELECT cls.relname AS table_name, pol.polname AS policy_name,
                pg_get_expr(pol.polqual, pol.polrelid) AS qual,
                pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
            FROM pg_policy pol
            JOIN pg_class cls ON cls.oid = pol.polrelid
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = 'public'
              AND (
                  pg_get_expr(pol.polqual, pol.polrelid) LIKE :pattern
                  OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE :pattern
              )
            """
        ),
        {"pattern": f"%{buggy}%"},
    ).mappings().all()

    for row in rows:
        qualified_table = f"{quote('public')}.{quote(row['table_name'])}"
        policy = quote(row["policy_name"])
        new_qual = (row["qual"] or "").replace(buggy, fixed) if row["qual"] else None
        new_check = (
            (row["with_check"] or "").replace(buggy, fixed) if row["with_check"] else None
        )
        clauses = []
        if new_qual is not None:
            clauses.append(f"USING ({new_qual})")
        if new_check is not None:
            clauses.append(f"WITH CHECK ({new_check})")
        if not clauses:
            continue
        try:
            conn.execute(text(f"ALTER POLICY {policy} ON {qualified_table} {' '.join(clauses)}"))
        except Exception as exc:
            print(f"[20260929_0001] could not fix policy {row['policy_name']} on {row['table_name']}: {exc}")


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    _swap(conn, _BUGGY_BYPASS, _FIXED_BYPASS)


def downgrade() -> None:
    # Reverting would silently break the platform-scope bypass again on
    # any connection touched by a tenant-context reset - same "no-op
    # downgrade" convention as this history's other RLS security fixes
    # (20260827_0003, 20260928_0001).
    pass
