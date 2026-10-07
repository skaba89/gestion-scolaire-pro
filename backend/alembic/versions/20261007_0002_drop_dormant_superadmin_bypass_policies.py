"""Drop the dormant `superadmin_bypass_*` RLS policies.

Revision ID: 20261007_0002
Revises: 20261007_0001
Create Date: 2026-10-07

Migration 20260424_0002 added, next to each operational table's
`tenant_isolation_<table>` policy, a second PERMISSIVE policy:

    CREATE POLICY "superadmin_bypass_<table>" ... FOR ALL TO PUBLIC
    USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true')

Permissive policies are OR-ed: any session that sets `app.is_superadmin`
to 'true' sees (and, with no WITH CHECK, writes) every tenant's rows of
those tables. Nothing in the application ever sets that GUC (audit
2026-10-07: 13 such policies in production, zero writers of
`app.is_superadmin`) — platform access goes through the tenant context
helpers instead — so the policies are dead code whose only effect is a
latent cross-tenant door for any connection able to run `set_config`
(e.g. a future SQL injection) under the restricted runtime role.

upgrade(): drops every policy named `superadmin_bypass_%` whose expression
references `app.is_superadmin` (discovered via pg_policy, not hardcoded —
same principle as 20260929_0001). The `tenant_isolation_<table>` policies
are untouched.
downgrade(): recreates them exactly as 20260424_0002 did, on the 13
tables they existed on in production.

Note: app/core/operational_tables.py (frozen — imported by migration
20260930_0001) still contains the historical DDL; it no longer runs at
runtime (only a few tests call it on throwaway databases).

SQLite: no RLS — no-op.
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20261007_0002"
down_revision = "20261007_0001"
branch_labels = None
depends_on = None

# The tables that carried the policy in production (audit 2026-10-07).
_TABLES_FOR_DOWNGRADE = (
    "announcements", "clubs", "department_members", "forum_posts", "homework_submissions",
    "inventory_categories", "inventory_items", "mentorship_requests", "message_reactions",
    "messages", "survey_questions", "survey_responses", "surveys",
)


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    quote = conn.dialect.identifier_preparer.quote
    rows = conn.execute(text(
        """
        SELECT cls.relname AS table_name, pol.polname AS policy_name
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND pol.polname LIKE 'superadmin\\_bypass\\_%'
          AND (
              coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%app.is_superadmin%'
              OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%app.is_superadmin%'
          )
        """
    )).mappings().all()
    for row in rows:
        conn.execute(text(
            f"DROP POLICY IF EXISTS {quote(row['policy_name'])} "
            f"ON {quote('public')}.{quote(row['table_name'])}"
        ))
    print(f"[20261007_0002] dropped {len(rows)} dormant superadmin_bypass policies")


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    for table in _TABLES_FOR_DOWNGRADE:
        exists = conn.execute(text("SELECT to_regclass(:t) IS NOT NULL"), {"t": f"public.{table}"}).scalar()
        if not exists:
            continue
        conn.execute(text(f'DROP POLICY IF EXISTS "superadmin_bypass_{table}" ON "{table}"'))
        conn.execute(text(f"""
            CREATE POLICY "superadmin_bypass_{table}" ON "{table}"
            AS PERMISSIVE FOR ALL
            TO PUBLIC
            USING (
                COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
            )
        """))
