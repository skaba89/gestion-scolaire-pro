"""Tests for the RLS `::uuid` cast / NULL-handling fix -
alembic/versions/20260928_0001_nullif_rls_current_tenant_uuid_cast.py

Found while due-diligence-testing the restricted non-superuser
application role (docs/POSTGRES_APP_ROLE.md, PR #259): every tenant
policy created by 20260224_0730_fdb89a2e3b4d_enable_rls.py does

    USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)

assuming `set_config('app.current_tenant_id', NULL, false)` clears the
setting to SQL NULL. Confirmed against a real PostgreSQL 16 instance
that it does not - it resets a custom GUC to an empty string - so the
cast crashed on every no-tenant request (SUPER_ADMIN, /auth/bootstrap/,
...), and even after guarding the cast, plain `=` still rejected a
genuinely tenant-less row (`tenant_id IS NULL`, e.g. the SUPER_ADMIN
account itself) because `NULL = NULL` is NULL, not TRUE.

Same testing approach as test_rls_child_tables_without_tenant_id.py: a
superuser bypasses RLS unconditionally regardless of ENABLE/FORCE ROW
LEVEL SECURITY, so this suite's own connection (superuser both in CI's
postgres:16 service and local dev) would prove nothing about whether
the policy itself is correct. This module creates its own disposable,
genuinely restricted role (NOSUPERUSER NOBYPASSRLS) to exercise it.
"""
from __future__ import annotations

import importlib.util
import os
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import engine  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

MIGRATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "alembic", "versions",
    "20260928_0001_nullif_rls_current_tenant_uuid_cast.py",
)

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)

RESTRICTED_ROLE = "test_rls_uuid_cast_restricted_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("nullif_rls_current_tenant_uuid_cast_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationModule:
    def test_revision_chain_is_correct(self):
        module = _load_migration_module()
        assert module.revision == "20260928_0001"
        assert module.down_revision == "20260927_0001"

    def test_downgrade_is_a_deliberate_no_op(self):
        """Reverting would reintroduce the crash/rejection this migration
        fixes - downgrade() must exist and do nothing."""
        module = _load_migration_module()
        assert callable(module.downgrade)
        assert callable(module.upgrade)
        module.downgrade()  # must not raise, needs no connection


@requires_postgres
class TestPolicyTextIsFixedInDb:
    """Pure catalog check - proves the migration actually ran and rewrote
    the users policy, independent of the functional tests below."""

    def test_users_policy_no_longer_uses_plain_equality_on_bare_current_setting(self):
        with engine.connect() as conn:
            qual = conn.execute(text(
                "SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'"
            )).scalar()
        assert qual is not None
        assert "NULLIF" in qual
        assert "IS DISTINCT FROM" in qual  # Postgres renders "IS NOT DISTINCT FROM" as "NOT (... IS DISTINCT FROM ...)"


