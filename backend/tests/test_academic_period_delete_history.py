"""Deleting an academic year or a term must never erase or detach school history.

enrollments.academic_year_id is ON DELETE CASCADE and assessments.term_id /
assessments.academic_year_id / classes.academic_year_id are ON DELETE SET NULL:
an unguarded DELETE silently wipes a whole year of enrollments, or moves every
grade of a term out of its report-card period.
"""
from datetime import date, datetime
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Assessment, Classroom, Enrollment, Grade, Student, Subject  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.student import Gender  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture
def school():
    tenant, other, year, term, student, classroom, subject = (uuid4() for _ in range(7))
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Period retention", slug=f"period-history-{tid}", type="secondary", country="GN"))
        db.flush()
        db.add(AcademicYear(id=year, tenant_id=tenant, name="2026-2027", code=f"Y{year.hex[:6]}",
                            start_date=date(2026, 10, 1), end_date=date(2027, 7, 31)))
        db.flush()
        db.add_all([
            Term(id=term, tenant_id=tenant, academic_year_id=year, name="Trimestre 1",
                 start_date=date(2026, 10, 1), end_date=date(2026, 12, 20)),
            Student(id=student, tenant_id=tenant, registration_number=str(uuid4()), first_name="Aminata",
                    last_name="Camara", date_of_birth=date(2012, 3, 1), gender=Gender.FEMALE),
            Classroom(id=classroom, tenant_id=tenant, name="5ème B"),
            Subject(id=subject, tenant_id=tenant, name=f"Français {subject}"),
        ])
        db.commit()
    user = {"id": str(uuid4()), "tenant_id": str(tenant), "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    yield dict(tenant=tenant, other=other, year=year, term=term, student=student,
               classroom=classroom, subject=subject, user=user)
    app.dependency_overrides.pop(get_current_user, None)


def _drop_term(s):
    with SessionLocal() as db:
        db.delete(db.get(Term, s["term"]))
        db.commit()


def _add_enrollment(s):
    with SessionLocal() as db:
        row = Enrollment(tenant_id=s["tenant"], student_id=s["student"], class_id=s["classroom"],
                         academic_year_id=s["year"], status="ACTIVE")
        db.add(row)
        db.commit()
        return row.id


def _add_graded_assessment(s, **period):
    with SessionLocal() as db:
        assessment = Assessment(tenant_id=s["tenant"], subject_id=s["subject"], name="Devoir 1",
                                date=datetime(2026, 11, 5), **period)
        db.add(assessment)
        db.flush()
        grade = Grade(tenant_id=s["tenant"], student_id=s["student"], assessment_id=assessment.id,
                      score=14, max_score=20)
        db.add(grade)
        db.commit()
        return assessment.id, grade.id


# --- Academic year -------------------------------------------------------

