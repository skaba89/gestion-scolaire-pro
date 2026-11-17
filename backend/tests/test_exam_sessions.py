"""LMD exam sessions: lifecycle, tenant isolation and immutable history."""
import uuid
from datetime import date

import pytest

from conftest import get_test_client
from app.core.database import SessionLocal, engine
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models import AcademicYear, ExamSession, Semester, Tenant
from app.models.audit_log import AuditLog

client = get_test_client()


@pytest.fixture(autouse=True)
def _clear_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _context(name="Université Sessions"):
    tenant_id, year_id, semester_id, user_id = (str(uuid.uuid4()) for _ in range(4))
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name=name, slug=f"session-{tenant_id[:8]}",
                      type="university", country="GN", settings={}))
        db.flush()
        db.add(AcademicYear(id=year_id, tenant_id=tenant_id, name="2026-2027", code=f"Y-{tenant_id[:6]}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1)))
        db.flush()
        db.add(Semester(id=semester_id, tenant_id=tenant_id, academic_year_id=year_id,
                        name="Semestre 1", number=1, start_date=date(2026, 9, 1), end_date=date(2027, 1, 31)))
        db.commit()
    user = {"id": user_id, "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"], "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": user["roles"]})
    return tenant_id, semester_id, user, {"Authorization": f"Bearer {token}"}


def _body(semester_id, **overrides):
    return {
        "semester_id": semester_id, "code": "rattrapage-s1", "name": "Rattrapage S1",
        "session_type": "RETAKE", "sequence": 2, "starts_on": "2027-02-10",
        "ends_on": "2027-02-15", "selection_policy": "BEST", **overrides,
    }


def test_session_lifecycle_is_revisioned_audited_and_immutable_after_close():
    tenant_id, semester_id, _, headers = _context()
    created = client.post("/api/v1/exam-sessions/", headers=headers, json=_body(semester_id))
    assert created.status_code == 201, created.text
    session = created.json()
    assert session["code"] == "RATTRAPAGE-S1" and session["status"] == "DRAFT"
    assert session["revision"] == 1 and session["assessment_count"] == 0

    opened = client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 1, "status": "OPEN",
    })
    assert opened.status_code == 200 and opened.json()["revision"] == 2
    stale = client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 1, "status": "CLOSED",
    })
    assert stale.status_code == 409
    mutable_open = client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 2, "name": "Réécriture interdite",
    })
    assert mutable_open.status_code == 409
    closed = client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 2, "status": "CLOSED",
    })
    assert closed.status_code == 200 and closed.json()["status"] == "CLOSED"
    immutable = client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 3, "name": "Réécriture interdite",
    })
    assert immutable.status_code == 409
    assert client.delete(f"/api/v1/exam-sessions/{session['id']}/", headers=headers).status_code == 405

    with SessionLocal() as db:
        assert db.query(AuditLog).filter(
            AuditLog.tenant_id == tenant_id,
            AuditLog.resource_type == "EXAM_SESSION",
        ).count() == 3


def test_foreign_semester_is_rejected_and_list_is_tenant_scoped():
    tenant_a, semester_a, user_a, headers_a = _context("Université A")
    tenant_b, semester_b, _, _ = _context("Université B")
    app.dependency_overrides[get_current_user] = lambda: user_a
    rejected = client.post("/api/v1/exam-sessions/", headers=headers_a, json=_body(semester_b))
    assert rejected.status_code == 404
    own = client.post("/api/v1/exam-sessions/", headers=headers_a, json=_body(semester_a))
    assert own.status_code == 201, own.text
    listed = client.get("/api/v1/exam-sessions/", headers=headers_a)
    assert listed.status_code == 200
    assert [item["tenant_id"] for item in listed.json()] == [tenant_a]
    assert tenant_b not in [item["tenant_id"] for item in listed.json()]


