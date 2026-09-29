"""PostgreSQL integration tests for worker RLS tenant-context propagation
(app/core/database.py::worker_db_session/platform_db_session/
switch_tenant_context/reset_tenant_context, and their use in
app/workers/tasks.py) - the ARQ-workers security pass described in
docs/POSTGRES_APP_ROLE.md.

Why this file exists: HTTP requests get their RLS tenant context from
TenantMiddleware + get_db() on every request. ARQ workers have no HTTP
cycle, so several jobs used to open `SessionLocal()` directly with no
tenant context at all - invisible under a superuser/BYPASSRLS database
role, but a real production bug once the connection is genuinely
NOSUPERUSER NOBYPASSRLS (the `schoolflow_app` role from PR #259).

These tests run against a REAL PostgreSQL 16 instance using a disposable,
genuinely restricted role created inline (same pattern as
test_rls_current_tenant_uuid_cast_migration.py and
test_rls_platform_bypass_migration.py) - a superuser bypasses RLS
unconditionally, so testing against the admin/superuser engine would
prove nothing.

To exercise the ACTUAL worker_db_session()/platform_db_session()
functions (not a reimplementation of them) against that restricted role,
this file monkeypatches the module-level `SessionLocal` name inside
app.core.database for the duration of each test to a sessionmaker bound
to a restricted-role engine. worker_db_session()/platform_db_session()
call `SessionLocal()` by looking up that name in their own module's
globals at call time, so this swap exercises the real code path end to
end - including one call that runs an actual app/workers/tasks.py job
function (purge_expired_idempotency_keys), not just the bare helper.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from conftest import get_test_client

client = get_test_client()

import app.core.database as db_module  # noqa: E402
from app.core.database import (  # noqa: E402
    TenantContextError,
    engine,
    platform_db_session,
    reset_tenant_context,
    switch_tenant_context,
    worker_db_session,
)
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)

RESTRICTED_ROLE = "test_worker_rls_restricted_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only


def _make_tenant(admin_conn, name: str = "Worker RLS test tenant") -> str:
    tenant_id = str(uuid.uuid4())
    admin_conn.execute(
        text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
        ),
        {"id": tenant_id, "name": name, "slug": f"worker-rls-{tenant_id[:8]}"},
    )
    return tenant_id


def _make_job(admin_conn, tenant_id: str | None, job_type: str = "test_job") -> str:
    job_id = str(uuid.uuid4())
    admin_conn.execute(
        text("INSERT INTO jobs (id, tenant_id, job_type, status) VALUES (:id, :tid, :jt, 'RUNNING')"),
        {"id": job_id, "tid": tenant_id, "jt": job_type},
    )
    return job_id


@requires_postgres
class TestWorkerRlsTenantContext:
    """All tests below share one disposable restricted role and one
    restricted-only SessionLocal, swapped into app.core.database for the
    duration of each test so worker_db_session()/platform_db_session()
    genuinely run as a NOSUPERUSER NOBYPASSRLS connection."""

    @pytest.fixture(scope="class")
    def restricted_role(self):
        with engine.connect() as setup_conn:
            try:
                setup_conn.execute(
                    text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"')
                )
                setup_conn.commit()
            except Exception:
                setup_conn.rollback()
            setup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            setup_conn.execute(
                text(
                    f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
                    "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
                )
            )
            setup_conn.execute(
                text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"')
            )
            setup_conn.commit()

        yield RESTRICTED_ROLE

        with engine.connect() as cleanup_conn:
            cleanup_conn.execute(
                text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"')
            )
            cleanup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            cleanup_conn.commit()

    @pytest.fixture
    def restricted_session_local(self, restricted_role, monkeypatch):
        """Swap app.core.database.SessionLocal for a sessionmaker bound to
        the restricted role, using a single-connection StaticPool so a
        test can deliberately force two worker_db_session()/
        platform_db_session() calls to reuse the exact same physical
        connection (the pool-contamination scenario)."""
        url = make_url(engine.url.render_as_string(hide_password=False))
        restricted_url = url.set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
        restricted_engine = create_engine(
            restricted_url.render_as_string(hide_password=False), poolclass=StaticPool
        )

        with restricted_engine.connect() as conn:
            is_super, bypasses_rls = conn.execute(
                text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            ).one()
            assert not is_super, "test setup bug: restricted role is a superuser"
            assert not bypasses_rls, "test setup bug: restricted role has BYPASSRLS"

        restricted_sessionmaker = sessionmaker(bind=restricted_engine, autocommit=False, autoflush=False)
        monkeypatch.setattr(db_module, "SessionLocal", restricted_sessionmaker)

        yield restricted_sessionmaker

        restricted_engine.dispose()

    # -- role validation (also covers exit-criteria item from task #33) ----

    def test_restricted_role_is_not_superuser_and_does_not_bypass_rls(self, restricted_role):
        url = make_url(engine.url.render_as_string(hide_password=False)).set(
            username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD
        )
        restricted_engine = create_engine(url.render_as_string(hide_password=False))
        try:
            with restricted_engine.connect() as conn:
                rolname, rolsuper, rolbypassrls = conn.execute(
                    text("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
                ).one()
                assert rolname == RESTRICTED_ROLE
                assert rolsuper is False
                assert rolbypassrls is False
        finally:
            restricted_engine.dispose()

    def test_restricted_role_cannot_run_ddl(self, restricted_role):
        url = make_url(engine.url.render_as_string(hide_password=False)).set(
            username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD
        )
        restricted_engine = create_engine(url.render_as_string(hide_password=False))
        try:
            with restricted_engine.connect() as conn:
                for stmt in (
                    "CREATE TABLE _ddl_probe (id int)",
                    "ALTER TABLE jobs ADD COLUMN _ddl_probe int",
                    "DROP TABLE jobs",
                ):
                    conn.rollback()
                    with pytest.raises(Exception):
                        conn.execute(text(stmt))
                        conn.commit()
                    conn.rollback()
        finally:
            restricted_engine.dispose()

    # -- tenant A / tenant B isolation --------------------------------------

    def test_tenant_a_reads_its_own_job(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A")
            job_a = _make_job(admin_conn, tenant_a)

        with worker_db_session(tenant_a) as db:
            row = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a}).fetchone()
        assert row is not None

    def test_tenant_a_cannot_read_tenant_bs_job(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (read)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (read)")
            job_b = _make_job(admin_conn, tenant_b)

        with worker_db_session(tenant_a) as db:
            row = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_b}).fetchone()
        assert row is None, "tenant A must never see tenant B's job row"

    def test_tenant_a_cannot_modify_tenant_bs_job(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (modify)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (modify)")
            job_b = _make_job(admin_conn, tenant_b)

        with worker_db_session(tenant_a) as db:
            result = db.execute(
                text("UPDATE jobs SET status = 'FAILED' WHERE id = :id"), {"id": job_b}
            )
            assert result.rowcount == 0, "tenant A must not be able to modify tenant B's job row"

        with engine.connect() as admin_conn:
            status = admin_conn.execute(
                text("SELECT status FROM jobs WHERE id = :id"), {"id": job_b}
            ).scalar()
        assert status == "RUNNING", "tenant B's row must be untouched"

    def test_tenant_a_cannot_delete_tenant_bs_job(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (delete)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (delete)")
            job_b = _make_job(admin_conn, tenant_b)

        with worker_db_session(tenant_a) as db:
            result = db.execute(text("DELETE FROM jobs WHERE id = :id"), {"id": job_b})
            assert result.rowcount == 0, "tenant A must not be able to delete tenant B's job row"

        with engine.connect() as admin_conn:
            row = admin_conn.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_b}).fetchone()
        assert row is not None, "tenant B's row must still exist"

    # -- fail-closed ---------------------------------------------------------

    def test_missing_tenant_id_fails_closed(self, restricted_session_local):
        with pytest.raises(TenantContextError):
            with worker_db_session(None):
                pytest.fail("worker_db_session(None) must never yield a session")

    def test_empty_tenant_id_fails_closed(self, restricted_session_local):
        with pytest.raises(TenantContextError):
            with worker_db_session(""):
                pytest.fail("worker_db_session('') must never yield a session")

    def test_invalid_tenant_id_fails_closed(self, restricted_session_local):
        with pytest.raises(TenantContextError):
            with worker_db_session("not-a-uuid"):
                pytest.fail("worker_db_session() must reject a non-UUID tenant_id")

    def test_nonexistent_tenant_id_fails_closed_with_no_leak(self, restricted_session_local):
        with engine.begin() as admin_conn:
            _make_job(admin_conn, None, job_type="platform_job_for_leak_check")

        fake_tenant = str(uuid.uuid4())
        with pytest.raises(TenantContextError):
            with worker_db_session(fake_tenant):
                pytest.fail("worker_db_session() must reject a tenant_id with no matching row")

    # -- connection pool non-contamination -----------------------------------

    def test_pool_reuse_does_not_leak_tenant_a_context_into_tenant_b(self, restricted_session_local):
        """Force two worker_db_session() calls to use the exact same
        physical connection (StaticPool == one connection total) and prove
        the second call's tenant B never sees anything set up for tenant A."""
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (pool)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (pool)")
            job_a = _make_job(admin_conn, tenant_a)
            job_b = _make_job(admin_conn, tenant_b)

        with worker_db_session(tenant_a) as db:
            row = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a}).fetchone()
            assert row is not None

        # Same StaticPool connection, different tenant - job A must now be
        # invisible and job B must be exactly what this session can see.
        with worker_db_session(tenant_b) as db:
            leaked = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a}).fetchone()
            assert leaked is None, "tenant A's context leaked into a reused connection for tenant B"
            own = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_b}).fetchone()
            assert own is not None

    def test_pool_reuse_platform_then_worker_does_not_leak(self, restricted_session_local):
        """platform_db_session() (no context) followed by worker_db_session()
        (tenant A) on the same reused connection must end with tenant A's
        context active, not a stale "no tenant" bypass."""
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (platform->worker)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (platform->worker)")
            job_b = _make_job(admin_conn, tenant_b)

        with platform_db_session() as db:
            db.execute(text("SELECT 1"))

        with worker_db_session(tenant_a) as db:
            leaked = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_b}).fetchone()
            assert leaked is None, "platform_db_session()'s bypass leaked into a subsequent worker_db_session()"

    # -- rollback / session lifecycle ----------------------------------------

    def test_exception_inside_worker_db_session_rolls_back(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (rollback)")
            job_a = _make_job(admin_conn, tenant_a)

        class _Boom(Exception):
            pass

        with pytest.raises(_Boom):
            with worker_db_session(tenant_a) as db:
                db.execute(text("UPDATE jobs SET status = 'FAILED' WHERE id = :id"), {"id": job_a})
                raise _Boom("simulated job failure mid-transaction")

        with engine.connect() as admin_conn:
            status = admin_conn.execute(
                text("SELECT status FROM jobs WHERE id = :id"), {"id": job_a}
            ).scalar()
        assert status == "RUNNING", "worker_db_session() must roll back on exception, not commit a partial write"

    def test_session_is_closed_after_exception(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (close)")

        captured = {}

        class _Boom(Exception):
            pass

        with pytest.raises(_Boom):
            with worker_db_session(tenant_a) as db:
                captured["db"] = db
                raise _Boom("simulated failure")

        # close() releases the connection back to the pool and ends the
        # transaction - it does not make the Session object itself raise on
        # reuse (SQLAlchemy would just open a fresh one), so the meaningful
        # assertion is that no transaction/connection is still held open.
        assert not captured["db"].in_transaction()

    def test_arq_retry_preserves_correct_tenant_across_attempts(self, restricted_session_local):
        """Simulates ARQ re-invoking a failed job: the same tenant_id must
        still resolve to the same tenant's context on the retry, and must
        not have been corrupted by the first (failed) attempt's cleanup."""
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (retry)")
            job_a = _make_job(admin_conn, tenant_a)

        class _Boom(Exception):
            pass

        with pytest.raises(_Boom):
            with worker_db_session(tenant_a) as db:
                db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a})
                raise _Boom("attempt 1 fails")

        # Retry: identical tenant_id, must still see its own tenant's data.
        with worker_db_session(tenant_a) as db:
            row = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a}).fetchone()
        assert row is not None, "retry with the same tenant_id must still resolve that tenant's context"

    # -- switch_tenant_context / reset_tenant_context (multi-tenant sweep jobs) --

    def test_switch_tenant_context_moves_between_tenants_on_one_session(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (switch)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (switch)")
            job_a = _make_job(admin_conn, tenant_a)
            job_b = _make_job(admin_conn, tenant_b)

        with platform_db_session() as db:
            switch_tenant_context(db, tenant_a)
            row_a = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a}).fetchone()
            leaked_b = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_b}).fetchone()
            assert row_a is not None
            assert leaked_b is None
            reset_tenant_context(db)

            switch_tenant_context(db, tenant_b)
            row_b = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_b}).fetchone()
            leaked_a = db.execute(text("SELECT id FROM jobs WHERE id = :id"), {"id": job_a}).fetchone()
            assert row_b is not None
            assert leaked_a is None
            reset_tenant_context(db)

    # -- notification / WhatsApp-shaped tenant-scoped table ------------------

    def test_tenant_isolation_on_notification_events(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (notif)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (notif)")
            event_b = str(uuid.uuid4())
            admin_conn.execute(
                text(
                    "INSERT INTO notification_events "
                    "(id, tenant_id, channel, event_type, status, payload_json, created_at, retry_count) "
                    "VALUES (:id, :tid, 'whatsapp', 'test_event', 'PENDING', '{}', now(), 0)"
                ),
                {"id": event_b, "tid": tenant_b},
            )

        with worker_db_session(tenant_a) as db:
            leaked = db.execute(
                text("SELECT id FROM notification_events WHERE id = :id"), {"id": event_b}
            ).fetchone()
        assert leaked is None, "tenant A must not see tenant B's notification_events row"

    # -- genuine end-to-end: enqueue-shaped call into a real tasks.py job -----

    def test_end_to_end_purge_expired_idempotency_keys_under_restricted_role(
        self, restricted_session_local
    ):
        """Not an isolated helper test: this calls the ACTUAL
        app.workers.tasks.purge_expired_idempotency_keys() job function -
        the same one ARQ's cron schedule invokes - with SessionLocal
        pointed at the restricted role, proving the real job runs cleanly
        against a NOSUPERUSER NOBYPASSRLS connection end to end."""
        import asyncio

        from app.workers import tasks

        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (idempotency)")
            user_id = str(uuid.uuid4())
            admin_conn.execute(
                text(
                    "INSERT INTO users "
                    "(id, email, username, tenant_id, created_at, updated_at, mfa_enabled, must_change_password) "
                    "VALUES (:id, :email, :username, :tid, now(), now(), false, false)"
                ),
                {"id": user_id, "email": f"{user_id[:8]}@example.test", "username": f"u{user_id[:8]}", "tid": tenant_a},
            )
            expired_id = str(uuid.uuid4())
            live_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            admin_conn.execute(
                text(
                    "INSERT INTO idempotency_keys "
                    "(id, key, tenant_id, user_id, method, endpoint, request_hash, response_json, "
                    "status_code, created_at, expires_at) "
                    "VALUES (:id, :key, :tid, :uid, 'POST', '/x', 'h', '{}', 200, :created, :expires)"
                ),
                {
                    "id": expired_id, "key": f"expired-{expired_id[:8]}", "tid": tenant_a,
                    "uid": user_id, "created": now - timedelta(hours=48),
                    "expires": now - timedelta(hours=24),
                },
            )
            admin_conn.execute(
                text(
                    "INSERT INTO idempotency_keys "
                    "(id, key, tenant_id, user_id, method, endpoint, request_hash, response_json, "
                    "status_code, created_at, expires_at) "
                    "VALUES (:id, :key, :tid, :uid, 'POST', '/x', 'h', '{}', 200, :created, :expires)"
                ),
                {
                    "id": live_id, "key": f"live-{live_id[:8]}", "tid": tenant_a,
                    "uid": user_id, "created": now, "expires": now + timedelta(hours=24),
                },
            )

        result = asyncio.run(tasks.purge_expired_idempotency_keys({}))
        assert result["deleted"] >= 1

        with engine.connect() as admin_conn:
            expired_row = admin_conn.execute(
                text("SELECT id FROM idempotency_keys WHERE id = :id"), {"id": expired_id}
            ).fetchone()
            live_row = admin_conn.execute(
                text("SELECT id FROM idempotency_keys WHERE id = :id"), {"id": live_id}
            ).fetchone()
        assert expired_row is None, "expired key must have been purged by the real job function"
        assert live_row is not None, "non-expired key must survive the purge"
