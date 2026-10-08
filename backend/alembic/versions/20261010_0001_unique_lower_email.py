"""Case-insensitive email uniqueness + case-insensitive email login.

Revision ID: 20261010_0001
Revises: 20261009_0001
Create Date: 2026-10-10

`ix_users_email` is unique case-sensitively, so "Foo@x.com" and "foo@x.com"
could coexist through write paths that did not lowercase (tenant admin
creation, bootstrap admin), while registration checks `lower(email)` and
login compared the typed value exactly.

- Pre-check: abort, with a count only (never the values), if users already
  collide on lower(email) — they must be merged by hand first.
- `uq_users_email_lower` UNIQUE (lower(email)) replaces the plain
  `ix_users_email_lower` created by 20261009_0001. `ix_users_email` (exact,
  declared by the ORM model) is kept.
- `resolve_user_tenants_by_login` now matches `email = lower(btrim($1))` OR
  `username = $1`: email login is case-insensitive (emails are stored
  lowercased — User._normalize_email), username login stays exact.

Backward compatible: the previous release keeps working; the only change it
can observe is the database refusing a case-duplicate email, which is the
point (its write paths already turn IntegrityError into 409/400 or 500).
SQLite: no-op (tests create the schema from the ORM models).
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20261010_0001"
down_revision = "20261009_0001"
branch_labels = None
depends_on = None

backward_compatible = True

_LOGIN_SIGNATURE = "public.resolve_user_tenants_by_login(text)"


def _login_function(email_predicate: str) -> str:
    return f"""
        CREATE OR REPLACE FUNCTION public.resolve_user_tenants_by_login(p_login text)
        RETURNS TABLE(tenant_id uuid)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $fn$
            SELECT DISTINCT u.tenant_id
            FROM public.users AS u
            WHERE {email_predicate} OR u.username = p_login
            LIMIT 5
        $fn$
    """


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    collisions = conn.execute(text(
        "SELECT count(*) FROM (SELECT lower(email) FROM public.users GROUP BY 1 HAVING count(*) > 1) AS d"
    )).scalar()
    if collisions:
        raise RuntimeError(
            f"20261010_0001: {collisions} email(s) are shared by several accounts once lowercased. "
            "Merge or rename those accounts first (SELECT lower(email), count(*) FROM users "
            "GROUP BY 1 HAVING count(*) > 1), then rerun the migration."
        )

    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON public.users (lower(email))"))
    conn.execute(text("DROP INDEX IF EXISTS public.ix_users_email_lower"))
    # Same owner/grants as 20261009_0001 (CREATE OR REPLACE keeps them).
    conn.execute(text(_login_function("u.email = lower(btrim(p_login))")))


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    conn.execute(text(_login_function("u.email = p_login")))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email_lower ON public.users (lower(email))"))
    conn.execute(text("DROP INDEX IF EXISTS public.uq_users_email_lower"))
