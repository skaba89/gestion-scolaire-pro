"""Subject deletion must neither cascade grades nor detach academic context."""
from datetime import date, datetime, time
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Subject, Assessment, Grade, Attendance, Student, Classroom, ScheduleSlot, Level  # noqa: E402
from app.models.student import Gender  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.associations import student_subjects, class_subjects, subject_prerequisites, subject_levels  # noqa: E402

BASE = "/api/v1/subjects"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture
def school():
    tenant, other, subject, student, classroom = (uuid4() for _ in range(5))
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Academic retention", slug=f"subject-history-{tid}", type="secondary", country="GN"))
        db.flush()
        db.add_all([
            Subject(id=subject, tenant_id=tenant, name=f"Math {subject}"),
            Student(id=student, tenant_id=tenant, registration_number=str(uuid4()), first_name="Mariama",
                    last_name="Diallo", date_of_birth=date(2010, 1, 1), gender=Gender.FEMALE),
            Classroom(id=classroom, tenant_id=tenant, name="6ème A"),
        ])
        db.commit()
    user = {"id": str(uuid4()), "tenant_id": str(tenant), "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    yield dict(tenant=tenant, other=other, subject=subject, student=student, classroom=classroom, user=user)
    app.dependency_overrides.pop(get_current_user, None)


def add_history(s, kind):
    tid, sid, student, classroom = s["tenant"], s["subject"], s["student"], s["classroom"]
    with SessionLocal() as db:
        if kind in ("assessment", "graded_assessment"):
            record = Assessment(tenant_id=tid, subject_id=sid, name="Exam", date=datetime(2026, 11, 1))
            db.add(record)
            db.flush()
            assessment_id = record.id
            if kind == "graded_assessment":
                record = Grade(tenant_id=tid, student_id=student, assessment_id=assessment_id, score=17, max_score=20)
                db.add(record)
        elif kind == "grade":
            record = Grade(tenant_id=tid, student_id=student, subject_id=sid, score=17, max_score=20)
            db.add(record)
        elif kind == "attendance":
            record = Attendance(tenant_id=tid, student_id=student, subject_id=sid, date=date(2026, 11, 1), status="PRESENT")
            db.add(record)
        elif kind == "schedule":
            record = ScheduleSlot(tenant_id=tid, class_id=classroom, subject_id=sid, day_of_week=1,
                                  start_time=time(8), end_time=time(9))
            db.add(record)
        elif kind in ("student", "class"):
            table = student_subjects if kind == "student" else class_subjects
            fk = {"student_id": student} if kind == "student" else {"class_id": classroom}
            db.execute(table.insert().values(tenant_id=tid, subject_id=sid, **fk))
            db.commit()
            return table, None
        else:
            another = Subject(tenant_id=tid, name=f"Physics {uuid4()}")
            db.add(another)
            db.flush()
            source, prerequisite = (sid, another.id) if kind == "requires" else (another.id, sid)
            db.execute(subject_prerequisites.insert().values(tenant_id=tid, subject_id=source, prerequisite_subject_id=prerequisite))
            db.commit()
            return subject_prerequisites, None
        db.commit()
        return type(record), record.id


@pytest.mark.parametrize("kind", ["assessment", "graded_assessment", "grade", "attendance", "schedule", "student", "class", "requires", "prerequisite"])
def test_subject_in_use_cannot_be_deleted(school, kind):
    model, record_id = add_history(school, kind)
    response = client.delete(f"{BASE}/{school['subject']}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(Subject, school["subject"]) is not None
        if record_id is not None:
            record = db.get(model, record_id)
            assert record is not None
            if kind in ("grade", "attendance", "schedule", "assessment"):
                assert record.subject_id == school["subject"]
            if kind in ("grade", "graded_assessment"):
                assert record.score == 17
        else:
            assert db.execute(select(model).where(model.c.tenant_id == school["tenant"])).first() is not None


def test_unused_subject_with_only_level_configuration_can_be_deleted(school):
    with SessionLocal() as db:
        level = Level(tenant_id=school["tenant"], name="6ème")
        db.add(level)
        db.flush()
        db.execute(subject_levels.insert().values(tenant_id=school["tenant"], subject_id=school["subject"], level_id=level.id))
        db.commit()
    response = client.delete(f"{BASE}/{school['subject']}/", headers=HEADERS)
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.get(Subject, school["subject"]) is None
        assert db.execute(select(subject_levels).where(subject_levels.c.subject_id == school["subject"])).first() is None


def test_foreign_subject_and_history_are_preserved(school):
    model, record_id = add_history(school, "grade")
    school["user"]["tenant_id"] = str(school["other"])
    assert client.delete(f"{BASE}/{school['subject']}/", headers=HEADERS).status_code == 404
    with SessionLocal() as db:
        assert db.get(Subject, school["subject"]) is not None
        assert db.get(model, record_id).subject_id == school["subject"]


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER"])
def test_role_without_subject_write_is_refused(school, role):
    school["user"]["roles"] = [role]
    assert client.delete(f"{BASE}/{school['subject']}/", headers=HEADERS).status_code == 403


def test_missing_subject_is_not_found(school):
    assert client.delete(f"{BASE}/{uuid4()}/", headers=HEADERS).status_code == 404


def test_dependency_check_failure_never_deletes(school, monkeypatch):
    from sqlalchemy.exc import OperationalError
    from app.crud import academic

    def unavailable(*args):
        raise OperationalError("catalog", {}, Exception("unavailable"))

    monkeypatch.setattr(academic, "inspect", unavailable)
    assert client.delete(f"{BASE}/{school['subject']}/", headers=HEADERS).status_code == 503
    with SessionLocal() as db:
        assert db.get(Subject, school["subject"]) is not None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Operational tables are created by PostgreSQL migrations")
@pytest.mark.parametrize("name", ["homework", "exams"])
def test_migrated_operational_reference_is_preserved(school, name):
    from sqlalchemy import Table, MetaData

    with SessionLocal() as db:
        dependent = Table(name, MetaData(), autoload_with=db.connection())
        record_id = uuid4()
        db.execute(dependent.insert().values(id=record_id, tenant_id=school["tenant"],
                                            subject_id=school["subject"], title="Retention test"))
        db.commit()
    response = client.delete(f"{BASE}/{school['subject']}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.execute(select(dependent.c.subject_id).where(dependent.c.id == record_id)).scalar_one() == school["subject"]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FK row locks")
def test_concurrent_assessment_commit_blocks_subject_deletion(school):
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from time import monotonic, sleep
    from app.crud.academic import delete_subject, SubjectInUseError

    pids = Queue()

    def remove():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            with pytest.raises(SubjectInUseError):
                delete_subject(db, school["subject"], school["tenant"])
            return True

    with SessionLocal() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        assessment = Assessment(tenant_id=school["tenant"], subject_id=school["subject"], name="Concurrent exam", date=datetime(2026, 11, 1))
        writer.add(assessment)
        writer.flush()
        assessment_id = assessment.id
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
            assert blocked, "Subject deletion did not wait for the concurrent assessment"
            writer.commit()
        finally:
            writer.rollback()
        assert future.result(timeout=20) is True
    with SessionLocal() as db:
        assert db.get(Subject, school["subject"]) is not None
        assert db.get(Assessment, assessment_id).subject_id == school["subject"]
