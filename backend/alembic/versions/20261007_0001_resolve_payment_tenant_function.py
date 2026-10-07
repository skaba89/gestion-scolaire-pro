"""Constant-cost lookup of a payment reference's tenant for gateway webhooks.

Revision ID: 20261007_0001
Revises: 20260930_0001
Create Date: 2026-10-07

Payment gateway webhooks (CinetPay, PayTech) are unauthenticated and start
with NO tenant context. Since #277 they found the payment's owning tenant by
trying every tenant in turn (one RLS-scoped query per tenant): correct and
isolation-safe, but its cost grows with the number of tenants — an
unauthenticated caller sending unknown references could make the database do
N queries per request (amplification, flagged P1 in the 2026-10-07 audit).

This function answers "which tenant owns payment reference X?" in a single
indexed lookup (payments.reference is unique + indexed), whatever the number
of tenants:

- SECURITY DEFINER: runs with its OWNER's rights — the migration role — so it
  can see `payments` despite FORCE ROW LEVEL SECURITY. The owner MUST be a
  superuser or have BYPASSRLS (true for `neondb_owner` in production and the
  CI superuser); upgrade() verifies it and fails loudly otherwise rather than
  leave webhooks silently unable to find any payment.
- `SET search_path = pg_catalog, public` + schema-qualified names: the classic
  SECURITY DEFINER hijack (a caller-controlled object shadowing `payments`)
  is not possible.
- Static SQL, STABLE, returns ONLY the tenant_id (uuid) — no other column of
  `payments` is reachable through it.
- EXECUTE granted to PUBLIC: runtime role names differ per environment
  (schoolflow_api/schoolflow_worker on Neon, schoolflow_app on Azure, test
  roles in CI). What it reveals — "reference -> tenant id" — is exactly what
  the webhook flow already needs and discloses to nobody outside the DB.

The webhook then enters that tenant's RLS context and does everything else
(gateway verification, confirmation) strictly under it, unchanged.

SQLite: no RLS, no functions — no-op (the code keeps a plain query there).
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20261007_0001"
down_revision = "20260930_0001"
branch_labels = None
depends_on = None

_FUNCTION_SIGNATURE = "public.resolve_payment_tenant(text)"


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    conn.execute(text(
        """
        CREATE OR REPLACE FUNCTION public.resolve_payment_tenant(ref text)
        RETURNS uuid
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $fn$
            SELECT p.tenant_id
            FROM public.payments AS p
            WHERE p.reference = ref
            LIMIT 1
        $fn$
        """
    ))
    conn.execute(text(f"COMMENT ON FUNCTION {_FUNCTION_SIGNATURE} IS "
                      "'Payment gateway webhooks: tenant owning a payment reference "
                      "(SECURITY DEFINER, returns the tenant_id only). See migration 20261007_0001.'"))
    conn.execute(text(f"GRANT EXECUTE ON FUNCTION {_FUNCTION_SIGNATURE} TO PUBLIC"))

    owner_can_bypass = conn.execute(text(
        """
        SELECT r.rolsuper OR r.rolbypassrls
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.oid = 'public.resolve_payment_tenant(text)'::regprocedure
        """
    )).scalar()
    if not owner_can_bypass:
        raise RuntimeError(
            "20261007_0001: the owner of public.resolve_payment_tenant(text) (the role running "
            "this migration) is neither superuser nor BYPASSRLS, so the function cannot see "
            "`payments` under FORCE ROW LEVEL SECURITY and payment webhooks would never find "
            "any payment. Run the migrations with the database owner/admin role "
            "(DATABASE_URL_MIGRATIONS, e.g. neondb_owner) — see docs/runbooks/appservice-migrations.md."
        )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    conn.execute(text(f"DROP FUNCTION IF EXISTS {_FUNCTION_SIGNATURE}"))
