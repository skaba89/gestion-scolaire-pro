"""PostgreSQL integration tests for persisted early-warning workflows.

These use actual SQL, constraints, transactions and tenant-scoped endpoints.
Skipped for SQLite, where migration-managed early_warnings is not installed.
"""
from __future__ import annotations

from datetime import date
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from starlette.requests import Request
from sqlalchemy import text

from app.core.database import SessionLocal, engine
from app.api.v1.endpoints.operational import early_warnings as api

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Real early_warnings PostgreSQL persistence and tenant tests",
)


def _id():
    return str(uuid4())


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/school-life/early-warnings/",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("testserver", 80), "client": ("127.0.0.1", 12345),
    })


@pytest.fixture
def school_records():
    """Create disposable tenant, student and actor records in the CI database."""
    tenant_a, tenant_b = _id(), _id()
    student_a, student_b, actor = _id(), _id(), _id()
    with engine.begin() as conn:
        for tid in (tenant_a, tenant_b):
            conn.execute(text("""
                INSERT INTO tenants
                    (id, name, slug, type, country, is_active, settings, created_at, updated_at)
                VALUES (:id, 'École test alertes', :slug, 'primary', 'GN', true, '{}', now(), now())
            """), {"id": tid, "slug": "alerts-" + tid[:8]})
        for sid, tid in ((student_a, tenant_a), (student_b, tenant_b)):
            conn.execute(text("""
                INSERT INTO students
                    (id, tenant_id, registration_number, first_name, last_name,
                     date_of_birth, gender, created_at, updated_at)
                VALUES (:id, :tid, :reg, 'Aminata', 'Diallo', :birth, 'FEMALE', now(), now())
            """), {"id": sid, "tid": tid, "reg": "AL-" + sid[:8], "birth": date(2011, 1, 1)})
        conn.execute(text("""
            INSERT INTO users
                (id, tenant_id, email, username, is_active, first_name, last_name, created_at, updated_at)
            VALUES (:id, :tid, :email, :username, true, 'Direction', 'École', now(), now())
        """), {"id": actor, "tid": tenant_a,
               "email": "alerts-" + actor[:8] + "@example.test",
               "username": "alerts-" + actor[:8]})
    yield {"tenant_a": tenant_a, "tenant_b": tenant_b,
           "student_a": student_a, "student_b": student_b, "actor": actor}
    # Tear down in dependency order without touching other test data.
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM audit_logs WHERE resource_type = 'EARLY_WARNING' AND tenant_id = :tid"), {"tid": tenant_a})
        conn.execute(text("DELETE FROM early_warnings WHERE tenant_id IN (:a, :b)"), {"a": tenant_a, "b": tenant_b})
        conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": actor})
        conn.execute(text("DELETE FROM students WHERE id IN (:a, :b)"), {"a": student_a, "b": student_b})
        conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tenant_a, "b": tenant_b})


def _user(school):
    return {"id": school["actor"], "tenant_id": school["tenant_a"], "roles": ["DIRECTOR"]}


def test_real_pg_create_list_acknowledge_resolve_and_cross_tenant_isolation(school_records):
    s = school_records
    with SessionLocal() as db:
        with patch.object(api, "resolve_current_tenant_id", return_value=s["tenant_a"]):
            created = api.create_early_warning(
                api.EarlyWarningCreate(
                    student_id=s["student_a"], alert_type="academic",
                    severity="high", title="Suivi", description="Baisse des notes",
                    recommended_actions=["Rencontrer les parents"],
                ), _request(), db=db, current_user=_user(s),
            )
            assert created["status"] == "new"
            assert created["student"]["first_name"] == "Aminata"
            wid = created["id"]
            listed = api.list_early_warnings(_request(), db=db, current_user=_user(s))
            assert any(item["id"] == wid for item in listed)
            ack = api.update_early_warning(
                UUID(wid),
                api.EarlyWarningUpdate(status="acknowledged"),
                _request(), db=db, current_user=_user(s),
            )
            assert ack["status"] == "acknowledged"
            assert ack["acknowledged_by"] == s["actor"]
            assert ack["acknowledged_user"]["first_name"] == "Direction"
            resolved = api.update_early_warning(
                UUID(wid),
                api.EarlyWarningUpdate(status="resolved", resolution_notes="Parents rencontrés"),
                _request(), db=db, current_user=_user(s),
            )
            assert resolved["status"] == "resolved"
            assert resolved["resolution_notes"] == "Parents rencontrés"
            assert resolved["resolved_by"] == s["actor"]
        # Same account, switching to a different allowed tenant via explicit
        # mocked resolver; SQL must never return or change the first tenant.
        with patch.object(api, "resolve_current_tenant_id", return_value=s["tenant_b"]):
            others = api.list_early_warnings(_request(), db=db, current_user=_user(s))
            assert all(item["id"] != wid for item in others)
            with pytest.raises(Exception) as err:
                api.update_early_warning(
                    UUID(wid),
                    api.EarlyWarningUpdate(status="acknowledged"),
                    _request(), db=db, current_user=_user(s),
                )
            assert getattr(err.value, "status_code", None) == 404
        row = db.execute(text(
            "SELECT status, resolution_notes FROM early_warnings WHERE id = :id AND tenant_id = :tid"
        ), {"id": wid, "tid": s["tenant_a"]}).one()
        assert row.status == "resolved"
        assert row.resolution_notes == "Parents rencontrés"