def test_additive_migration_upgrades_a_legacy_sqlite_schema_and_is_reentrant():
    import runpy
    from pathlib import Path
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    legacy = sa.create_engine("sqlite://")
    with legacy.begin() as connection:
        connection.execute(sa.text("CREATE TABLE tenants (id CHAR(32) PRIMARY KEY)"))
        connection.execute(sa.text(
            "CREATE TABLE semesters (id CHAR(32) PRIMARY KEY, tenant_id CHAR(32) NOT NULL)"
        ))
        connection.execute(sa.text(
            "CREATE TABLE assessments (id CHAR(32) PRIMARY KEY, tenant_id CHAR(32) NOT NULL)"
        ))
    migration = runpy.run_path(str(
        Path(__file__).parents[1] / "alembic/versions/20261115_0002_lmd_exam_sessions.py"
    ))
    with legacy.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["upgrade"]()
        inspector = sa.inspect(connection)
        assert inspector.has_table("exam_sessions")
        assert "exam_session_id" in {item["name"] for item in inspector.get_columns("assessments")}
        assert "ix_assessments_exam_session_id" in {
            item["name"] for item in inspector.get_indexes("assessments")
        }
        assert "fk_assessments_tenant_exam_session" in {
            item["name"] for item in inspector.get_foreign_keys("assessments")
        }
    legacy.dispose()


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Assessment API uses PostgreSQL UUID SQL")
def test_assessment_link_requires_same_tenant_semester_and_closed_history_is_immutable():
    from app.models import Student, Subject

    tenant_id, semester_id, user, headers = _context("Université Rattachement")
    with SessionLocal() as db:
        subject = Subject(tenant_id=tenant_id, semester_id=semester_id, name="Algorithmique", code="ALGO")
        non_lmd = Subject(tenant_id=tenant_id, name="Matière sans semestre", code="SANS-SEM")
        student = Student(tenant_id=tenant_id, registration_number=f"MAT-{uuid.uuid4().hex[:8]}",
                          first_name="Mariam", last_name="Camara", date_of_birth=date(2004, 4, 2), gender="FEMALE")
        db.add_all([subject, non_lmd, student])
        db.commit()
        subject_id, non_lmd_id, student_id = str(subject.id), str(non_lmd.id), str(student.id)
    app.dependency_overrides[get_current_user] = lambda: user
    session = client.post("/api/v1/exam-sessions/", headers=headers, json=_body(semester_id)).json()
    payload = {
        "subject_id": subject_id, "exam_session_id": session["id"], "name": "Épreuve de rattrapage",
        "type": "EXAM", "date": "2027-02-12", "max_score": 20,
    }
    linked = client.post("/api/v1/assessments/", headers=headers, json=payload)
    assert linked.status_code == 200, linked.text
    assert linked.json()["exam_session_id"] == session["id"]
    invalid = client.post("/api/v1/assessments/", headers=headers, json={**payload, "subject_id": non_lmd_id})
    assert invalid.status_code == 422
    grade_payload = {
        "student_id": student_id, "subject_id": subject_id, "assessment_id": linked.json()["id"],
        "score": 12, "max_score": 20, "coefficient": 1,
    }
    grade = client.post("/api/v1/grades/", headers=headers, json=grade_payload)
    assert grade.status_code == 201, grade.text

    assert client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 1, "status": "OPEN",
    }).status_code == 200
    assert client.patch(f"/api/v1/exam-sessions/{session['id']}/", headers=headers, json={
        "expected_revision": 2, "status": "CLOSED",
    }).status_code == 200
    assessment_id = linked.json()["id"]
    assert client.put(f"/api/v1/assessments/{assessment_id}/", headers=headers, json={"name": "Réécriture"}).status_code == 409
    assert client.delete(f"/api/v1/assessments/{assessment_id}/", headers=headers).status_code == 409
    assert client.post("/api/v1/grades/", headers=headers, json={**grade_payload, "score": 14}).status_code == 409
    assert client.put(f"/api/v1/grades/{grade.json()['id']}/", headers=headers, json={"score": 14}).status_code == 409
    assert client.delete(f"/api/v1/grades/{grade.json()['id']}/", headers=headers).status_code == 409
    assert client.post("/api/v1/school-life/grades/", headers=headers, json={**grade_payload, "score": 14}).status_code == 409


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FORCE RLS")
def test_exam_sessions_force_rls_and_assessment_composite_fk():
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.core.database as database
    from app.models import Assessment, Subject

    tenant_a, semester_a, _, _ = _context("Université RLS A")
    tenant_b, semester_b, _, _ = _context("Université RLS B")
    with SessionLocal() as db:
        session_a = ExamSession(tenant_id=tenant_a, semester_id=semester_a, code="S-A", name="A",
                                session_type="RETAKE", sequence=2, starts_on=date(2027, 2, 1),
                                ends_on=date(2027, 2, 2), status="DRAFT", selection_policy="BEST")
        session_b = ExamSession(tenant_id=tenant_b, semester_id=semester_b, code="S-B", name="B",
                                session_type="RETAKE", sequence=2, starts_on=date(2027, 2, 1),
                                ends_on=date(2027, 2, 2), status="DRAFT", selection_policy="BEST")
        subject_a = Subject(tenant_id=tenant_a, semester_id=semester_a, name="Droit")
        db.add_all([session_a, session_b, subject_a])
        db.commit()
        db.add(Assessment(tenant_id=tenant_a, subject_id=subject_a.id, exam_session_id=session_b.id,
                          name="Intrusion", date=date(2027, 2, 1), max_score=20))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    role = "exam_sessions_" + uuid.uuid4().hex
    password = "test-only-exam-session-password"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\' NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT ON exam_sessions, tenants TO "{role}"'))
    restricted_engine = create_engine(
        make_url(engine.url.render_as_string(hide_password=False)).set(username=role, password=password),
        poolclass=StaticPool,
    )
    Restricted = sessionmaker(bind=restricted_engine)
    try:
        with Restricted() as db:
            assert db.query(ExamSession).count() == 0
            database.switch_tenant_context(db, tenant_a)
            assert [str(item.tenant_id) for item in db.query(ExamSession).all()] == [tenant_a]
    finally:
        restricted_engine.dispose()
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL row locks")
def test_concurrent_session_revision_accepts_one_writer():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from fastapi import HTTPException
    from starlette.requests import Request
    from app.api.v1.endpoints.academic.exam_sessions import update_exam_session
    from app.schemas.academic import ExamSessionUpdate

    tenant_id, semester_id, user, _ = _context("Université Concurrence Sessions")
    session_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(ExamSession(id=session_id, tenant_id=tenant_id, semester_id=semester_id,
                           code="CONC-S1", name="Initiale", session_type="RETAKE", sequence=2,
                           starts_on=date(2027, 2, 1), ends_on=date(2027, 2, 2), status="DRAFT",
                           selection_policy="BEST", revision=1))
        db.commit()
    barrier = Barrier(2)

    def save(name):
        with SessionLocal() as db:
            barrier.wait(timeout=10)
            try:
                return update_exam_session(
                    session_id, ExamSessionUpdate(expected_revision=1, name=name),
                    Request({"type": "http", "headers": []}), db, user,
                )["revision"]
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ["Première", "Seconde"]))
    assert sorted(results) == [2, 409]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL migration lifecycle")
