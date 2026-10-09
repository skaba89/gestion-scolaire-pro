"""Create `platform_audit_logs` — durable trail of SUPER_ADMIN tenant operations.

Revision ID: 20261011_0001
Revises: 20261010_0001
Create Date: 2026-10-11

`audit_logs.tenant_id` is NOT NULL and cascades on tenant deletion, so the
DELETE_TENANT row disappeared with the tenant it described. This table is
platform-level (no tenant_id, no foreign key, no RLS): the target is
identified by value and the row survives the tenant. It holds operator
actions only (who, what, when) — not the deleted tenant's personal data.

Append-only for every role but the owner: non-SELECT/INSERT privileges
granted by default privileges (runtime roles) are revoked, discovered from
the table ACL (same approach as 20261008_0002).

Backward compatible: a new table nothing in the previous release uses.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "20261011_0001"
down_revision = "20261010_0001"
branch_labels = None
depends_on = None

backward_compatible = True

TABLE = "platform_audit_logs"

_APPEND_ONLY = f"""
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
        WHERE c.oid = 'public.{TABLE}'::regclass
          AND a.grantee <> c.relowner
          AND a.privilege_type NOT IN ('SELECT', 'INSERT')
    LOOP
        EXECUTE format('REVOKE %s ON public.{TABLE} FROM %s', r.privilege_type, r.grantee);
    END LOOP;
END
$$;
"""


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("actor_user_id", sa.String(255), nullable=False),
            sa.Column("action", sa.String(50), nullable=False),
            sa.Column("target_type", sa.String(50), nullable=False),
            sa.Column("target_id", sa.String(255), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_platform_audit_logs_actor_user_id", TABLE, ["actor_user_id"])
        op.create_index("ix_platform_audit_logs_action", TABLE, ["action"])
        op.create_index("ix_platform_audit_logs_target_id", TABLE, ["target_id"])
    if bind.dialect.name == "postgresql":
        bind.execute(text(_APPEND_ONLY))


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table(TABLE):
        op.drop_table(TABLE)
