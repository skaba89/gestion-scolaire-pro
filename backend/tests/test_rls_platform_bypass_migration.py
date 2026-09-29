"""Tests for the RLS platform-bypass NULL-vs-empty-string fix -
alembic/versions/20260929_0001_nullif_rls_platform_bypass.py

Found while building worker RLS tenant-context propagation
(docs/POSTGRES_APP_ROLE.md, ARQ workers pass). Several RLS policies grant
platform-wide visibility with no tenant context via:

    (tenant_id)::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_tenant_id', true) IS NULL

Migration 20260928_0001 already proved that
`set_config('app.current_tenant_id', NULL, false)` resets a custom GUC to
an empty string, not SQL NULL. This means `current_setting(...) IS NULL`
reads FALSE forever on any connection that has run that reset even once -
silently defeating the bypass above (no crash, just zero visible rows) on
every pooled connection the moment it has served one tenant-scoped
request or job. `_job_finished()` in app/workers/tasks.py, which updates a
job's own status row by id with no tenant filter, is the most visible
victim: it would silently stop finding its own row, leaving jobs stuck at
RUNNING forever.

Same testing approach as test_rls_current_tenant_uuid_cast_migration.py: a
superuser bypasses RLS unconditionally, so this suite's own connection
proves nothing about whether the policy itself is correct. This module
creates its own disposable, genuinely restricted role.
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
    "20260929_0001_nullif_rls_platform_bypass.py",
)

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)

RESTRICTED_ROLE = "test_rls_platform_bypass_restricted_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("nullif_rls_platform_bypass_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationModule:
    def test_revision_chain_is_correct(self):
        module = _load_migration_module()
        assert module.revision == "20260929_0001"
        assert module.down_revision == "20260928_0001"

    def test_downgrade_is_a_deliberate_no_op(self):
        module = _load_migration_module()
        assert callable(module.downgrade)
        assert callable(module.upgrade)
        module.downgrade()  # must not raise, needs no connection


@requires_postgres
class TestPolicyTextIsFixedInDb:
    def test_jobs_policy_no_longer_uses_bare_current_setting_is_null(self):
        with engine.connect() as conn:
            qual = conn.execute(text(
                "SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs'"
            )).scalar()
        assert qual is not None
        assert "NULLIF" in qual
        assert "current_setting('app.current_tenant_id'::text, true) IS NULL" not in qual


@requires_postgres
class TestJobStatusSurvivesPoolReuse:
    """The scenario this migration actually exists for: _job_finished()
    must still find a tenant-scoped job's own row after this connection
    has already reset app.current_tenant_id to NULL once - exactly what
    happens on every connection platform_db_session() touches."""

    @pytest.fixture(scope="class")
    @classmethod
    def restricted_connection(cls):
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

    def test_tenant_scoped_job_row_visible_after_a_prior_null_reset_on_the_same_connection(
        self, restricted_connection,
    ):
        tenant_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        with engine.connect() as admin_conn:
            admin_conn.execute(text(
                "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
                "VALUES (:id, 'Platform bypass test', :slug, 'primary', 'GN', true, '{}', now(), now())"
            ), {"id": tenant_id, "slug": f"rls-platform-bypass-{tenant_id[:8]}"})
            admin_conn.execute(text(
                "INSERT INTO jobs (id, tenant_id, job_type, status, payload, started_at) "
                "VALUES (:id, :tid, 'test_tenant_job', 'RUNNING', '{}', now())"
            ), {"id": job_id, "tid": tenant_id})
            admin_conn.commit()

        with restricted_connection.cursor() as cur:
            # Exactly what platform_db_session() does: reset the context to
            # "no tenant" on this connection, once, before this test's own
            # _job_finished()-equivalent lookup runs.
            cur.execute("SELECT set_config('app.current_tenant_id', %s, false)", (None,))
            cur.execute("SELECT id FROM jobs WHERE id = %s", (job_id,))
            row = cur.fetchone()
        assert row is not None, (
            "job row with a real tenant_id became invisible after a prior "
            "NULL context reset on the same connection - the platform "
            "bypass regressed"
        )