def test_exam_session_migration_reentry_preserves_closed_history():
    import runpy
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.models import Assessment, Subject

    tenant_id, semester_id, _, _ = _context("Université Migration Sessions")
    session_id, subject_id, assessment_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, semester_id=semester_id, name="Économie"))
        db.add(ExamSession(id=session_id, tenant_id=tenant_id, semester_id=semester_id,
                           code="HIST-S1", name="Historique", session_type="RETAKE", sequence=2,
                           starts_on=date(2027, 2, 1), ends_on=date(2027, 2, 2), status="CLOSED",
                           selection_policy="LATEST", revision=3))
        db.flush()
        db.add(Assessment(id=assessment_id, tenant_id=tenant_id, subject_id=subject_id,
                          exam_session_id=session_id, name="Épreuve historique",
                          date=date(2027, 2, 1), max_score=20))
        db.commit()
    migration = runpy.run_path(str(
        Path(__file__).parents[1] / "alembic/versions/20261115_0002_lmd_exam_sessions.py"
    ))
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["downgrade"]()
            migration["upgrade"]()
    with SessionLocal() as db:
        assert db.get(ExamSession, session_id).status == "CLOSED"
        assert db.get(ExamSession, session_id).revision == 3
        assert db.get(Assessment, assessment_id).exam_session_id == session_id