@requires_postgres
class TestUuidCastAndNullHandling:
    @pytest.fixture(scope="class")
    @classmethod
    def restricted_connection(cls):
        """A raw psycopg connection authenticated as a disposable NOSUPERUSER,
        NOBYPASSRLS role - the only way to actually exercise these RLS
        policies rather than bypass them."""
        import psycopg

        with engine.connect() as setup_conn:
            try:
                setup_conn.execute(text(
                    f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'
                ))
                setup_conn.commit()
            except Exception:
                setup_conn.rollback()
            setup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            setup_conn.execute(text(
                f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
                "NOSUPERUSER NOBYPASSRLS"
            ))
            setup_conn.execute(text(
                f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'
            ))
            setup_conn.commit()

        url = make_url(str(engine.url))
        conn = psycopg.connect(
            host=url.host, port=url.port or 5432, dbname=url.database,
            user=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD,
        )
        conn.autocommit = True

        with conn.cursor() as cur:
            cur.execute("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = %s", (RESTRICTED_ROLE,))
            is_super, bypasses_rls = cur.fetchone()
            assert not is_super, "test setup bug: restricted role is a superuser"
            assert not bypasses_rls, "test setup bug: restricted role has BYPASSRLS"

        yield conn

        conn.close()
        with engine.connect() as cleanup_conn:
            cleanup_conn.execute(text(
                f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'
            ))
            cleanup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            cleanup_conn.commit()

    @staticmethod
    def _set_tenant(conn, tenant_id: str | None) -> None:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_tenant_id', %s, false)", (tenant_id,))

    @staticmethod
    def _make_tenant(name: str) -> str:
        tenant_id = str(uuid.uuid4())
        with engine.connect() as conn:
            conn.execute(text(
                "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
                "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
            ), {"id": tenant_id, "name": name, "slug": f"rls-uuid-cast-{tenant_id[:8]}"})
            conn.commit()
        return tenant_id

    def test_no_tenant_context_does_not_crash_the_cast(self, restricted_connection):
        """Bug #1: set_config(..., NULL, false) resets the GUC to '', not
        NULL - the policy's ::uuid cast used to raise
        InvalidTextRepresentation for this exact case. A plain SELECT with
        no tenant context (matching a SUPER_ADMIN / public-route request)
        must not raise."""
        self._set_tenant(restricted_connection, None)
        with restricted_connection.cursor() as cur:
            cur.execute("SELECT id FROM users LIMIT 1")  # must not raise
            cur.fetchall()

    def test_tenantless_row_is_insertable_with_no_tenant_context(self, restricted_connection):
        """Bug #2: even with the cast guarded, plain `=` rejected a
        genuinely tenant-less row (NULL = NULL is NULL, not TRUE) - this
        is exactly the SUPER_ADMIN account /auth/bootstrap/ creates."""
        self._set_tenant(restricted_connection, None)
        user_id = str(uuid.uuid4())
        with restricted_connection.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, tenant_id, email, username, first_name, last_name, "
                "password_hash, is_active, created_at, updated_at) "
                "VALUES (%s, NULL, %s, %s, 'Super', 'Admin', 'x', true, now(), now())",
                (user_id, f"{user_id[:8]}@rls-uuid-cast-test.example", f"sa-{user_id[:8]}"),
            )
            cur.execute("SELECT tenant_id FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
        assert row is not None
        assert row[0] is None

    def test_tenantless_row_stays_invisible_to_a_real_tenant_context(self, restricted_connection):
        """Isolation must not have regressed: IS NOT DISTINCT FROM makes a
        NULL-tenant row visible only under a NULL tenant context, never to
        an unrelated real tenant."""
        self._set_tenant(restricted_connection, None)
        user_id = str(uuid.uuid4())
        with restricted_connection.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, tenant_id, email, username, first_name, last_name, "
                "password_hash, is_active, created_at, updated_at) "
                "VALUES (%s, NULL, %s, %s, 'Super', 'Admin', 'x', true, now(), now())",
                (user_id, f"{user_id[:8]}@rls-uuid-cast-test.example", f"sa2-{user_id[:8]}"),
            )

        other_tenant = self._make_tenant("Autre tenant (RLS uuid cast test)")
        self._set_tenant(restricted_connection, other_tenant)
        with restricted_connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM users WHERE id = %s", (user_id,))
            (count,) = cur.fetchone()
        assert count == 0

    def test_cross_tenant_insert_is_still_rejected(self, restricted_connection):
        """Security regression guard: a request scoped to tenant A must
        still be refused when it tries to write a row for tenant B - the
        NULL-safe rewrite must not have loosened real cross-tenant
        isolation, only the tenant-less (NULL vs NULL) case."""
        tenant_a = self._make_tenant("Tenant A (RLS uuid cast test)")
        tenant_b = self._make_tenant("Tenant B (RLS uuid cast test)")
        self._set_tenant(restricted_connection, tenant_a)
        user_id = str(uuid.uuid4())
        with pytest.raises(Exception):
            with restricted_connection.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (id, tenant_id, email, username, first_name, last_name, "
                    "password_hash, is_active, created_at, updated_at) "
                    "VALUES (%s, %s, %s, %s, 'Cross', 'Tenant', 'x', true, now(), now())",
                    (user_id, tenant_b, f"{user_id[:8]}@rls-uuid-cast-test.example", f"xt-{user_id[:8]}"),
                )
