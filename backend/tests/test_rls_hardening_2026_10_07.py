"""PostgreSQL tests for the 2026-10-07 RLS hardening migrations.

- 20261007_0001: `resolve_payment_tenant(text)` — constant-cost, SECURITY
  DEFINER lookup used by the unauthenticated payment webhooks instead of a
  per-tenant scan. Checked as the restricted runtime role (NOBYPASSRLS, no
  tenant context): it must find the owning tenant, return NULL for an
  unknown reference, expose nothing but the tenant_id, and be safe against
  search_path hijacking.
- 20261007_0002: dormant `superadmin_bypass_*` policies (keyed on
  `app.is_superadmin`, never set by the app) are dropped; the
  tenant_isolation policies are left intact.

The end-to-end webhook behaviour under the restricted role is covered by
test_public_routes_rls_restricted_role.py.
"""
from __future__ import annotations

import importlib.util
import uuid
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import get_test_client

get_test_client()  # app/config bootstrap, same as the other PostgreSQL test modules

from app.core.database import engine  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL-specific (RLS, functions).")

RESTRICTED_ROLE = "test_rls_hardening_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only
VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _uid() -> str:
    return str(uuid.uuid4())


def _load_migration(filename: str):
    spec = importlib.util.spec_from_file_location(filename[:-3], VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def payment_ref():
    tid, sid, ref = _uid(), _uid(), f"PAY-HARDEN-{_uid()[:8]}"
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, 'École durcissement', :slug, 'primary', 'GN', true, '{}', now(), now())"
        ), {"id": tid, "slug": f"rls-harden-{tid[:8]}"})
        conn.execute(text(
            "INSERT INTO students (id, tenant_id, registration_number, first_name, last_name, date_of_birth, gender, "
            "created_at, updated_at) VALUES (:id, :tid, :reg, 'Eleve', 'Test', '2015-01-01', 'MALE', now(), now())"
        ), {"id": sid, "tid": tid, "reg": f"REG-H-{sid[:8]}"})
        conn.execute(text(
            "INSERT INTO payments (id, tenant_id, student_id, amount, payment_date, payment_method, status, reference, "
            "created_at, updated_at) VALUES (:id, :tid, :sid, 500, :d, 'MOBILE_MONEY', 'PENDING', :ref, now(), now())"
        ), {"id": _uid(), "tid": tid, "sid": sid, "d": date.today(), "ref": ref})
    return {"tenant_id": tid, "reference": ref}


@pytest.fixture(scope="module")
def restricted_engine():
    with engine.connect() as setup:
        setup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        setup.execute(text(
            f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
            "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
        ))
        setup.execute(text(f'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
        setup.commit()
    url = make_url(engine.url.render_as_string(hide_password=False)).set(
        username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD
    )
    eng = create_engine(url.render_as_string(hide_password=False), poolclass=StaticPool)
    yield eng
    eng.dispose()
    with engine.connect() as cleanup:
        cleanup.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
        cleanup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        cleanup.commit()


# -- 20261007_0001: resolve_payment_tenant ----------------------------------------

def test_function_is_security_definer_with_pinned_search_path():
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT p.prosecdef, p.provolatile, p.proconfig, pg_get_function_result(p.oid) "
            "FROM pg_proc p WHERE p.oid = 'public.resolve_payment_tenant(text)'::regprocedure"
        )).one()
    secdef, volatility, config, result_type = row
    assert secdef is True
    assert volatility == "s", "must be STABLE"
    assert any(c.startswith("search_path=") and "pg_catalog" in c for c in (config or [])), config
    assert result_type == "uuid", "must expose the tenant_id only"


def test_restricted_role_finds_owning_tenant_without_context(restricted_engine, payment_ref):
    with restricted_engine.connect() as conn:
        conn.execute(text("SELECT set_config('app.current_tenant_id', '', false)"))
        # Direct access is hidden by RLS (no tenant context)...
        direct = conn.execute(
            text("SELECT count(*) FROM payments WHERE reference = :r"), {"r": payment_ref["reference"]}
        ).scalar()
        # ...but the function resolves the owner in one call.
        owner = conn.execute(
            text("SELECT public.resolve_payment_tenant(:r)"), {"r": payment_ref["reference"]}
        ).scalar()
    assert direct == 0, "test setup: the restricted role must not see payments without context"
    assert str(owner) == payment_ref["tenant_id"]


def test_unknown_reference_returns_null(restricted_engine):
    with restricted_engine.connect() as conn:
        assert conn.execute(text("SELECT public.resolve_payment_tenant(:r)"), {"r": f"NOPE-{_uid()}"}).scalar() is None


# -- 20261007_0002: dormant superadmin_bypass policies ----------------------------

def test_drop_migration_removes_bypass_policies_and_keeps_tenant_isolation():
    table = f"rls_harden_probe_{_uid()[:8]}"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE TABLE "{table}" (id uuid PRIMARY KEY, tenant_id uuid)'))
        conn.execute(text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
        conn.execute(text(
            f'CREATE POLICY "tenant_isolation_{table}" ON "{table}" AS PERMISSIVE FOR ALL TO PUBLIC '
            "USING (tenant_id::text = COALESCE(current_setting('app.current_tenant_id', true), ''))"
        ))
        conn.execute(text(
            f'CREATE POLICY "superadmin_bypass_{table}" ON "{table}" AS PERMISSIVE FOR ALL TO PUBLIC '
            "USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true')"
        ))
    try:
        migration = _load_migration("20261007_0002_drop_dormant_superadmin_bypass_policies.py")
        with engine.begin() as conn:
            migration.op = SimpleNamespace(get_bind=lambda: conn)
            migration.upgrade()
        with engine.connect() as conn:
            names = {r[0] for r in conn.execute(text("SELECT policyname FROM pg_policies WHERE tablename = :t"), {"t": table})}
            remaining_superadmin = conn.execute(text(
                "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND qual LIKE '%app.is_superadmin%'"
            )).scalar()
        assert names == {f"tenant_isolation_{table}"}
        assert remaining_superadmin == 0
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}"'))
