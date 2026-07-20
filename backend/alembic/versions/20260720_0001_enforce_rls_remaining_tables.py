"""Enforce tenant RLS on tables added after the previous catch-all pass.

Revision ID: b5e71cce8a7a
Revises: f7a8b9c0d1e2
Create Date: 2026-07-20

The 2026-07-13 catch-all migration only covers tables that existed in the
schema at that point in the migration chain. Tables created by later
migrations (homework, exams, webhooks, gamification, etc.) were never swept,
so a fresh database (no manual out-of-band ALTER TABLE fixups) fails the
/health/ready RLS check. Same discovery-based, idempotent approach as
c4d5e6f7a8b9 — re-run it at head so it also covers everything added since.
"""

from __future__ import annotations

import hashlib

from alembic import op
from sqlalchemy import text


revision = "b5e71cce8a7a"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None

TENANT_SETTING = "app.current_tenant_id"


def _policy_name(table_name: str) -> str:
    digest = hashlib.sha256(table_name.encode("utf-8")).hexdigest()[:16]
    return f"schoolflow_tenant_{digest}"


def _tenant_tables(conn) -> list[str]:
    return list(
        conn.execute(
            text(
                """
                SELECT cls.relname
                FROM pg_class cls
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                WHERE ns.nspname = 'public'
                  AND cls.relkind IN ('r', 'p')
                  AND EXISTS (
                      SELECT 1
                      FROM pg_attribute attr
                      WHERE attr.attrelid = cls.oid
                        AND attr.attname = 'tenant_id'
                        AND NOT attr.attisdropped
                  )
                ORDER BY cls.relname
                """
            )
        ).scalars()
    )


def _has_tenant_policy(conn, table_name: str) -> bool:
    return bool(
        conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_policy pol
                    JOIN pg_class cls ON cls.oid = pol.polrelid
                    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                    WHERE ns.nspname = 'public'
                      AND cls.relname = :table_name
                      AND (
                          COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')
                              LIKE :tenant_setting
                          OR COALESCE(
                              pg_get_expr(pol.polwithcheck, pol.polrelid), ''
                          ) LIKE :tenant_setting
                      )
                )
                """
            ),
            {
                "table_name": table_name,
                "tenant_setting": f"%{TENANT_SETTING}%",
            },
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    quote = conn.dialect.identifier_preparer.quote
    for table_name in _tenant_tables(conn):
        qualified_table = f"{quote('public')}.{quote(table_name)}"
        conn.execute(text(f"ALTER TABLE {qualified_table} ENABLE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {qualified_table} FORCE ROW LEVEL SECURITY"))

        if _has_tenant_policy(conn, table_name):
            continue

        policy = quote(_policy_name(table_name))
        tenant_expression = (
            "tenant_id::text = COALESCE("
            f"current_setting('{TENANT_SETTING}', true), '')"
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
    for table_name in _tenant_tables(conn):
        qualified_table = f"{quote('public')}.{quote(table_name)}"
        policy = quote(_policy_name(table_name))
        conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {qualified_table}"))
