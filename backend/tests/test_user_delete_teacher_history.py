"""Account deletion and deactivation must retain teaching/payroll history."""
from datetime import date
from decimal import Decimal
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import Column, Date, ForeignKey, MetaData, Numeric, String, Table, select, text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Tenant, User, UserRole  # noqa: E402
from app.models.base import GUID  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(scope="module")
def history_tables():
    # SQLite has no operational migrations. Reproduce their actual FK actions,
    # keeping PostgreSQL on the real Alembic schema rather than ORM create_all.
    if engine.dialect.name == "sqlite":
        metadata = MetaData()
        Table("tenants", metadata, autoload_with=engine)
        Table("users", metadata, autoload_with=engine)
        tables = [
            Table("teacher_assignments", metadata,
                  Column("id", GUID(), primary_key=True),
                  Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE")),
                  Column("user_id", GUID(), ForeignKey("users.id", ondelete="CASCADE"))),
            Table("teacher_work_hours", metadata,
                  Column("id", GUID(), primary_key=True),
                  Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE")),
                  Column("teacher_id", GUID(), ForeignKey("users.id", ondelete="CASCADE")),
                  Column("work_date", Date), Column("hours_worked", Numeric(5, 2))),
            Table("announcements", metadata,
                  Column("id", GUID(), primary_key=True),
                  Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE")),
                  Column("author_id", GUID(), ForeignKey("users.id", ondelete="CASCADE")),
                  Column("title", String), Column("content", String)),
        ]
        metadata.create_all(engine, tables=tables)
    reflected = {
        name: Table(name, MetaData(), autoload_with=engine)
        for name in ("teacher_assignments", "teacher_work_hours", "announcements")
    }
    for table in reflected.values():
        for col in table.columns:
            if col.name == "id" or col.name.endswith("_id"):
                col.type = GUID()
    yield reflected
    if engine.dialect.name == "sqlite":
        for table in reversed(tables):
            table.drop(engine)


@pytest.fixture
def school(history_tables):
    tenant, other, teacher, admin = (uuid4() for _ in range(4))
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Teacher retention", slug=f"teacher-retain-{tid}", type="secondary"))
        db.flush()
        db.add(User(id=teacher, tenant_id=tenant, email=f"{teacher}@example.gn", username=str(teacher),
                    first_name="Mariama", last_name="Diallo", password_hash="x", is_active=True))
        db.flush()
        db.add(UserRole(user_id=teacher, tenant_id=tenant, role="TEACHER"))
        db.commit()
    actor = {"id": str(admin), "tenant_id": str(tenant), "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: actor
    yield dict(tenant=tenant, other=other, teacher=teacher, actor=actor, tables=history_tables)
    app.dependency_overrides.pop(get_current_user, None)


def _history(s, name):
    table = s["tables"][name]
    row_id = uuid4()
    values = dict(id=row_id, tenant_id=s["tenant"])
    if name == "teacher_assignments":
        values["user_id"] = s["teacher"]
    elif name == "teacher_work_hours":
        values.update(teacher_id=s["teacher"], work_date=date(2026, 11, 14), hours_worked=Decimal("3.50"))
    else:
        values.update(author_id=s["teacher"], title="Cours", content="Historique pédagogique")
    with SessionLocal() as db:
        db.execute(table.insert().values(**values))
        db.commit()
    return table, row_id


def _delete(s):
    return client.delete(f"/api/v1/users/{s['teacher']}/", headers=HEADERS)


@pytest.mark.parametrize("name", ["teacher_assignments", "teacher_work_hours", "announcements"])
@pytest.mark.parametrize("role", ["TENANT_ADMIN", "SUPER_ADMIN"])
def test_history_blocks_deletion_even_without_teacher_role(school, name, role):
    table, row_id = _history(school, name)
    # Historical links matter even after changing the teacher's current role.
    with SessionLocal() as db:
        db.query(UserRole).filter(UserRole.user_id == school["teacher"]).delete()
        db.commit()
    school["actor"]["roles"] = [role]
    response = _delete(school)
    assert response.status_code == 409, response.text
    assert "deactivate" in response.json()["detail"]
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]) is not None
        assert db.execute(select(table).where(table.c.id == row_id)).first() is not None


def test_unused_teacher_with_role_remains_deletable(school):
    response = _delete(school)
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]) is None
        assert db.query(UserRole).filter(UserRole.user_id == school["teacher"]).count() == 0


def test_deactivation_and_reactivation_keep_assignments_and_payable_hours(school, monkeypatch):
    records = [_history(school, name) for name in school["tables"]]
    revoke = AsyncMock()
    monkeypatch.setattr("app.api.v1.endpoints.core.auth.blacklist_all_user_tokens", revoke)
    for active in (False, True):
        response = client.patch(f"/api/v1/users/{school['teacher']}/toggle-status/",
                                headers=HEADERS, json={"is_active": active})
        assert response.status_code == 200, response.text
        with SessionLocal() as db:
            assert db.get(User, school["teacher"]).is_active is active
            for table, row_id in records:
                assert db.execute(select(table).where(table.c.id == row_id)).first() is not None
            hours = school["tables"]["teacher_work_hours"]
            assert db.execute(select(hours.c.hours_worked).where(hours.c.teacher_id == school["teacher"])).scalar_one() == Decimal("3.50")
            assert db.query(UserRole).filter(UserRole.user_id == school["teacher"]).count() == 1
    revoke.assert_awaited_once_with(str(school["teacher"]))


