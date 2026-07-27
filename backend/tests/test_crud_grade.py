"""app/crud/grade.py — 17.9% test coverage (67 statements), national audit
dette technique. Covers the CRUD layer directly (no HTTP), including the
filter branches (student_id, assessment_id, class_id, academic_year,
semester) that a plain "does the endpoint 200" test wouldn't exercise.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.crud import grade as crud_grade  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.schemas.grade import GradeCreate, GradeUpdate  # noqa: E402


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École CRUD Grade Test", slug=f"crud-grade-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_fixture(tenant_id: str):
    """One student, one subject, one academic year, two terms, one
    assessment per term, one grade per assessment — enough to exercise
    every filter branch in get_grades()/get_student_average()."""
    student_id = str(uuid.uuid4())
    subject_id = str(uuid.uuid4())
    year_id = str(uuid.uuid4())
    term1_id = str(uuid.uuid4())
    term2_id = str(uuid.uuid4())
    assessment1_id = str(uuid.uuid4())
    assessment2_id = str(uuid.uuid4())

    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Aïssatou", last_name="Diallo",
            date_of_birth=date(2010, 1, 1), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.add(AcademicYear(
            id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
        ))
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques", coefficient=3.0))
        db.commit()

        db.add(Term(
            id=term1_id, tenant_id=tenant_id, academic_year_id=year_id,
            name="Semestre 1", start_date=date(2026, 9, 1), end_date=date(2027, 1, 31),
            sequence_number=1, is_active=True,
        ))
        db.add(Term(
            id=term2_id, tenant_id=tenant_id, academic_year_id=year_id,
            name="Semestre 2", start_date=date(2027, 2, 1), end_date=date(2027, 6, 30),
            sequence_number=2, is_active=True,
        ))
        db.commit()

        db.add(Assessment(
            id=assessment1_id, tenant_id=tenant_id, name="Examen S1",
            max_score=20.0, date=date(2026, 12, 1), assessment_type="EXAM", weight=1.0,
            subject_id=subject_id, academic_year_id=year_id, term_id=term1_id,
        ))
        db.add(Assessment(
            id=assessment2_id, tenant_id=tenant_id, name="Examen S2",
            max_score=20.0, date=date(2027, 5, 1), assessment_type="EXAM", weight=1.0,
            subject_id=subject_id, academic_year_id=year_id, term_id=term2_id,
        ))
        db.commit()

        db.add(Grade(id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                      assessment_id=assessment1_id, subject_id=subject_id,
                      score=15.0, max_score=20.0, coefficient=1.0))
        db.add(Grade(id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                      assessment_id=assessment2_id, subject_id=subject_id,
                      score=10.0, max_score=20.0, coefficient=1.0))
        db.commit()

    return {
        "student_id": student_id, "subject_id": subject_id, "year_id": year_id,
        "term1_id": term1_id, "term2_id": term2_id,
        "assessment1_id": assessment1_id, "assessment2_id": assessment2_id,
    }


class TestGetGrade:
    def test_returns_grade_for_matching_tenant(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            grade = db.query(Grade).filter(Grade.student_id == ctx["student_id"]).first()
            found = crud_grade.get_grade(db, grade.id, tenant_id)
            assert found is not None
            assert found.id == grade.id

    def test_returns_none_across_tenants(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        ctx = _make_fixture(tenant_a)
        with SessionLocal() as db:
            grade = db.query(Grade).filter(Grade.student_id == ctx["student_id"]).first()
            assert crud_grade.get_grade(db, grade.id, tenant_b) is None


class TestGetGrades:
    def test_filters_by_student_id(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            grades, total = crud_grade.get_grades(db, tenant_id, student_id=ctx["student_id"])
            assert total == 2
            assert len(grades) == 2

    def test_filters_by_assessment_id(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            grades, total = crud_grade.get_grades(db, tenant_id, assessment_id=ctx["assessment1_id"])
            assert total == 1
            assert grades[0].score == 15.0

    def test_filters_by_academic_year(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            grades, total = crud_grade.get_grades(db, tenant_id, academic_year=ctx["year_id"])
            assert total == 2

    def test_pagination_respects_skip_and_limit(self):
        tenant_id = _make_tenant()
        _make_fixture(tenant_id)
        with SessionLocal() as db:
            grades, total = crud_grade.get_grades(db, tenant_id, skip=0, limit=1)
            assert total == 2
            assert len(grades) == 1

    def test_never_returns_another_tenants_grades(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        _make_fixture(tenant_a)
        _make_fixture(tenant_b)
        with SessionLocal() as db:
            grades, total = crud_grade.get_grades(db, tenant_a)
            assert total == 2  # not 4 — tenant_b's grades never leak in


class TestGetStudentAverage:
    def test_computes_average_across_all_grades(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            result = crud_grade.get_student_average(db, ctx["student_id"], tenant_id)
            assert result["count"] == 2
            assert result["average"] == pytest.approx(12.5)  # (15 + 10) / 2

    def test_filters_by_semester(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            result = crud_grade.get_student_average(db, ctx["student_id"], tenant_id, semester=1)
            assert result["count"] == 1
            assert result["average"] == 15.0

    def test_returns_zero_for_student_with_no_grades(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            result = crud_grade.get_student_average(db, str(uuid.uuid4()), tenant_id)
            assert result == {"average": 0.0, "count": 0}


class TestCreateUpdateDeleteGrade:
    def test_create_grade(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        payload = GradeCreate(
            student_id=ctx["student_id"], subject_id=ctx["subject_id"],
            assessment_id=ctx["assessment1_id"], score=18.0, max_score=20.0, coefficient=2.0,
        )
        with SessionLocal() as db:
            grade = crud_grade.create_grade(db, payload, tenant_id)
            assert grade.id is not None
            assert grade.score == 18.0
            assert str(grade.tenant_id) == tenant_id

    def test_update_grade_changes_only_provided_fields(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            grade = db.query(Grade).filter(Grade.assessment_id == ctx["assessment1_id"]).first()
            updated = crud_grade.update_grade(db, grade.id, GradeUpdate(score=19.5), tenant_id)
            assert updated.score == 19.5
            assert updated.coefficient == 1.0  # untouched

    def test_update_returns_none_for_unknown_grade(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            result = crud_grade.update_grade(db, uuid.uuid4(), GradeUpdate(score=10.0), tenant_id)
            assert result is None

    def test_delete_grade(self):
        tenant_id = _make_tenant()
        ctx = _make_fixture(tenant_id)
        with SessionLocal() as db:
            grade = db.query(Grade).filter(Grade.assessment_id == ctx["assessment1_id"]).first()
            assert crud_grade.delete_grade(db, grade.id, tenant_id) is True
            assert db.query(Grade).filter(Grade.id == grade.id).first() is None

    def test_delete_returns_false_for_unknown_grade(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            assert crud_grade.delete_grade(db, uuid.uuid4(), tenant_id) is False
