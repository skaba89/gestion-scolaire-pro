"""Audit failure isolation and the platform audit trail (PostgreSQL).

- log_audit(): a rejected audit row (here: RLS WITH CHECK, tenant row written
  with no tenant context under a NOBYPASSRLS role) is reported and rolled
  back to its SAVEPOINT — the caller's transaction stays usable and commits.
  The caller's own pending changes are flushed outside the savepoint: their
  errors propagate, they are never swallowed.
- platform_audit_logs (20261011_0001): append-only for non-owner roles.

End-to-end platform rows (tenant deletion survives the tenant, toggle):
test_platform_routes_rls_restricted_role.py.
"""
from __future__ import annotations

import importlib.util
import logging
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import get_test_client

get_test_client()  # app/config bootstrap, same as the other PostgreSQL test modules

from app.core.database import engine  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.utils.audit import log_audit, log_platform_audit  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL-specific (RLS, savepoints).")

RESTRICTED_ROLE = "test_audit_isolation_role"
RESTRICTED_PASSWORD = "test-only-audit-isolation-password"  # noqa: S105 — disposable, local test DB only
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261011_0001_platform_audit_logs.py"


def _uid() -> str:
    return str(uuid.uuid4())


@pytest.fixture(scope="module")
def restricted_sessionmaker():
    with engine.connect() as setup:
        setup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        setup.execute(text(
            f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
            "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
        ))
        setup.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
        setup.commit()
    url = make_url(engine.url).set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
    restricted = create_engine(url, poolclass=StaticPool)
    yield sessionmaker(bind=restricted, autocommit=False, autoflush=False)
    restricted.dispose()
    with engine.connect() as cleanup:
        cleanup.execute(text(f'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
        cleanup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        cleanup.commit()


def _make_tenant() -> str:
    tid = _uid()
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, 'École audit', :slug, 'primary', 'GN', true, '{}', now(), now())"
        ), {"id": tid, "slug": f"audit-iso-{tid[:8]}"})
    return tid


def test_rejected_audit_row_no_longer_aborts_the_callers_transaction(restricted_sessionmaker, caplog):
    tid = _make_tenant()
    marker = f"audit-iso-{_uid()[:8]}"
    with restricted_sessionmaker() as s, caplog.at_level(logging.ERROR, logger="app.utils.audit"):
        # No tenant context: the tenant-scoped audit row is rejected by RLS.
        log_audit(s, user_id=_uid(), tenant_id=tid, action="TEST", resource_type="TENANT", resource_id=tid)
        # ...yet the caller's transaction is still usable and commits.
        s.execute(text("UPDATE tenants SET city = :c WHERE id = :t"), {"c": marker, "t": tid})
        s.commit()
    assert any("Audit log NOT recorded" in r.getMessage() for r in caplog.records)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT city FROM tenants WHERE id = :t"), {"t": tid}).scalar() == marker
        assert conn.execute(text("SELECT count(*) FROM audit_logs WHERE resource_id = :t"), {"t": tid}).scalar() == 0


def test_callers_own_flush_errors_are_not_swallowed(restricted_sessionmaker):
    tid = _make_tenant()
    with engine.connect() as conn:
        slug = conn.execute(text("SELECT slug FROM tenants WHERE id = :t"), {"t": tid}).scalar()
    with restricted_sessionmaker() as s:
        # A duplicate slug pending in the caller's session: its error must
        # surface from log_audit's first flush, not be logged and dropped.
        s.add(Tenant(name="Doublon", slug=slug, type="primary", country="GN", is_active=True, settings={}))
        with pytest.raises(IntegrityError):
            log_audit(s, user_id=_uid(), tenant_id=tid, action="TEST", resource_type="TENANT")
        s.rollback()


def test_platform_audit_row_is_written_without_any_tenant_context(restricted_sessionmaker):
    target = _uid()
    with restricted_sessionmaker() as s:
        log_platform_audit(s, actor_user_id=_uid(), action="DELETE_TENANT", target_type="TENANT",
                           target_id=target, details={"name": "Université test"})
        s.commit()
    with engine.connect() as conn:
        assert conn.execute(
            text("SELECT count(*) FROM platform_audit_logs WHERE target_id = :t AND action = 'DELETE_TENANT'"),
            {"t": target},
        ).scalar() == 1


def test_platform_audit_logs_is_append_only_for_runtime_roles():
    spec = importlib.util.spec_from_file_location(MIGRATION.stem, MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    role = "test_platform_audit_dml_role"

    def privileges():
        with engine.connect() as conn:
            return {
                p: conn.execute(text("SELECT has_table_privilege(:r, 'public.platform_audit_logs', :p)"),
                                {"r": role, "p": p}).scalar()
                for p in ("SELECT", "INSERT", "UPDATE", "DELETE")
            }

    with engine.begin() as conn:
        conn.execute(text(f'DROP ROLE IF EXISTS "{role}"'))
        conn.execute(text(f'CREATE ROLE "{role}" NOLOGIN NOBYPASSRLS'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON platform_audit_logs TO "{role}"'))
    try:
        with engine.begin() as conn:
            migration.op = SimpleNamespace(get_bind=lambda: conn)
            migration.upgrade()  # idempotent: table exists, only the ACL pass runs
        assert privileges() == {"SELECT": True, "INSERT": True, "UPDATE": False, "DELETE": False}
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'REVOKE ALL ON platform_audit_logs FROM "{role}"'))
            conn.execute(text(f'DROP ROLE IF EXISTS "{role}"'))
