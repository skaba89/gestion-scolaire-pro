"""Case-insensitive, platform-wide email uniqueness (migration 20261010_0001).

- User._normalize_email stores emails trimmed and lowercased (any dialect);
- the migration refuses to run while case-duplicates exist;
- duplicate checks made inside a tenant request see accounts of OTHER
  tenants (strict RLS used to hide them): a teacher CSV import reports the
  row instead of failing the whole batch on the unique index, and the
  request keeps its own tenant context for the writes that follow.
"""
from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import get_test_client

get_test_client()  # app/config bootstrap, same as the other test modules

from app.core import database as db_module  # noqa: E402
from app.core.database import engine  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

requires_postgres = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL-specific (RLS).")

RESTRICTED_ROLE = "test_email_uniqueness_role"
RESTRICTED_PASSWORD = "test-only-email-uniqueness-password"  # noqa: S105 — disposable, local test DB only
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261010_0001_unique_lower_email.py"


def _uid() -> str:
    return str(uuid.uuid4())


def _make_tenant(conn) -> str:
    tid = _uid()
    conn.execute(text(
        "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
        "VALUES (:id, 'Ecole email', :slug, 'primary', 'GN', true, '{}', now(), now())"
    ), {"id": tid, "slug": f"email-uniq-{tid[:8]}"})
    return tid


def _make_user(conn, tenant_id, email: str) -> str:
    uid = _uid()
    conn.execute(text(
        "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
        "mfa_enabled, must_change_password) VALUES (:id, :email, :username, :tid, 'x', true, now(), now(), false, false)"
    ), {"id": uid, "email": email, "username": f"u-{uid[:12]}", "tid": tenant_id})
    return uid


# ── B. normalization at write time (every dialect) ─────────────────────────

def test_email_is_stored_trimmed_and_lowercased():
    user = User(email="  Jane.DOE@Example.ORG ", username="jane")
    assert user.email == "jane.doe@example.org"
    user.email = "OTHER@Example.org"
    assert user.email == "other@example.org"


# ── A. migration pre-check ─────────────────────────────────────────────────

@requires_postgres
def test_migration_refuses_existing_case_duplicates():
    spec = importlib.util.spec_from_file_location(MIGRATION.stem, MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    tag = uuid.uuid4().hex[:8]
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            conn.execute(text("DROP INDEX IF EXISTS public.uq_users_email_lower"))
            _make_user(conn, None, f"dup-{tag}@example.test")
            _make_user(conn, None, f"DUP-{tag}@example.test")
            migration.op = SimpleNamespace(get_bind=lambda: conn)
            with pytest.raises(RuntimeError, match="shared by several accounts"):
                migration.upgrade()
        finally:
            trans.rollback()  # DDL is transactional: the index is back
    with engine.connect() as conn:
        assert conn.execute(text("SELECT to_regclass('public.uq_users_email_lower')")).scalar() is not None


# ── C. duplicate checks across tenants, under a restricted role ────────────

@pytest.fixture(scope="module")
def restricted_sessionmaker():
    with engine.connect() as setup:
        setup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        setup.execute(text(
            f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
            "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
        ))
        setup.execute(text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
        setup.commit()
    url = make_url(engine.url).set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
    restricted = create_engine(url, poolclass=StaticPool)
    yield sessionmaker(bind=restricted, autocommit=False, autoflush=False)
    restricted.dispose()
    with engine.connect() as cleanup:
        cleanup.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
        cleanup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        cleanup.commit()


@requires_postgres
def test_lookup_sees_other_tenants_and_keeps_the_request_context(restricted_sessionmaker):
    from app.core.tenant_resolution import find_user_by_email_in_any_tenant

    tag = uuid.uuid4().hex[:8]
    with engine.begin() as conn:
        tenant_a, tenant_b = _make_tenant(conn), _make_tenant(conn)
        owner_id = _make_user(conn, tenant_b, f"taken-{tag}@example.test")

    with restricted_sessionmaker() as s:
        db_module.switch_tenant_context(s, tenant_a)
        # A plain query under tenant A's context does not see tenant B's account...
        assert s.query(User).filter(User.email == f"taken-{tag}@example.test").first() is None
        # ...the platform-wide lookup does, whatever the case, and tenant A's
        # context is still in force afterwards.
        found = find_user_by_email_in_any_tenant(s, f" TAKEN-{tag}@Example.test ")
        assert found is not None and str(found.id) == owner_id and str(found.tenant_id) == tenant_b
        assert s.execute(text("SELECT current_setting('app.current_tenant_id', true)")).scalar() == tenant_a
        assert find_user_by_email_in_any_tenant(s, f"free-{tag}@example.test") is None
        assert find_user_by_email_in_any_tenant(s, "  ") is None


@requires_postgres
def test_teacher_import_reports_other_tenants_email_and_keeps_going(restricted_sessionmaker):
    from app.services.teacher_import import run_teacher_import

    tag = uuid.uuid4().hex[:8]
    with engine.begin() as conn:
        tenant_a, tenant_b = _make_tenant(conn), _make_tenant(conn)
        _make_user(conn, tenant_b, f"teacher-b-{tag}@example.test")

    rows = [
        {"first_name": "Awa", "last_name": "Camara", "email": f"Teacher-B-{tag}@example.test"},
        {"first_name": "Moussa", "last_name": "Diallo", "email": f"teacher-new-{tag}@example.test"},
    ]
    with restricted_sessionmaker() as s:
        db_module.switch_tenant_context(s, tenant_a)
        result = run_teacher_import(s, tenant_a, ["first_name", "last_name", "email"], rows, skip_errors=True)
        s.commit()

    assert result["created"] == 1, result
    assert result["skipped"] == 1
    assert result["error_rows"][0]["row"] == 2
    assert "existe déjà" in result["error_rows"][0]["error"]
    with engine.connect() as conn:
        created_tenant = conn.execute(
            text("SELECT tenant_id FROM users WHERE email = :e"), {"e": f"teacher-new-{tag}@example.test"}
        ).scalar()
    assert str(created_tenant) == tenant_a