def test_year_with_enrollments_is_kept_with_its_enrollments(school):
    _drop_term(school)  # the term is removed first, as the UI allows
    enrollment_id = _add_enrollment(school)
    response = client.delete(f"/api/v1/academic-years/{school['year']}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(AcademicYear, school["year"]) is not None
        assert db.get(Enrollment, enrollment_id).academic_year_id == school["year"]


@pytest.mark.parametrize("kind", ["class", "assessment"])
def test_year_referenced_by_classes_or_assessments_is_kept(school, kind):
    _drop_term(school)
    with SessionLocal() as db:
        if kind == "class":
            db.get(Classroom, school["classroom"]).academic_year_id = school["year"]
            db.commit()
            record_id, model = school["classroom"], Classroom
        else:
            record_id, model = _add_graded_assessment(school, academic_year_id=school["year"])[0], Assessment
    response = client.delete(f"/api/v1/academic-years/{school['year']}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(model, record_id).academic_year_id == school["year"]


def test_year_with_terms_answers_409_not_500(school):
    response = client.delete(f"/api/v1/academic-years/{school['year']}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(Term, school["term"]) is not None


def test_empty_year_can_be_deleted(school):
    _drop_term(school)
    assert client.delete(f"/api/v1/academic-years/{school['year']}/", headers=HEADERS).status_code == 204
    with SessionLocal() as db:
        assert db.get(AcademicYear, school["year"]) is None


def test_foreign_year_is_not_found_and_kept(school):
    _drop_term(school)
    enrollment_id = _add_enrollment(school)
    school["user"]["tenant_id"] = str(school["other"])
    assert client.delete(f"/api/v1/academic-years/{school['year']}/", headers=HEADERS).status_code == 404
    with SessionLocal() as db:
        assert db.get(Enrollment, enrollment_id) is not None


@pytest.mark.parametrize("role", ["TEACHER", "STUDENT", "PARENT", "ACCOUNTANT"])
def test_role_without_settings_write_cannot_delete_year(school, role):
    school["user"]["roles"] = [role]
    assert client.delete(f"/api/v1/academic-years/{school['year']}/", headers=HEADERS).status_code == 403


# --- Term ----------------------------------------------------------------

def test_term_with_assessments_is_kept_and_grades_stay_in_period(school):
    assessment_id, grade_id = _add_graded_assessment(school, term_id=school["term"])
    response = client.delete(f"/api/v1/terms/{school['term']}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(Term, school["term"]) is not None
        assert db.get(Assessment, assessment_id).term_id == school["term"]
        assert db.get(Grade, grade_id).score == 14


def test_empty_term_can_be_deleted(school):
    assert client.delete(f"/api/v1/terms/{school['term']}/", headers=HEADERS).status_code == 204
    with SessionLocal() as db:
        assert db.get(Term, school["term"]) is None


def test_foreign_term_is_not_found_and_kept(school):
    assessment_id, _ = _add_graded_assessment(school, term_id=school["term"])
    school["user"]["tenant_id"] = str(school["other"])
    assert client.delete(f"/api/v1/terms/{school['term']}/", headers=HEADERS).status_code == 404
    with SessionLocal() as db:
        assert db.get(Assessment, assessment_id).term_id == school["term"]


@pytest.mark.parametrize("role", ["TEACHER", "STUDENT", "PARENT", "ACCOUNTANT"])
def test_role_without_settings_write_cannot_delete_term(school, role):
    school["user"]["roles"] = [role]
    assert client.delete(f"/api/v1/terms/{school['term']}/", headers=HEADERS).status_code == 403


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="exams is created by PostgreSQL migrations")
def test_term_referenced_by_an_exam_is_kept(school):
    from sqlalchemy import MetaData, Table, select

    with SessionLocal() as db:
        exams = Table("exams", MetaData(), autoload_with=db.connection())
        exam_id = uuid4()
        db.execute(exams.insert().values(id=exam_id, tenant_id=school["tenant"], term_id=school["term"],
                                         title="Composition"))
        db.commit()
    assert client.delete(f"/api/v1/terms/{school['term']}/", headers=HEADERS).status_code == 409
    with SessionLocal() as db:
        assert db.execute(select(exams.c.term_id).where(exams.c.id == exam_id)).scalar_one() == school["term"]


@pytest.mark.parametrize("route", ["academic-years", "terms"])
def test_dependency_check_failure_never_deletes(school, monkeypatch, route):
    from sqlalchemy.exc import OperationalError
    from app.crud import academic

    if route == "academic-years":
        _drop_term(school)

    def unavailable(*args):
        raise OperationalError("catalog", {}, Exception("unavailable"))

    monkeypatch.setattr(academic, "inspect", unavailable)
    target = school["year"] if route == "academic-years" else school["term"]
    assert client.delete(f"/api/v1/{route}/{target}/", headers=HEADERS).status_code == 503
    with SessionLocal() as db:
        assert db.get(AcademicYear, school["year"]) is not None
        if route == "terms":
            assert db.get(Term, school["term"]) is not None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FK row locks")
def test_concurrent_enrollment_blocks_year_deletion(school):
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from time import monotonic, sleep
    from sqlalchemy import text
    from app.crud.academic import PeriodInUseError, delete_academic_year

    _drop_term(school)
    pids = Queue()

    def remove():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            with pytest.raises(PeriodInUseError):
                delete_academic_year(db, school["year"], school["tenant"])
            return True

    with SessionLocal() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        enrollment = Enrollment(tenant_id=school["tenant"], student_id=school["student"],
                                class_id=school["classroom"], academic_year_id=school["year"], status="ACTIVE")
        writer.add(enrollment)
        writer.flush()
        enrollment_id = enrollment.id
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
            assert blocked, "Year deletion did not wait for the concurrent enrollment"
            writer.commit()
        finally:
            writer.rollback()
        assert future.result(timeout=20) is True
    with SessionLocal() as db:
        assert db.get(AcademicYear, school["year"]) is not None
        assert db.get(Enrollment, enrollment_id).academic_year_id == school["year"]
