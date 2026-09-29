"""Adopt every runtime-DDL table into Alembic - one-shot migrations pass.

Revision ID: 20260930_0001
Revises: 20260929_0001
Create Date: 2026-09-30

CONTEXT (Azure one-shot migrations, P0 — docs/POSTGRES_APP_ROLE.md): the
API and worker used to run DDL at every single startup, two ways:

1. app/main.py's lifespan called app.core.operational_tables
   .ensure_operational_tables(engine) unconditionally - CREATE TABLE IF
   NOT EXISTS / CREATE INDEX IF NOT EXISTS for ~55 tables that predate
   this repo's move to Alembic-managed schema (its own module docstring
   calls this "a transitional step"), PLUS a dynamic RLS-enablement sweep
   (_sweep_operational_rls) that ALTERs every tenant_id-bearing table with
   no RLS policy yet to ENABLE/FORCE ROW LEVEL SECURITY and CREATE POLICY
   a tenant-isolation policy on it.
2. app/api/v1/endpoints/core/mfa.py's _ensure_mfa_tables() lazily
   CREATE TABLE IF NOT EXISTS'd mfa_backup_codes/email_otps/
   mfa_totp_secrets the first time a route needed them - mfa_backup_codes
   and email_otps already had a real migration
   (20260406_add_mfa_and_perf_indexes.py) making this branch dead in
   practice, but mfa_totp_secrets had NO Alembic migration and NO ORM
   model at all - it existed ONLY via this runtime fallback.

Both are genuine DDL, both used to run under whatever role the
application connects with - fine under a superuser, a hard requirement
violation under schoolflow_app (NOSUPERUSER NOBYPASSRLS, no DDL grants at
all - see infra/azure/sql/create_app_role.sql). This migration adopts
every one of those DDL statements here, verbatim from
app.core.operational_tables._DDL and the RLS-sweep logic (so behaviour is
byte-for-byte identical to what has been running on every deploy so
far - no schema drift, no data loss, every statement is already
IF NOT EXISTS / idempotent), plus a new migration for mfa_totp_secrets
copied from mfa.py's own DDL. Once this migration has run once against an
environment, ensure_operational_tables()/_ensure_mfa_tables() have
nothing left to do - both call sites are removed from runtime code in
this same PR.

SQLite: this whole module targets PostgreSQL-only syntax (UUID, JSONB,
TIMESTAMPTZ, pg_policy). No-op there, same convention as every other RLS
migration in this history - SQLite dev/test schema comes from
Base.metadata.create_all() instead.
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20260930_0001"
down_revision = "20260929_0001"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    try:
        conn.execute(text("SELECT current_database()")).fetchone()
        return False
    except Exception:
        return True


_MFA_TOTP_SECRETS_DDL = [
    # Verbatim from app/api/v1/endpoints/core/mfa.py::_ensure_mfa_tables()
    # - the only table that fallback created with no Alembic migration at
    # all (mfa_backup_codes/email_otps were already covered by
    # 20260406_add_mfa_and_perf_indexes.py).
    """CREATE TABLE IF NOT EXISTS mfa_totp_secrets (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        secret VARCHAR(64) NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_mfa_totp_secrets_user_id
        ON mfa_totp_secrets(user_id)""",
]


def upgrade() -> None:
    conn = op.get_bind()
    if _is_sqlite(conn):
        return

    # Reuse the exact DDL text that has been running on every startup so
    # far - importing rather than re-typing it guarantees this migration
    # can never drift from what environments already have. Only the _DDL
    # list itself is reused, NOT _sweep_operational_rls() below: that
    # function calls conn.commit()/conn.rollback() directly, which is the
    # right thing for its normal caller (a plain engine.connect() in
    # ensure_operational_tables()) but corrupts Alembic's own
    # single-transaction-per-migration bookkeeping if called on the
    # connection Alembic hands this function - confirmed the hard way:
    # doing so left the final UPDATE alembic_version silently rolled back
    # (alembic current still showed the PREVIOUS revision after a
    # "successful"-looking upgrade). Each statement below instead runs in
    # its own SAVEPOINT (conn.begin_nested()) so one already-diverged
    # table can't block the rest, without ever calling commit()/rollback()
    # on the outer connection Alembic owns.
    from app.core.operational_tables import _DDL, _TENANT_SETTING

    for stmt in _DDL + _MFA_TOTP_SECRETS_DDL:
        try:
            with conn.begin_nested():
                conn.execute(text(stmt))
        except Exception as exc:
            print(f"[20260930_0001] DDL skipped: {stmt[:80]!r} ({exc})")

    # Same dynamic RLS-enablement sweep ensure_operational_tables() ran on
    # every startup - a table gains RLS + a tenant-isolation policy here
    # exactly once; a table that already has one is left untouched.
    # Re-implemented with begin_nested() instead of calling
    # _sweep_operational_rls() directly, for the same reason as above.
    quote = conn.dialect.identifier_preparer.quote
    tables = conn.execute(
        text(
            """
            SELECT cls.relname
            FROM pg_class cls
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = 'public'
              AND cls.relkind IN ('r', 'p')
              AND EXISTS (
                  SELECT 1 FROM pg_attribute attr
                  WHERE attr.attrelid = cls.oid
                    AND attr.attname = 'tenant_id'
                    AND NOT attr.attisdropped
              )
            """
        )
    ).scalars().all()

    for table_name in tables:
        qualified_table = f"{quote('public')}.{quote(table_name)}"
        try:
            with conn.begin_nested():
                conn.execute(text(f"ALTER TABLE {qualified_table} ENABLE ROW LEVEL SECURITY"))
                conn.execute(text(f"ALTER TABLE {qualified_table} FORCE ROW LEVEL SECURITY"))

                has_policy = conn.execute(
                    text(
                        """
                        SELECT EXISTS (
                            SELECT 1 FROM pg_policy pol
                            JOIN pg_class cls ON cls.oid = pol.polrelid
                            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                            WHERE ns.nspname = 'public' AND cls.relname = :table_name
                              AND (
                                  COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE :setting
                                  OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE :setting
                              )
                        )
                        """
                    ),
                    {"table_name": table_name, "setting": f"%{_TENANT_SETTING}%"},
                ).scalar()

                if not has_policy:
                    policy = quote(f"tenant_isolation_{table_name}")
                    tenant_expr = (
                        "tenant_id::text = COALESCE("
                        f"current_setting('{_TENANT_SETTING}', true), '')"
                    )
                    conn.execute(
                        text(
                            f"CREATE POLICY {policy} ON {qualified_table} "
                            "AS PERMISSIVE FOR ALL TO PUBLIC "
                            f"USING ({tenant_expr}) WITH CHECK ({tenant_expr})"
                        )
                    )
        except Exception as exc:
            print(f"[20260930_0001] RLS sweep skipped for {table_name}: {exc}")


def downgrade() -> None:
    # No-op, same convention as every other structural/security migration
    # in this history (20260827_0003, 20260928_0001, 20260929_0001):
    # reverting would drop tables/policies still actively used by running
    # code and by data created since this migration ran - there is no safe
    # automatic downgrade for "adopt existing runtime state into Alembic".
    pass