def test_real_pg_rejects_student_in_other_tenant(school_records):
    s = school_records
    with SessionLocal() as db:
        with patch.object(api, "resolve_current_tenant_id", return_value=s["tenant_a"]):
            with pytest.raises(Exception) as err:
                api.create_early_warning(
                    api.EarlyWarningCreate(
                        student_id=s["student_b"], alert_type="attendance",
                        severity="medium", title="Absence", description="Suivi",
                    ), _request(), db=db, current_user=_user(s),
                )
        assert getattr(err.value, "status_code", None) == 404
        assert db.execute(text(
            "SELECT count(*) FROM early_warnings WHERE tenant_id = :tid"
        ), {"tid": s["tenant_a"]}).scalar() == 0


def test_early_warnings_rls_with_non_bypass_runtime_role(school_records):
    """Exercise PostgreSQL FORCE RLS, not merely explicit API tenant filters."""
    from sqlalchemy.exc import DBAPIError

    s = school_records
    warning_a, warning_b = _id(), _id()
    role = "test_early_warning_" + uuid4().hex[:12]
    # This disposable role represents a production-like NOBYPASSRLS login.
    # All DDL is scoped to the CI database and cleaned up even on failure.
    with engine.begin() as conn:
        for warning, student, tid in (
            (warning_a, s["student_a"], s["tenant_a"]),
            (warning_b, s["student_b"], s["tenant_b"]),
        ):
            conn.execute(text("""
                INSERT INTO early_warnings
                    (id, tenant_id, student_id, alert_type, severity, title,
                     description, recommended_actions, status)
                VALUES (:id, :tid, :sid, 'academic', 'high', 'Suivi',
                        'Contrôle RLS', '[]', 'new')
            """), {"id": warning, "tid": tid, "sid": student})
        conn.execute(text(f'CREATE ROLE "{role}" NOLOGIN NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE ON early_warnings TO "{role}"'))

    try:
        for tid, visible, hidden in (
            (s["tenant_a"], warning_a, warning_b),
            (s["tenant_b"], warning_b, warning_a),
        ):
            with engine.begin() as conn:
                conn.execute(text(f'SET LOCAL ROLE "{role}"'))
                conn.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                    {"tid": tid},
                )
                found = conn.execute(text("SELECT id FROM early_warnings")).scalars().all()
                assert [str(row) for row in found] == [visible]
                blocked = conn.execute(
                    text("UPDATE early_warnings SET title = 'INTRUSION' WHERE id = :id"),
                    {"id": hidden},
                )
                assert blocked.rowcount == 0

        # Fail closed if a tenant identifier is missing altogether.
        with engine.begin() as conn:
            conn.execute(text(f'SET LOCAL ROLE "{role}"'))
            conn.execute(text("SELECT set_config('app.current_tenant_id', '', true)"))
            assert conn.execute(text("SELECT count(*) FROM early_warnings")).scalar() == 0

        # A real cross-tenant write must violate WITH CHECK under restricted role.
        with pytest.raises(DBAPIError):
            with engine.begin() as conn:
                conn.execute(text(f'SET LOCAL ROLE "{role}"'))
                conn.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                    {"tid": s["tenant_a"]},
                )
                conn.execute(text("""
                    INSERT INTO early_warnings
                        (id, tenant_id, student_id, alert_type, severity,
                         title, description, recommended_actions, status)
                    VALUES (:id, :tid, :sid, 'academic', 'high',
                            'Intrusion', 'Inter-tenant', '[]', 'new')
                """), {"id": _id(), "tid": s["tenant_b"], "sid": s["student_b"]})
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'REVOKE ALL ON early_warnings FROM "{role}"'))
            conn.execute(text(f'REVOKE USAGE ON SCHEMA public FROM "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))
