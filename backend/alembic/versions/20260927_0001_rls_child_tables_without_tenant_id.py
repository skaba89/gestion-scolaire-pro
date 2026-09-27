"""Enforce tenant RLS on child tables that have no tenant_id column of their own.

Revision ID: 20260927_0001
Revises: 20260926_0001
Create Date: 2026-09-27

National-scale production-readiness audit: every previous RLS sweep
(659b47b029bd, c4d5e6f7a8b9, b5e71cce8a7a) discovers tables to protect via
`EXISTS (... attname = 'tenant_id')` — which is exactly right for tables
that carry their own tenant_id column, but structurally CANNOT ever find a
child table that has none. Five such tables were found with RLS entirely
disabled (verified against a real PostgreSQL 16 instance after
`alembic upgrade head`, no manual out-of-band fixups):

  - alumni_request_history  (-> alumni_document_requests.tenant_id)
  - conversation_participants (-> conversations.tenant_id)
  - email_otps              (-> users.tenant_id)
  - order_items             (-> orders.tenant_id)
  - user_message_status     (-> messages.tenant_id)

Each is scoped to its tenant-owning parent via its own FK column, since it
carries no tenant_id of its own. `subscription_plans` and `tenants` were
also found without RLS, but are legitimately platform-wide (not owned by
any single tenant) — intentionally left alone here.

This closes a real, unconditional gap: unlike the catch-all migrations,
being re-run again would never have found these tables no matter how many
times it runs, since none of them will ever gain a tenant_id column.
Whether RLS is an *effective* second line of defense for the connecting
role in a given deployment is a separate, already-tracked question (see
docs/INSTITUTIONAL_ROLES.md and GET /platform/security/database-role/) —
out of scope here. This migration only ensures the policy exists, so it
is already effective on any deployment whose connecting role is not a
superuser and does not have BYPASSRLS, and applies retroactively the
moment such a role is adopted anywhere else.

Note: the readiness check in app/main.py (_check_rls_status) has the exact
same tenant_id-column blind spot as the catch-all migrations it mirrors —
it will keep reporting "rls: active" without ever seeing these tables.
Documented as a known follow-up (not fixed here, to keep this PR scoped to
the concrete, already-verified gap): a health check that also verifies
child-table coverage would need a maintained list of tenant-owned parents,
the same hand-written knowledge this migration itself relies on.
"""

from __future__ import annotations

import hashlib

from alembic import op
from sqlalchemy import text


revision = "20260927_0001"
down_revision = "20260926_0001"
branch_labels = None
depends_on = None

TENANT_SETTING = "app.current_tenant_id"

# table -> (fk column on this table, parent table, parent PK column)
CHILD_TABLES: dict[str, tuple[str, str, str]] = {
    "alumni_request_history": ("request_id", "alumni_document_requests", "id"),
    "conversation_participants": ("conversation_id", "conversations", "id"),
    "email_otps": ("user_id", "users", "id"),
    "order_items": ("order_id", "orders", "id"),
    "user_message_status": ("message_id", "messages", "id"),
}


def _policy_name(table_name: str) -> str:
    digest = hashlib.sha256(table_name.encode("utf-8")).hexdigest()[:16]
    return f"schoolflow_tenant_child_{digest}"


def _table_exists(conn, table_name: str) -> bool:
    return bool(
        conn.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_class cls "
                "JOIN pg_namespace ns ON ns.oid = cls.relnamespace "
                "WHERE ns.nspname = 'public' AND cls.relname = :table_name)"
            ),
            {"table_name": table_name},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    quote = conn.dialect.identifier_preparer.quote
    for table_name, (fk_column, parent_table, parent_pk) in CHILD_TABLES.items():
        if not _table_exists(conn, table_name) or not _table_exists(conn, parent_table):
            # Defensive only: every one of these tables and their parent are
            # created by earlier migrations already applied at this point in
            # the chain, on every dialect this migration runs on.
            continue

        qualified_table = f"{quote('public')}.{quote(table_name)}"
        conn.execute(text(f"ALTER TABLE {qualified_table} ENABLE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {qualified_table} FORCE ROW LEVEL SECURITY"))

        policy = quote(_policy_name(table_name))
        tenant_expression = (
            f"{quote(fk_column)} IN ("
            f"SELECT {quote(parent_pk)} FROM {quote('public')}.{quote(parent_table)} "
            f"WHERE tenant_id::text = COALESCE(current_setting('{TENANT_SETTING}', true), '')"
            ")"
        )
        conn.execute(
            text(
                f"DROP POLICY IF EXISTS {policy} ON {qualified_table}"
            )
        )
        conn.execute(
            text(
                f"CREATE POLICY {policy} ON {qualified_table} "
                "AS PERMISSIVE FOR ALL TO PUBLIC "
                f"USING ({tenant_expression}) WITH CHECK ({tenant_expression})"
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    quote = conn.dialect.identifier_preparer.quote
    for table_name in CHILD_TABLES:
        if not _table_exists(conn, table_name):
            continue
        qualified_table = f"{quote('public')}.{quote(table_name)}"
        policy = quote(_policy_name(table_name))
        conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {qualified_table}"))
        conn.execute(text(f"ALTER TABLE {qualified_table} NO FORCE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {qualified_table} DISABLE ROW LEVEL SECURITY"))
