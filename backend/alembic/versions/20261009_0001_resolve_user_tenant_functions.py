"""Constant-cost user -> tenant resolution for pre-authentication lookups.

Revision ID: 20261009_0001
Revises: 20261008_0002
Create Date: 2026-10-09

`users` is RLS-strict with no platform bypass (by design: credentials and
PII). Login, registration, password reset and MFA happen before any tenant
is known, so `find_user_across_all_tenants()` searched tenant by tenant:
up to 2N+1 round trips per call, on unauthenticated endpoints — a database
amplification lever and a timing signal that grow with the number of
tenants.

Same approach as 20261007_0001 (payment webhooks): SECURITY DEFINER
functions that return ONLY the owning tenant ids of the matching user(s),
never the row itself. The caller then runs its normal query once, under that
tenant's RLS context (app/core/database.py::find_user_in_owner_tenant).

- resolve_user_tenants_by_login(text): email = $1 OR username = $1
  (the /auth/login/ semantics; both columns have a unique index).
- resolve_user_tenants_by_email_ci(text): lower(email) = lower($1)
  (registration duplicate checks), backed by the new ix_users_email_lower.
- resolve_user_tenants_by_id(uuid): password reset / MFA by user id.

Each returns a set of `tenant_id` (NULL = platform account; no row = no
user), DISTINCT and bounded (LIMIT 5): normally one row, but `users.email`
is unique case-sensitively, so a case-insensitive match may legitimately
span tenants — the caller then checks each, never guesses.

Security: pinned search_path + schema-qualified names (no hijack), static
SQL, STABLE, tenant ids only. EXECUTE to PUBLIC (runtime role names differ
per environment), like resolve_payment_tenant. Owner must be superuser or
BYPASSRLS (checked; fails loudly otherwise).

Additive only: backward compatible (the previous release ignores them).
SQLite: no RLS, no functions — no-op (the code queries directly there).
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20261009_0001"
down_revision = "20261008_0002"
branch_labels = None
depends_on = None

backward_compatible = True

_FUNCTIONS = {
    "public.resolve_user_tenants_by_login(text)": """
        CREATE OR REPLACE FUNCTION public.resolve_user_tenants_by_login(p_login text)
        RETURNS TABLE(tenant_id uuid)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $fn$
            SELECT DISTINCT u.tenant_id
            FROM public.users AS u
            WHERE u.email = p_login OR u.username = p_login
            LIMIT 5
        $fn$
    """,
    "public.resolve_user_tenants_by_email_ci(text)": """
        CREATE OR REPLACE FUNCTION public.resolve_user_tenants_by_email_ci(p_email text)
        RETURNS TABLE(tenant_id uuid)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $fn$
            SELECT DISTINCT u.tenant_id
            FROM public.users AS u
            WHERE lower(u.email) = lower(p_email)
            LIMIT 5
        $fn$
    """,
    "public.resolve_user_tenants_by_id(uuid)": """
        CREATE OR REPLACE FUNCTION public.resolve_user_tenants_by_id(p_user_id uuid)
        RETURNS TABLE(tenant_id uuid)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $fn$
            SELECT u.tenant_id
            FROM public.users AS u
            WHERE u.id = p_user_id
            LIMIT 1
        $fn$
    """,
}


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email_lower ON public.users (lower(email))"))

    for signature, ddl in _FUNCTIONS.items():
        conn.execute(text(ddl))
        conn.execute(text(
            f"COMMENT ON FUNCTION {signature} IS 'Pre-authentication user lookup: owning tenant id(s) "
            "only (SECURITY DEFINER). See migration 20261009_0001.'"
        ))
        conn.execute(text(f"GRANT EXECUTE ON FUNCTION {signature} TO PUBLIC"))
        owner_can_bypass = conn.execute(text(
            "SELECT r.rolsuper OR r.rolbypassrls FROM pg_proc p "
            "JOIN pg_roles r ON r.oid = p.proowner WHERE p.oid = CAST(:sig AS regprocedure)"
        ), {"sig": signature}).scalar()
        if not owner_can_bypass:
            raise RuntimeError(
                f"20261009_0001: the owner of {signature} (the role running this migration) is "
                "neither superuser nor BYPASSRLS, so the function cannot see `users` under FORCE "
                "ROW LEVEL SECURITY and every login would fail. Run the migrations with the "
                "database owner/admin role (DATABASE_URL_MIGRATIONS, e.g. neondb_owner) — see "
                "docs/runbooks/appservice-migrations.md."
            )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    for signature in _FUNCTIONS:
        conn.execute(text(f"DROP FUNCTION IF EXISTS {signature}"))
    conn.execute(text("DROP INDEX IF EXISTS public.ix_users_email_lower"))
