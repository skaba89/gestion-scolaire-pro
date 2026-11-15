"""UE/ECUE structure: tenant isolation, consistency and history-safe archive."""
import uuid
from datetime import date

import pytest

from conftest import get_test_client
from app.core.database import SessionLocal, engine
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models import AcademicYear, Semester, Subject, TeachingUnit, Tenant
from app.models.audit_log import AuditLog

client = get_test_client()


@pytest.fixture(autouse=True)
def _clear_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _context(name="Université UE"):
    tenant_id, year_id, semester_id = (str(uuid.uuid4()) for _ in range(3))
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name=name, slug=f"ue-{tenant_id[:8]}", type="university", country="GN", settings={}))
        db.flush()
        db.add(AcademicYear(id=year_id, tenant_id=tenant_id, name="2026-2027", code=f"Y-{tenant_id[:6]}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1)))
        db.flush()
        db.add(Semester(id=semester_id, tenant_id=tenant_id, academic_year_id=year_id, name="S1", number=1,
                        start_date=date(2026, 9, 1), end_date=date(2027, 1, 31)))
        db.commit()
    user = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return tenant_id, semester_id, {"Authorization": f"Bearer {token}"}


def test_create_unit_attach_ecue_and_report_ects():
    tenant_id, semester_id, headers = _context()
    response = client.post("/api/v1/teaching-units/", json={
        "semester_id": semester_id, "code": "ue-inf-1", "name": "Informatique fondamentale", "ects": 6,
    }, headers=headers)
    assert response.status_code == 201, response.text
    unit = response.json()
    assert unit["code"] == "UE-INF-1" and unit["subject_count"] == 0

    subject = client.post("/api/v1/subjects/", json={
        "name": "Algorithmique", "code": "ECUE-ALGO", "ects": 6,
        "semester_id": semester_id, "teaching_unit_id": unit["id"],
    }, headers=headers)
    assert subject.status_code == 201, subject.text
    assert subject.json()["teaching_unit_id"] == unit["id"]

    listed = client.get("/api/v1/teaching-units/", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["subject_count"] == 1
    assert listed.json()[0]["assigned_ects"] == 6
    assert listed.json()[0]["ects_consistent"] is True
    with SessionLocal() as db:
        assert db.query(AuditLog).filter(
            AuditLog.tenant_id == tenant_id,
            AuditLog.action == "CREATE_TEACHING_UNIT",
            AuditLog.resource_id == unit["id"],
        ).count() == 1


def test_rejects_foreign_unit_and_semester_mismatch():
    tenant_id, semester_id, headers = _context("Université A")
    foreign_tenant, foreign_semester, _ = _context("Université B")
    with SessionLocal() as db:
        foreign_unit = TeachingUnit(tenant_id=foreign_tenant, semester_id=foreign_semester,
                                    code="UE-B", name="UE étrangère", ects=4)
        db.add(foreign_unit)
        db.commit()
        db.refresh(foreign_unit)
        foreign_id = str(foreign_unit.id)

    # Restore A after _context(B) replaced the dependency override.
    app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"],
    }
    response = client.post("/api/v1/subjects/", json={
        "name": "Intrusion", "semester_id": semester_id, "teaching_unit_id": foreign_id,
    }, headers=headers)
    assert response.status_code == 404

    own = client.post("/api/v1/teaching-units/", json={
        "semester_id": semester_id, "code": "UE-A", "name": "UE locale", "ects": 5,
    }, headers=headers)
    assert own.status_code == 201, own.text
    _, other_semester, _ = _context("Université C")
    # A foreign semester is rejected before the UE consistency check.
    app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"],
    }
    response = client.post("/api/v1/subjects/", json={
        "name": "Mauvais semestre", "semester_id": other_semester, "teaching_unit_id": own.json()["id"],
    }, headers=headers)
    assert response.status_code == 404


def test_archive_preserves_ecue_link_and_optimistic_revision():
    tenant_id, semester_id, headers = _context()
    created = client.post("/api/v1/teaching-units/", json={
        "semester_id": semester_id, "code": "UE-HIST", "name": "UE historique", "ects": 3,
    }, headers=headers).json()
    archived = client.patch(f"/api/v1/teaching-units/{created['id']}/", json={
        "expected_revision": created["revision"], "is_active": False,
    }, headers=headers)
    assert archived.status_code == 200 and archived.json()["is_active"] is False
    rejected = client.post("/api/v1/subjects/", json={
        "name": "Nouveau rattachement interdit", "semester_id": semester_id,
        "teaching_unit_id": created["id"],
    }, headers=headers)
    assert rejected.status_code == 422
    assert "archivée" in rejected.json()["detail"]
    stale = client.patch(f"/api/v1/teaching-units/{created['id']}/", json={
        "expected_revision": created["revision"], "name": "Écrasement",
    }, headers=headers)
    assert stale.status_code == 409


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FORCE RLS")
def test_teaching_units_force_rls_and_composite_tenant_fk():
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.core.database as database

    own_tenant, own_semester, _ = _context("Université RLS A")
    other_tenant, other_semester, _ = _context("Université RLS B")
    own_unit, other_unit = uuid.uuid4(), uuid.uuid4()
    with SessionLocal() as db:
        db.add_all([
            TeachingUnit(id=own_unit, tenant_id=own_tenant, semester_id=own_semester, code="UE-OWN", name="Own", ects=3),
            TeachingUnit(id=other_unit, tenant_id=other_tenant, semester_id=other_semester, code="UE-OTHER", name="Other", ects=3),
        ])
        db.commit()
        db.add(Subject(tenant_id=own_tenant, name="Cross tenant", semester_id=own_semester, teaching_unit_id=other_unit))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    role = "teaching_units_" + uuid.uuid4().hex
    password = "test-only-teaching-unit-password"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\' NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT ON teaching_units, tenants TO "{role}"'))
    url = make_url(engine.url.render_as_string(hide_password=False)).set(username=role, password=password)
    restricted_engine = create_engine(url, poolclass=StaticPool)
    Restricted = sessionmaker(bind=restricted_engine)
    try:
        with Restricted() as db:
            flags = db.execute(text("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='teaching_units'::regclass")).one()
            assert flags == (True, True)
            assert db.query(TeachingUnit).count() == 0
            database.switch_tenant_context(db, own_tenant)
            assert [unit.id for unit in db.query(TeachingUnit).all()] == [own_unit]
            assert db.get(TeachingUnit, other_unit) is None
    finally:
        restricted_engine.dispose()
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL row locks")
def test_concurrent_teaching_unit_revision_accepts_one_writer():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from fastapi import HTTPException
    from starlette.requests import Request
    from app.api.v1.endpoints.academic.teaching_units import update_teaching_unit
    from app.schemas.academic import TeachingUnitUpdate

    tenant_id, semester_id, _ = _context("Université Concurrence")
    unit_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(TeachingUnit(id=unit_id, tenant_id=tenant_id, semester_id=semester_id,
                            code="UE-CONC", name="Initiale", ects=4, revision=1))
        db.commit()
    barrier = Barrier(2)
    user = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]}

    def save(name):
        with SessionLocal() as db:
            barrier.wait(timeout=10)
            try:
                return update_teaching_unit(
                    unit_id, TeachingUnitUpdate(expected_revision=1, name=name),
                    Request({"type": "http", "headers": []}), db, user,
                )["revision"]
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ["Premier", "Second"]))
    assert sorted(results) == [2, 409]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL migration lifecycle")
def test_teaching_unit_migration_reentry_preserves_history():
    import runpy
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    tenant_id, semester_id, _ = _context("Université Migration")
    unit_id, subject_id = uuid.uuid4(), uuid.uuid4()
    with SessionLocal() as db:
        db.add(TeachingUnit(id=unit_id, tenant_id=tenant_id, semester_id=semester_id,
                            code="UE-HISTORY", name="Historique", ects=5, is_active=False, revision=4))
        db.flush()
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="ECUE conservé", ects=5,
                       semester_id=semester_id, teaching_unit_id=unit_id))
        db.commit()
    migration = runpy.run_path(str(Path(__file__).parents[1] / "alembic/versions/20261115_0001_lmd_teaching_units.py"))
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["downgrade"]()
            migration["upgrade"]()
    with SessionLocal() as db:
        assert db.get(TeachingUnit, unit_id).revision == 4
        assert db.get(TeachingUnit, unit_id).is_active is False
        assert db.get(Subject, subject_id).teaching_unit_id == unit_id
