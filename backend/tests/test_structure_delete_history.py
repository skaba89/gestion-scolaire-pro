"""Deleting a school structure in use must never detach or erase what depends on it.

classes.level_id / campus_id / program_id, subjects.semester_id,
departments.faculty_id and exams.department_id are ON DELETE SET NULL;
rooms.campus_id and department members/alerts/class links are ON DELETE
CASCADE. An unguarded DELETE silently strips classes of their level (and of
the level's grading rules), drops a campus's rooms, or wipes a department's
staff and history.
"""
from datetime import date
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Classroom, Subject  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.associations import subject_departments, subject_levels  # noqa: E402
from app.models.campus import Campus  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.faculty import Faculty  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.program import Program  # noqa: E402
from app.models.room import Room  # noqa: E402
from app.models.semester import Semester  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

# kind -> (model, URL prefix)
ROUTES = {
    "level": (Level, "/api/v1/levels"),
    "campus": (Campus, "/api/v1/campuses"),
    "semester": (Semester, "/api/v1/semesters"),
    "faculty": (Faculty, "/api/v1/faculties"),
    "department": (Department, "/api/v1/departments"),
    "program": (Program, "/api/v1/infrastructure/programs"),
}


@pytest.fixture
def school():
    tenant, other, year = uuid4(), uuid4(), uuid4()
    ids = {kind: uuid4() for kind in ROUTES}
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Structure retention", slug=f"structure-history-{tid}",
                          type="university", country="GN"))
        db.flush()
        db.add(AcademicYear(id=year, tenant_id=tenant, name="2026-2027", code=f"Y{year.hex[:6]}",
                            start_date=date(2026, 10, 1), end_date=date(2027, 7, 31)))
        db.flush()
        db.add_all([
            Level(id=ids["level"], tenant_id=tenant, name="Licence 1"),
            Campus(id=ids["campus"], tenant_id=tenant, name="Campus Kankan"),
            Semester(id=ids["semester"], tenant_id=tenant, academic_year_id=year, name="S1", number=1,
                     start_date=date(2026, 10, 1), end_date=date(2027, 2, 15)),
            Faculty(id=ids["faculty"], tenant_id=tenant, name="Sciences"),
            Department(id=ids["department"], tenant_id=tenant, name="Mathématiques"),
            Program(id=ids["program"], tenant_id=tenant, name="Licence Maths"),
        ])
        db.commit()
    user = {"id": str(uuid4()), "tenant_id": str(tenant), "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    yield dict(tenant=tenant, other=other, user=user, **ids)
    app.dependency_overrides.pop(get_current_user, None)


def _delete(s, kind):
    return client.delete(f"{ROUTES[kind][1]}/{s[kind]}/", headers=HEADERS)


def _exists(s, kind):
    with SessionLocal() as db:
        return db.get(ROUTES[kind][0], s[kind]) is not None


@pytest.mark.parametrize("kind,column", [("level", "level_id"), ("campus", "campus_id"), ("program", "program_id")])
def test_structure_used_by_a_class_is_kept_and_class_stays_attached(school, kind, column):
    class_id = uuid4()
    with SessionLocal() as db:
        db.add(Classroom(id=class_id, tenant_id=school["tenant"], name="L1 A", **{column: school[kind]}))
        db.commit()
    response = _delete(school, kind)
    assert response.status_code == 409, response.text
    assert _exists(school, kind)
    with SessionLocal() as db:
        assert getattr(db.get(Classroom, class_id), column) == school[kind]


def test_campus_with_rooms_keeps_its_rooms(school):
    room_id = uuid4()
    with SessionLocal() as db:
        db.add(Room(id=room_id, tenant_id=school["tenant"], name="Amphi A", campus_id=school["campus"]))
        db.commit()
    assert _delete(school, "campus").status_code == 409
    with SessionLocal() as db:
        assert db.get(Room, room_id).campus_id == school["campus"]


def test_semester_used_by_a_subject_is_kept(school):
    subject_id = uuid4()
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=school["tenant"], name=f"Analyse {subject_id}",
                       semester_id=school["semester"]))
        db.commit()
    assert _delete(school, "semester").status_code == 409
    with SessionLocal() as db:
        assert db.get(Subject, subject_id).semester_id == school["semester"]


def test_faculty_with_departments_is_kept(school):
    with SessionLocal() as db:
        db.get(Department, school["department"]).faculty_id = school["faculty"]
        db.commit()
    assert _delete(school, "faculty").status_code == 409
    with SessionLocal() as db:
        assert db.get(Department, school["department"]).faculty_id == school["faculty"]


