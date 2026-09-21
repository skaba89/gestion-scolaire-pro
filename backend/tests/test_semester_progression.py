"""Semester progression gate — LMD build-out, follow-up to PR #218
(faculties/semesters/subject_prerequisites/ECTS GPA).

A semester can declare `credits_required_to_advance`: ECTS a student must
have earned from that semester's own subjects before enrolling in the next
semester's subjects (same academic year, number + 1). Inert by default —
a semester with no threshold, or a subject with no semester_id at all,
never blocks anything.

Raw SQL in progression.py compares dashed UUID strings, same documented
SQLite limitation as test_transcripts.py/test_student_subjects_registration.py.
Postgres-only.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.semester import Semester  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Raw SQL compares dashed UUID strings, incompatible with SQLite's dash-less hex GUID storage.",
)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _build_two_semester_fixture(*, credits_required: float | None, student_score: float | None):
    """Tenant + student + academic year + S1 (with one 6-ECTS subject) +
    S2 (with one subject, credits_required_to_advance=`credits_required`).
    `student_score` is the student's grade in the S1 subject (None = no
    grade recorded at all — should behave the same as an unearned credit)."""
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    year_id = str(uuid.uuid4())
    semester1_id = str(uuid.uuid4())
    semester2_id = str(uuid.uuid4())
    s1_subject_id = str(uuid.uuid4())
    s2_subject_id = str(uuid.uuid4())

    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="Université Progression Test", slug=f"prog-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.flush()
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{student_id[:8]}",
            first_name="Fatoumata", last_name="Barry",
            date_of_birth=date(2002, 3, 15), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.add(AcademicYear(
            id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
        ))
        db.commit()

        db.add(Semester(
            id=semester1_id, tenant_id=tenant_id, academic_year_id=year_id,
            name="Semestre 1", number=1, start_date=date(2026, 9, 1), end_date=date(2027, 1, 31),
            # credits_required_to_advance lives on the semester being
            # COMPLETED — it gates entry to the NEXT semester (S2), not
            # entry to itself (see app/services/progression.py docstring).
            credits_required_to_advance=credits_required,
        ))
        db.add(Semester(
            id=semester2_id, tenant_id=tenant_id, academic_year_id=year_id,
            name="Semestre 2", number=2, start_date=date(2027, 2, 1), end_date=date(2027, 6, 30),
        ))
        db.commit()

        db.add(Subject(id=s1_subject_id, tenant_id=tenant_id, name="Algorithmique", ects=6.0, semester_id=semester1_id))
        db.add(Subject(id=s2_subject_id, tenant_id=tenant_id, name="Bases de Données", ects=6.0, semester_id=semester2_id))
        db.commit()

        if student_score is not None:
            assessment_id = str(uuid.uuid4())
            db.add(Assessment(
                id=assessment_id, tenant_id=tenant_id, name="Examen Algorithmique",
                max_score=20.0, date=date(2026, 12, 1), assessment_type="EXAM", weight=1.0,
                subject_id=s1_subject_id, academic_year_id=year_id,
            ))
            db.commit()
            db.add(Grade(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                assessment_id=assessment_id, subject_id=s1_subject_id,
                academic_year_id=year_id, score=student_score, max_score=20.0, coefficient=1.0,
            ))
            db.commit()

    return {
        "tenant_id": tenant_id, "student_id": student_id,
        "semester1_id": semester1_id, "semester2_id": semester2_id,
        "s1_subject_id": s1_subject_id, "s2_subject_id": s2_subject_id,
    }


@_needs_postgres
class TestSemesterProgressionEligibilityEndpoint:
    def test_first_semester_always_eligible(self):
        """No previous semester exists (number - 1 = 0) -> always eligible,
        regardless of any threshold."""
        ctx = _build_two_semester_fixture(credits_required=None, student_score=None)
        resp = client.get(
            f"/api/v1/semesters/{ctx['semester1_id']}/progression/{ctx['student_id']}/",
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["eligible"] is True
        assert resp.json()["reason"] == "no_previous_semester"

    def test_eligible_when_no_threshold_configured(self):
        ctx = _build_two_semester_fixture(credits_required=None, student_score=8.0)
        resp = client.get(
            f"/api/v1/semesters/{ctx['semester2_id']}/progression/{ctx['student_id']}/",
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["eligible"] is True
        assert resp.json()["reason"] == "no_threshold_configured"

    def test_ineligible_when_credits_insufficient(self):
        """8/20 fails the 10/20 pass threshold -> the S1 subject's 6 ECTS
        are never earned -> below S2's 6.0-credit requirement."""
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=8.0)
        resp = client.get(
            f"/api/v1/semesters/{ctx['semester2_id']}/progression/{ctx['student_id']}/",
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["eligible"] is False
        assert data["reason"] == "insufficient_credits"
        assert data["credits_earned"] == 0.0
        assert data["credits_required"] == 6.0

    def test_eligible_when_credits_sufficient(self):
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=15.0)
        resp = client.get(
            f"/api/v1/semesters/{ctx['semester2_id']}/progression/{ctx['student_id']}/",
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["eligible"] is True
        assert data["reason"] == "credits_sufficient"
        assert data["credits_earned"] == 6.0

    def test_no_grade_at_all_counts_as_unearned(self):
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=None)
        resp = client.get(
            f"/api/v1/semesters/{ctx['semester2_id']}/progression/{ctx['student_id']}/",
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["eligible"] is False

    def test_requires_grades_read_permission(self):
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=15.0)
        resp = client.get(
            f"/api/v1/semesters/{ctx['semester2_id']}/progression/{ctx['student_id']}/",
            headers=_as({"id": str(uuid.uuid4()), "roles": ["ACCOUNTANT"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 403, resp.text


@_needs_postgres
class TestSemesterProgressionBlocksEnrollment:
    URL = "/api/v1/student-subjects/"

    def test_registration_blocked_when_credits_insufficient(self):
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=8.0)
        resp = client.post(
            self.URL,
            json={"student_id": ctx["student_id"], "subject_ids": [ctx["s2_subject_id"]]},
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 422, resp.text
        blocked = resp.json()["details"]["blocked_by_semester_progression"]
        assert ctx["s2_subject_id"] in blocked
        assert blocked[ctx["s2_subject_id"]]["eligible"] is False

    def test_registration_allowed_when_credits_sufficient(self):
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=15.0)
        resp = client.post(
            self.URL,
            json={"student_id": ctx["student_id"], "subject_ids": [ctx["s2_subject_id"]]},
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 201, resp.text

    def test_registration_into_subject_without_semester_is_unaffected(self):
        """The overwhelming majority case — a subject never assigned to a
        semester at all — must never be gated by this feature."""
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=8.0)
        tenant_id = ctx["tenant_id"]
        student_id = ctx["student_id"]
        plain_subject_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Subject(id=plain_subject_id, tenant_id=tenant_id, name="Sport", ects=1.0))
            db.commit()

        resp = client.post(
            self.URL,
            json={"student_id": student_id, "subject_ids": [plain_subject_id]},
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 201, resp.text

    def test_registration_into_first_semester_is_never_blocked(self):
        ctx = _build_two_semester_fixture(credits_required=6.0, student_score=None)
        resp = client.post(
            self.URL,
            json={"student_id": ctx["student_id"], "subject_ids": [ctx["s1_subject_id"]]},
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 201, resp.text
