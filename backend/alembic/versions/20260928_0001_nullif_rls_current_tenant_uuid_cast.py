"""Guard the RLS `::uuid` cast, and its NULL handling, against reality.

Revision ID: 20260928_0001
Revises: 20260927_0001
Create Date: 2026-09-28

BUG FOUND while due-diligence-testing the restricted non-superuser
application role (docs/POSTGRES_APP_ROLE.md, PR #259): every tenant
policy created by 20260224_0730_fdb89a2e3b4d_enable_rls.py (and several
migrations that copied its shape) uses

    USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)

on the assumption, stated in that migration's own comment, that
`current_setting('app.current_tenant_id', true)` returns SQL NULL once
the request has no tenant (SUPER_ADMIN, public routes, /auth/bootstrap/,
...) — `app/core/database.py::get_db()` resets the GUC on every request
via `set_config('app.current_tenant_id', NULL, false)` precisely to
reach that state.

Confirmed directly against a real PostgreSQL 16 instance (`psql`, no
ORM/driver involved) that this assumption is wrong for a *custom*
("placeholder") GUC: `set_config(name, NULL, false)` does not clear it
to NULL — it defines/resets it to the empty string:

    postgres=> SELECT set_config('app.current_tenant_id', NULL, false);
    postgres=> SELECT current_setting('app.current_tenant_id', true) IS NULL;
     ?column?
    ----------
     f
    (current_setting(...) is '', not NULL)

So `(''::uuid)` is evaluated on every no-tenant request, which raises
`psycopg.errors.InvalidTextRepresentation: invalid input syntax for
type uuid: ""` — for the *entire row scan*, since this happens inside
the policy's own USING/WITH CHECK clause, not application code the app
could catch and handle.

This has been completely invisible in production and in the existing
test suite because both currently connect as the PostgreSQL Flexible
Server admin login, which is a superuser — and a superuser role bypasses
every RLS policy unconditionally (see docs/POSTGRES_APP_ROLE.md,
app/main.py::_check_rls_bypass_role), so this cast never actually runs
for that connection. It surfaced as ~750 of the ~935 test failures
observed running the full suite against the restricted, non-superuser
`schoolflow_app` role created by infra/azure/sql/create_app_role.sql —
i.e. it is a real, independent, pre-existing correctness bug, not an
artifact of that role or of this migration's own testing.

SECOND BUG, found while re-testing the NULLIF-only version of this fix:
guarding the cast alone is not enough. `tenant_id = <uuid-or-NULL>` uses
plain `=`, and SQL's `NULL = NULL` is NULL, not TRUE — so once the cast
stopped crashing, a row that is *itself* tenant-less (`tenant_id IS
NULL`: the platform SUPER_ADMIN account, created by exactly this path)
was silently REJECTED by its own INSERT's WITH CHECK, because "no
tenant" state no longer matches "no tenant" state under plain `=`.
Confirmed live: `/auth/bootstrap/`'s `INSERT INTO users (tenant_id, ...)
VALUES (NULL, ...)` failed with `psycopg.errors.InsufficientPrivilege:
new row violates row-level security policy for table "users"` under the
restricted role, immediately after the NULLIF-only fix — this is
`app/core/security.py::get_current_user()`'s own pattern in reverse:
that function explicitly resets `app.current_tenant_id` to NULL before
querying `users`, precisely so a NULL-tenant (platform) row is
reachable when there is no tenant context — the policy itself must
honor that same "NULL matches NULL" rule, which `=` does not.

Fix: replace `=` with `IS NOT DISTINCT FROM` (Postgres's NULL-safe
equality — TRUE for NULL vs NULL, otherwise identical to `=`) on top of
the NULLIF guard above:

    USING (tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)

This one expression fixes both bugs at once: the cast never sees a bare
empty string (NULLIF), and a genuinely tenant-less row is visible
precisely when there is no tenant context and invisible otherwise (IS
NOT DISTINCT FROM) — never to a *different* tenant's context, since
`'real-tenant-uuid' IS NOT DISTINCT FROM NULL` is still FALSE.

Dynamically discovers every policy using the exact buggy substring
(same principle as 20260713_0002_enforce_rls_on_current_tenant_tables.py
and 20260827_0003_fix_public_pages_tenant_fk_cascade.py's own generic
sweeps) rather than a hardcoded table list, so it also catches any
policy this session didn't happen to enumerate by hand. 38 policies
matched against a full local migration run at the time this was
written; some later migration adding a table with the same buggy
pattern would be caught by a future re-run of an equivalent sweep, not
retroactively by this one.

SQLite: RLS is PostgreSQL-only; this migration is a no-op there, same
as every other RLS migration in this history.
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20260928_0001"
down_revision = "20260927_0001"
branch_labels = None
depends_on = None

# Exact text as PostgreSQL's own pg_get_expr() renders it back (confirmed
# against a real instance) - not the literal source text of any one
# migration, which may format() the same SQL slightly differently. The
# column is always bare `tenant_id` in every one of the 38 matches found
# (verified against the live catalog before writing this), so matching
# the whole "tenant_id = (...)" expression, not just the cast, is safe.
_BUGGY_EXPR = "tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid"
_FIXED_EXPR = (
    "tenant_id IS NOT DISTINCT FROM "
    "(NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid"
)


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
            print(f"[20260928_0001] could not fix policy {row['policy_name']} on {row['table_name']}: {exc}")


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return
    _swap(conn, _BUGGY_EXPR, _FIXED_EXPR)


def downgrade() -> None:
    # Reverting would reintroduce the crash on every no-tenant request
    # under a role that doesn't bypass RLS - same "no-op downgrade"
    # convention as this history's other security-fix sweeps
    # (20260827_0003_fix_public_pages_tenant_fk_cascade.py).
    pass