@pytest.mark.parametrize("operation", ["delete", "deactivate"])
@pytest.mark.parametrize("role", ["TEACHER", "PARENT", "STUDENT", "ACCOUNTANT"])
def test_unauthorized_roles_cannot_remove_or_deactivate_teacher(school, operation, role):
    school["actor"]["roles"] = [role]
    response = _delete(school) if operation == "delete" else client.patch(
        f"/api/v1/users/{school['teacher']}/toggle-status/", headers=HEADERS, json={"is_active": False})
    assert response.status_code == 403
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]).is_active


@pytest.mark.parametrize("operation", ["delete", "deactivate"])
def test_foreign_teacher_is_not_found(school, operation):
    _history(school, "teacher_work_hours")
    school["actor"]["tenant_id"] = str(school["other"])
    response = _delete(school) if operation == "delete" else client.patch(
        f"/api/v1/users/{school['teacher']}/toggle-status/", headers=HEADERS, json={"is_active": False})
    assert response.status_code == 404
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]).is_active


def test_catalog_failure_fails_closed(school, monkeypatch):
    from sqlalchemy.exc import OperationalError
    def unavailable(*args, **kwargs):
        raise OperationalError("catalog", {}, Exception("unavailable"))
    monkeypatch.setattr("app.crud.academic.inspect", unavailable)
    response = _delete(school)
    assert response.status_code == 503, response.text
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]) is not None


def test_unguarded_database_delete_would_cascade_teaching_and_payroll_records(school):
    """Reproduce the root cause in a rolled-back transaction, never via production."""
    from sqlalchemy import delete
    records = [_history(school, name) for name in school["tables"]]
    with SessionLocal() as db:
        db.execute(delete(UserRole).where(UserRole.user_id == school["teacher"]))
        db.execute(delete(User).where(User.id == school["teacher"]))
        for table, row_id in records:
            assert db.execute(select(table.c.id).where(table.c.id == row_id)).first() is None
        db.rollback()
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]) is not None
        for table, row_id in records:
            assert db.execute(select(table.c.id).where(table.c.id == row_id)).first() is not None


@pytest.mark.parametrize("active", [True, False])
def test_tenant_admin_cannot_change_privileged_account_status(school, active):
    with SessionLocal() as db:
        db.add(UserRole(user_id=school["teacher"], tenant_id=school["tenant"], role="TENANT_ADMIN"))
        db.commit()
    response = client.patch(f"/api/v1/users/{school['teacher']}/toggle-status/",
                            headers=HEADERS, json={"is_active": active})
    assert response.status_code == 403, response.text
    with SessionLocal() as db:
        assert db.get(User, school["teacher"]).is_active


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires real PostgreSQL RLS")
@pytest.mark.parametrize("foreign", [False, True])
def test_history_protection_under_non_bypass_rls_role(school, foreign):
    from starlette.requests import Request
    from fastapi import HTTPException
    from app.api.v1.endpoints.core.users import delete_user
    from app.core.database import switch_tenant_context
    table, row_id = _history(school, "teacher_work_hours")
    role = "teacher_retention_" + uuid4().hex
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
    try:
        with SessionLocal() as db:
            db.execute(text(f'SET LOCAL ROLE "{role}"'))
            assert db.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).one() == (False, False)
            assert db.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='teacher_work_hours'::regclass")).scalar_one()
            tid = school["other"] if foreign else school["tenant"]
            switch_tenant_context(db, str(tid))
            actor = dict(school["actor"], tenant_id=str(tid))
            with pytest.raises(HTTPException) as exc:
                delete_user(str(school["teacher"]), Request({"type": "http", "headers": []}), db, actor)
            assert exc.value.status_code == (404 if foreign else 409)
        with SessionLocal() as db:
            assert db.get(User, school["teacher"]) is not None
            assert db.execute(select(table.c.id).where(table.c.id == row_id)).first() is not None
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FK row locks")
def test_concurrent_assignment_blocks_teacher_deletion(school):
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from time import monotonic, sleep
    from starlette.requests import Request
    from app.api.v1.endpoints.core.users import delete_user
    from fastapi import HTTPException
    pids = Queue()
    def remove():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            with pytest.raises(HTTPException) as exc:
                delete_user(str(school["teacher"]), Request({"type": "http", "headers": []}), db, school["actor"])
            assert exc.value.status_code == 409
    table = school["tables"]["teacher_assignments"]
    with SessionLocal() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        writer.execute(table.insert().values(id=uuid4(), tenant_id=school["tenant"], user_id=school["teacher"]))
        future = pool.submit(remove)
        try:
            pid = pids.get(timeout=10)
            deadline = monotonic() + 10
            blocked = False
            while monotonic() < deadline:
                blocked = bool(writer.execute(text("SELECT pg_blocking_pids(:pid)"), {"pid": pid}).scalar_one())
                if blocked or future.done():
                    break
                sleep(0.02)
            assert blocked, "deletion must serialize with FK writers"
        finally:
            writer.commit()
        future.result(timeout=15)
