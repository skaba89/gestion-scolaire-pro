"""Create user_presence with tenant RLS.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-17

The realtime presence endpoint used to lazily `CREATE TABLE IF NOT EXISTS
user_presence` on first call. That table carries a tenant_id but was created
without row-level security, so as soon as a user connected the production
readiness probe (`/health/ready`) reported `rls: disabled` and the API
container was marked unhealthy — and tenant isolation was not enforced on
presence rows. This migration creates the table up front WITH RLS so it is
covered like every other tenant-scoped table.
"""
from __future__ import annotations

import hashlib

from alembic import op
from sqlalchemy import text


revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None

TENANT_SETTING = "app.current_tenant_id"
TABLE = "user_presence"


def _policy_name(table_name: str) -> str:
    digest = hashlib.sha256(table_name.encode("utf-8")).hexdigest()[:16]
    return f"schoolflow_tenant_{digest}"


def upgrade() -> None:
    conn = op.get_bind()

    # SQLite (tests/dev) relies on application-level tenant filters; just make
    # sure the table exists so presence writes succeed.
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_presence (
                user_id UUID PRIMARY KEY,
                tenant_id UUID,
                status VARCHAR(50) DEFAULT 'online',
                is_typing BOOLEAN DEFAULT FALSE,
                current_conversation_id UUID,
                metadata JSONB,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
    )

    if conn.dialect.name != "postgresql":
        return

    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_user_presence_tenant_id "
             "ON user_presence (tenant_id)")
    )

    quote = conn.dialect.identifier_preparer.quote
    qualified_table = f"{quote('public')}.{quote(TABLE)}"
    conn.execute(text(f"ALTER TABLE {qualified_table} ENABLE ROW LEVEL SECURITY"))
    conn.execute(text(f"ALTER TABLE {qualified_table} FORCE ROW LEVEL SECURITY"))

    policy = quote(_policy_name(TABLE))
    tenant_expression = (
        "tenant_id::text = COALESCE("
        f"current_setting('{TENANT_SETTING}', true), '')"
    )
    # Idempotent: drop any prior policy of the same name before recreating.
    conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {qualified_table}"))
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
    qualified_table = f"{quote('public')}.{quote(TABLE)}"
    policy = quote(_policy_name(TABLE))
    conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {qualified_table}"))
