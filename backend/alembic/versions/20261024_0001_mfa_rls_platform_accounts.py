"""NULL-safe RLS policies on `email_otps` and `mfa_backup_codes` for platform accounts.

Revision ID: 20261024_0001
Revises: 20261011_0001
Create Date: 2026-10-24

Both policies compared `tenant_id::text = COALESCE(current_setting(...), '')`.
A platform account (SUPER_ADMIN, MINISTRY_ADMIN… — `users.tenant_id IS NULL`)
never matches that: `NULL::text = ''` is NULL, not true. Under the
restricted runtime role (NOSUPERUSER NOBYPASSRLS) such an account could
therefore neither request an email OTP (INSERT refused by WITH CHECK, HTTP
500) nor generate, list or use backup codes. A superuser bypasses RLS, which
is why this never showed while the app connected as the owner role.

The policies are recreated under the SAME names with the NULL-safe form the
`users` policy already uses:

    NOT (tenant_id IS DISTINCT FROM NULLIF(current_setting(...), '')::uuid)

Isolation is unchanged for tenant data: under tenant A's context only tenant
A's rows match, exactly as before; under "no tenant" context only rows whose
tenant_id IS NULL (platform accounts' own data) match — previously nothing did.

Backward compatible: same tables, same policy names, no column change; the
previous release keeps working against it.
"""
from __future__ import annotations

import hashlib

from alembic import op
from sqlalchemy import text

revision = "20261024_0001"
down_revision = "20261011_0001"
branch_labels = None
depends_on = None

backward_compatible = True

TENANT_SETTING = "app.current_tenant_id"

# Names produced by the migrations that created these policies
# (20260927_0001 for the child table, 20260930_0001 for mfa_backup_codes).
EMAIL_OTPS_POLICY = "schoolflow_tenant_child_" + hashlib.sha256(b"email_otps").hexdigest()[:16]
BACKUP_CODES_POLICY = "schoolflow_tenant_" + hashlib.sha256(b"mfa_backup_codes").hexdigest()[:16]

_NULL_SAFE_TENANT = (
    f"NOT (tenant_id IS DISTINCT FROM NULLIF(current_setting('{TENANT_SETTING}', true), '')::uuid)"
)
_LEGACY_TENANT = f"tenant_id::text = COALESCE(current_setting('{TENANT_SETTING}', true), '')"

NEW_EXPRESSIONS = {
    ("email_otps", EMAIL_OTPS_POLICY): f"user_id IN (SELECT id FROM public.users WHERE {_NULL_SAFE_TENANT})",
    ("mfa_backup_codes", BACKUP_CODES_POLICY): _NULL_SAFE_TENANT,
}
LEGACY_EXPRESSIONS = {
    ("email_otps", EMAIL_OTPS_POLICY): f"user_id IN (SELECT id FROM public.users WHERE {_LEGACY_TENANT})",
    ("mfa_backup_codes", BACKUP_CODES_POLICY): _LEGACY_TENANT,
}


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


def _apply(expressions: dict[tuple[str, str], str]) -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    quote = conn.dialect.identifier_preparer.quote
    for (table_name, policy_name), expression in expressions.items():
        if not _table_exists(conn, table_name):
            continue
        qualified_table = f"{quote('public')}.{quote(table_name)}"
        policy = quote(policy_name)
        # RLS itself (ENABLE + FORCE) was set by the creating migrations and
        # is left untouched; only the policy expression changes.
        conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {qualified_table}"))
        conn.execute(
            text(
                f"CREATE POLICY {policy} ON {qualified_table} "
                "AS PERMISSIVE FOR ALL TO PUBLIC "
                f"USING ({expression}) WITH CHECK ({expression})"
            )
        )


def upgrade() -> None:
    _apply(NEW_EXPRESSIONS)


def downgrade() -> None:
    _apply(LEGACY_EXPRESSIONS)
