"""PostgreSQL tests for 20261009_0001 — constant-cost user -> tenant resolution.

Checked as a restricted runtime role (NOSUPERUSER NOBYPASSRLS, no tenant
context), like production:

- the SECURITY DEFINER resolvers return only the owning tenant id(s) and are
  safe against search_path hijacking;
- find_user_in_owner_tenant() finds users of any tenant, platform accounts,
  and both rows of a case-insensitive email collision, with a number of
  statements that does NOT grow with the number of tenants;
- the remaining tenant sweeps log when they get slow.

End-to-end /auth/login/ under the same kind of role:
test_auth_rls_restricted_role.py.
"""
from __future__ import annotations

import logging
import uuid

import pytest
from conftest import get_test_client

get_test_client()  # app/config bootstrap, same as the other PostgreSQL test modules

from app.core import database as db_module  # noqa: E402
from app.core.database import engine, find_user_in_owner_tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import create_engine, event, func, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL-specific (RLS, functions).")

RESTRICTED_ROLE = "test_user_tenant_resolution_role"
RESTRICTED_PASSWORD = "test-only-user-resolution-password"  # noqa: S105 — disposable, local test DB only
FUNCTIONS = (
    "public.resolve_user_tenants_by_login(text)",
    "public.resolve_user_tenants_by_email_ci(text)",
    "public.resolve_user_tenants_by_id(uuid)",
)


def _uid() -> str:
    return str(uuid.uuid4())


def _make_tenant(conn) -> str:
    tid = _uid()
    conn.execute(text(
        "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
        "VALUES (:id, 'Ecole resolution', :slug, 'primary', 'GN', true, '{}', now(), now())"
    ), {"id": tid, "slug": f"user-res-{tid[:8]}"})
    return tid


def _make_user(conn, tenant_id, email: str, username: str | None = None) -> str:
    uid = _uid()
    conn.execute(text(
        "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
        "mfa_enabled, must_change_password) VALUES (:id, :email, :username, :tid, 'x', true, now(), now(), false, false)"
    ), {"id": uid, "email": email, "username": username or f"u-{uid[:12]}", "tid": tenant_id})
    return uid


@pytest.fixture(scope="module")
def dataset():
    tag = uuid.uuid4().hex[:8]
    with engine.begin() as conn:
        tenants = [_make_tenant(conn) for _ in range(3)]
        data = {
            "tenants": tenants,
            "tenant_user_email": f"third-{tag}@example.test",
            "tenant_user_name": f"third-{tag}",
            "platform_email": f"platform-{tag}@example.test",
            "ci_lower": f"case-{tag}@example.test",
            "ci_upper": f"CASE-{tag}@example.test",
        }
        data["tenant_user_id"] = _make_user(conn, tenants[2], data["tenant_user_email"], data["tenant_user_name"])
        data["platform_user_id"] = _make_user(conn, None, data["platform_email"])
        data["ci_lower_id"] = _make_user(conn, tenants[0], data["ci_lower"])
        data["ci_upper_id"] = _make_user(conn, tenants[1], data["ci_upper"])
    return data