def test_department_linked_to_a_class_is_kept(school):
    from sqlalchemy import select
    from app.models.associations import classroom_departments

    class_id = uuid4()
    with SessionLocal() as db:
        db.add(Classroom(id=class_id, tenant_id=school["tenant"], name="L1 B"))
        db.flush()
        db.execute(classroom_departments.insert().values(tenant_id=school["tenant"], class_id=class_id,
                                                         department_id=school["department"]))
        db.commit()
    assert _delete(school, "department").status_code == 409
    with SessionLocal() as db:
        assert db.execute(select(classroom_departments).where(
            classroom_departments.c.department_id == school["department"])).first() is not None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="department_members is created by PostgreSQL migrations")
def test_department_with_members_keeps_them(school):
    from sqlalchemy import MetaData, Table, select

    with SessionLocal() as db:
        members = Table("department_members", MetaData(), autoload_with=db.connection())
        user_id = uuid4()
        from app.models.user import User
        db.add(User(id=user_id, tenant_id=school["tenant"], email=f"{user_id}@ex.gn", username=str(user_id),
                    first_name="Ibrahima", last_name="Sow", password_hash="x"))
        db.flush()
        db.execute(members.insert().values(id=uuid4(), tenant_id=school["tenant"],
                                           department_id=school["department"], user_id=user_id))
        db.commit()
    assert _delete(school, "department").status_code == 409
    with SessionLocal() as db:
        assert db.execute(select(members.c.id).where(members.c.department_id == school["department"])).first()


def test_catalogue_links_alone_do_not_block_deletion(school):
    """subject_levels / subject_departments are configuration, not history."""
    subject_id = uuid4()
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=school["tenant"], name=f"Algèbre {subject_id}"))
        db.flush()
        db.execute(subject_levels.insert().values(tenant_id=school["tenant"], subject_id=subject_id,
                                                  level_id=school["level"]))
        db.execute(subject_departments.insert().values(tenant_id=school["tenant"], subject_id=subject_id,
                                                       department_id=school["department"]))
        db.commit()
    assert _delete(school, "level").status_code in (200, 204)
    assert _delete(school, "department").status_code in (200, 204)
    assert not _exists(school, "level") and not _exists(school, "department")
    with SessionLocal() as db:
        assert db.get(Subject, subject_id) is not None


@pytest.mark.parametrize("kind", list(ROUTES))
def test_unused_structure_can_be_deleted(school, kind):
    assert _delete(school, kind).status_code in (200, 204)
    assert not _exists(school, kind)


@pytest.mark.parametrize("kind", list(ROUTES))
def test_foreign_structure_is_not_found_and_kept(school, kind):
    school["user"]["tenant_id"] = str(school["other"])
    assert _delete(school, kind).status_code == 404
    assert _exists(school, kind)


@pytest.mark.parametrize("kind", list(ROUTES))
def test_parent_cannot_delete_structure(school, kind):
    school["user"]["roles"] = ["PARENT"]
    assert _delete(school, kind).status_code == 403
    assert _exists(school, kind)


def test_level_with_an_application_answers_409_not_500(school):
    from app.models.admission import AdmissionApplication

    application_id = uuid4()
    with SessionLocal() as db:
        db.add(AdmissionApplication(id=application_id, tenant_id=school["tenant"], level_id=school["level"],
                                    student_first_name="Fanta", student_last_name="Keita",
                                    parent_first_name="Moussa", parent_last_name="Keita",
                                    parent_email="parent@ex.gn", parent_phone="+224600000000"))
        db.commit()
    assert _delete(school, "level").status_code == 409
    with SessionLocal() as db:
        assert db.get(AdmissionApplication, application_id).level_id == school["level"]


@pytest.mark.parametrize("kind", list(ROUTES))
def test_dependency_check_failure_never_deletes(school, monkeypatch, kind):
    from sqlalchemy.exc import OperationalError
    from app.crud import academic

    def unavailable(*args):
        raise OperationalError("catalog", {}, Exception("unavailable"))

    monkeypatch.setattr(academic, "inspect", unavailable)
    assert _delete(school, kind).status_code == 503
    assert _exists(school, kind)


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FK row locks")
def test_concurrent_class_blocks_level_deletion(school):
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from time import monotonic, sleep
    from sqlalchemy import text
    from app.crud.academic import StructureInUseError, delete_level

    pids = Queue()

    def remove():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            with pytest.raises(StructureInUseError):
                delete_level(db, school["level"], school["tenant"])
            return True

    class_id = uuid4()
    with SessionLocal() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        writer.add(Classroom(id=class_id, tenant_id=school["tenant"], name="L1 C", level_id=school["level"]))
        writer.flush()
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
            assert blocked, "Level deletion did not wait for the concurrent class"
            writer.commit()
        finally:
            writer.rollback()
        assert future.result(timeout=20) is True
    assert _exists(school, "level")
    with SessionLocal() as db:
        assert db.get(Classroom, class_id).level_id == school["level"]
