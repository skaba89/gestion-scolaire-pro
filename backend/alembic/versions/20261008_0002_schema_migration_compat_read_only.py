"""Make `schema_migration_compat` read-only for every role but its owner.

Revision ID: 20261008_0002
Revises: 20261008_0001
Create Date: 2026-10-08

The table is the proof the running API trusts to serve a database ahead of
its code (app/core/schema_compat.py). In production the owner's default
privileges (infra/azure/sql/create_app_role.sql: ALTER DEFAULT PRIVILEGES
... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES) also gave INSERT /
UPDATE / DELETE on it to the runtime roles (`schoolflow_api`,
`schoolflow_worker` — observed on the 2026-10-08 rehearsal branch). A
runtime connection must never be able to mark a migration as compatible.

upgrade(): revokes every non-SELECT privilege held by any role other than
the table owner (PUBLIC included), discovered from the table ACL — no role
name hardcoded, so it works for every environment. SELECT is kept (the API
reads the table). The owner (migration role) keeps writing it through the
`on_version_apply` hook.
downgrade(): re-grants INSERT, UPDATE, DELETE to the non-owner roles that
still have SELECT, i.e. the state the default privileges produced.

SQLite: no privileges — no-op.
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20261008_0002"
down_revision = "20261008_0001"
branch_labels = None
depends_on = None

# Privilege change only; the code of 20261008_0001 only SELECTs this table.
backward_compatible = True

TABLE = "public.schema_migration_compat"

_REVOKE = f"""
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT DISTINCT a.privilege_type,
               CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(g.rolname) END AS grantee
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) a
        LEFT JOIN pg_roles g ON g.oid = a.grantee
        WHERE c.oid = '{TABLE}'::regclass
          AND a.grantee <> c.relowner
          AND a.privilege_type <> 'SELECT'
    LOOP
        EXECUTE format('REVOKE %s ON {TABLE} FROM %s', r.privilege_type, r.grantee);
    END LOOP;
END
$$;
"""

_REGRANT = f"""
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT DISTINCT quote_ident(g.rolname) AS grantee
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) a
        JOIN pg_roles g ON g.oid = a.grantee
        WHERE c.oid = '{TABLE}'::regclass
          AND a.grantee <> c.relowner
          AND a.privilege_type = 'SELECT'
    LOOP
        EXECUTE format('GRANT INSERT, UPDATE, DELETE ON {TABLE} TO %s', r.grantee);
    END LOOP;
END
$$;
"""


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    bind.execute(text(_REVOKE))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    bind.execute(text(_REGRANT))