@pytest.fixture(scope="module")
def restricted_sessionmaker():
    with engine.connect() as setup:
        setup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        setup.execute(text(
            f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
            "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
        ))
        setup.execute(text(f'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
        setup.commit()
    url = make_url(engine.url).set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
    restricted = create_engine(url, poolclass=StaticPool)
    yield sessionmaker(bind=restricted, autocommit=False, autoflush=False)
    restricted.dispose()
    with engine.connect() as cleanup:
        cleanup.execute(text(f'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
        cleanup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        cleanup.commit()


def _resolve(session, fn: str, value) -> list:
    cast = "CAST(:v AS uuid)" if fn == "by_id" else ":v"
    return [r[0] for r in session.execute(text(f"SELECT tenant_id FROM public.resolve_user_tenants_{fn}({cast})"), {"v": value})]


def test_functions_are_security_definer_with_pinned_search_path_and_bypassing_owner():
    with engine.connect() as conn:
        for signature in FUNCTIONS:
            secdef, config, owner_bypass = conn.execute(text(
                "SELECT p.prosecdef, p.proconfig, r.rolsuper OR r.rolbypassrls FROM pg_proc p "
                "JOIN pg_roles r ON r.oid = p.proowner WHERE p.oid = CAST(:s AS regprocedure)"
            ), {"s": signature}).one()
            assert secdef, signature
            assert config == ["search_path=pg_catalog, public"], signature
            assert owner_bypass, signature
        assert conn.execute(text("SELECT to_regclass('public.ix_users_email_lower')")).scalar() is not None


def test_resolvers_return_only_owning_tenant_ids(dataset, restricted_sessionmaker):
    with restricted_sessionmaker() as s:
        t = dataset["tenants"]
        assert _resolve(s, "by_login", dataset["tenant_user_email"]) == [uuid.UUID(t[2])]
        assert _resolve(s, "by_login", dataset["tenant_user_name"]) == [uuid.UUID(t[2])]
        assert _resolve(s, "by_login", dataset["platform_email"]) == [None]
        assert _resolve(s, "by_login", "nobody-here@example.test") == []
        assert sorted(map(str, _resolve(s, "by_email_ci", dataset["ci_lower"].upper()))) == sorted([t[0], t[1]])
        assert _resolve(s, "by_id", dataset["tenant_user_id"]) == [uuid.UUID(t[2])]
        assert _resolve(s, "by_id", _uid()) == []
        columns = s.execute(text("SELECT * FROM public.resolve_user_tenants_by_login(:v)"), {"v": dataset["tenant_user_email"]}).keys()
        assert list(columns) == ["tenant_id"]
        # Without the function, the restricted role sees nothing (strict RLS, no context).
        assert s.execute(text("SELECT count(*) FROM users WHERE email = :e"), {"e": dataset["tenant_user_email"]}).scalar() == 0


def test_resolver_ignores_a_shadowing_users_table(dataset, restricted_sessionmaker):
    """search_path hijack: a caller-created `users` in a schema it owns must
    not be read by the SECURITY DEFINER function."""
    schema = f"hijack_{uuid.uuid4().hex[:8]}"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.execute(text(f'CREATE TABLE "{schema}".users (email text, username text, tenant_id uuid, id uuid)'))
        conn.execute(text(f"INSERT INTO \"{schema}\".users VALUES ('evil@example.test', 'evil', :t, :i)"),
                     {"t": dataset["tenants"][0], "i": _uid()})
        conn.execute(text(f'GRANT USAGE ON SCHEMA "{schema}" TO "{RESTRICTED_ROLE}"'))
        conn.execute(text(f'GRANT SELECT ON "{schema}".users TO "{RESTRICTED_ROLE}"'))
    try:
        with restricted_sessionmaker() as s:
            s.execute(text(f'SET search_path = "{schema}", public'))
            assert _resolve(s, "by_login", "evil@example.test") == []
            s.rollback()
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


def _count_statements(session_factory, fn):
    session = session_factory()
    counter = {"n": 0}
    bind = session.get_bind()

    def _count(*_args, **_kwargs):
        counter["n"] += 1

    event.listen(bind, "before_cursor_execute", _count)
    try:
        result = fn(session)
    finally:
        event.remove(bind, "before_cursor_execute", _count)
        session.close()
    return result, counter["n"]


def test_helper_finds_users_with_constant_statement_count(dataset, restricted_sessionmaker):
    email = dataset["tenant_user_email"]

    def lookup(s):
        return find_user_in_owner_tenant(
            s, lambda q: q.query(User).filter(User.email == email).first(), by="login", value=email
        )

    found, before = _count_statements(restricted_sessionmaker, lookup)
    assert found is not None and str(found.id) == dataset["tenant_user_id"]

    with engine.begin() as conn:
        for _ in range(10):
            _make_tenant(conn)
    found_again, after = _count_statements(restricted_sessionmaker, lookup)
    assert str(found_again.id) == dataset["tenant_user_id"]
    assert after == before, f"statement count grew with tenants: {before} -> {after}"
    assert before <= 6


def test_helper_finds_platform_account_and_both_case_variants(dataset, restricted_sessionmaker):
    with restricted_sessionmaker() as s:
        platform = find_user_in_owner_tenant(
            s, lambda q: q.query(User).filter(User.email == dataset["platform_email"]).first(),
            by="login", value=dataset["platform_email"],
        )
        assert platform is not None and str(platform.id) == dataset["platform_user_id"]

        by_id = find_user_in_owner_tenant(
            s, lambda q: q.query(User).filter(User.id == dataset["tenant_user_id"]).first(),
            by="user_id", value=dataset["tenant_user_id"],
        )
        assert by_id is not None

        upper = dataset["ci_upper"]
        exact_upper = find_user_in_owner_tenant(
            s, lambda q: q.query(User).filter(User.email == upper).first(), by="email_ci", value=upper,
        )
        assert exact_upper is not None and str(exact_upper.id) == dataset["ci_upper_id"]

        any_case = find_user_in_owner_tenant(
            s, lambda q: q.query(User).filter(func.lower(User.email) == dataset["ci_lower"]).first(),
            by="email_ci", value=dataset["ci_lower"],
        )
        assert any_case is not None

        assert find_user_in_owner_tenant(
            s, lambda q: q.query(User).filter(User.email == "nobody@example.test").first(),
            by="login", value="nobody@example.test",
        ) is None
        assert find_user_in_owner_tenant(s, lambda q: None, by="user_id", value="not-a-uuid") is None
        # Context always reset to "no tenant" afterwards.
        assert s.info.get(db_module._RLS_TENANT_KEY) == ""


def test_unknown_resolver_is_rejected(restricted_sessionmaker):
    with restricted_sessionmaker() as s, pytest.raises(ValueError):
        find_user_in_owner_tenant(s, lambda q: None, by="phone", value="x")


def test_slow_tenant_sweep_is_logged(caplog, monkeypatch, restricted_sessionmaker):
    from app.core.tenant_resolution import collect_across_all_tenants

    monkeypatch.setattr(db_module, "SLOW_TENANT_SWEEP_SECONDS", 0.0)
    with caplog.at_level(logging.WARNING, logger="app.core.database"), restricted_sessionmaker() as s:
        collect_across_all_tenants(s, lambda q: [])
    assert any("Slow tenant sweep: collect_across_all_tenants" in r.getMessage() for r in caplog.records)
