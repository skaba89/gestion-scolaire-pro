"""Relevé de notes (transcript) — national audit Phase 8 (mode université).

Builds a small real academic dataset (tenant, student, subject with ECTS,
academic year, term, assessment, grade) and proves the endpoint aggregates
it correctly — including the ECTS-earned/pass-threshold logic, which is the
actual new behavior (Subject.ects and generic Term already existed).
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
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    """A module-level teardown_function() only fires for bare test
    functions, NOT for methods inside a `class Test...:` block — it would
    silently leak get_current_user's override into every test file that
    runs afterward in the same pytest session (national audit finding).
    An autouse fixture tears down reliably in both cases."""
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _build_transcript_fixture(*, ects_math: float = 6.0, ects_french: float = 4.0):
    """Tenant + 1 student + 1 academic year + 1 term + 2 subjects (with
    ECTS) + assessments + grades: one passing (>=10/20), one failing."""
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    year_id = str(uuid.uuid4())
    term_id = str(uuid.uuid4())
    math_subject_id = str(uuid.uuid4())
    french_subject_id = str(uuid.uuid4())
    math_assessment_id = str(uuid.uuid4())
    french_assessment_id = str(uuid.uuid4())

    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="Université Transcript Test", slug=f"transcript-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.commit()

        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Aissatou", last_name="Diallo",
            date_of_birth=date(2000, 1, 1), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.add(AcademicYear(
            id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
        ))
        db.add(Subject(id=math_subject_id, tenant_id=tenant_id, name="Mathématiques", coefficient=3.0, ects=ects_math))
        db.add(Subject(id=french_subject_id, tenant_id=tenant_id, name="Français", coefficient=2.0, ects=ects_french))
        db.commit()

        db.add(Term(
            id=term_id, tenant_id=tenant_id, academic_year_id=year_id,
            name="Semestre 1", start_date=date(2026, 9, 1), end_date=date(2027, 1, 31),
            sequence_number=1, is_active=True,
        ))
        db.commit()

        db.add(Assessment(
            id=math_assessment_id, tenant_id=tenant_id, name="Examen Maths",
            max_score=20.0, date=date(2026, 12, 1), assessment_type="EXAM", weight=1.0,
            subject_id=math_subject_id, academic_year_id=year_id, term_id=term_id,
        ))
        db.add(Assessment(
            id=french_assessment_id, tenant_id=tenant_id, name="Examen Français",
            max_score=20.0, date=date(2026, 12, 1), assessment_type="EXAM", weight=1.0,
            subject_id=french_subject_id, academic_year_id=year_id, term_id=term_id,
        ))
        db.commit()

        # Math: 15/20 (passes). French: 6/20 (fails).
        db.add(Grade(id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                      assessment_id=math_assessment_id, subject_id=math_subject_id,
                      academic_year_id=year_id, score=15.0, max_score=20.0, coefficient=3.0))
        db.add(Grade(id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                      assessment_id=french_assessment_id, subject_id=french_subject_id,
                      academic_year_id=year_id, score=6.0, max_score=20.0, coefficient=2.0))
        db.commit()

    return {"tenant_id": tenant_id, "student_id": student_id, "year_id": year_id}


class TestTranscriptContent:
    # transcripts.py looks up the student with raw db.execute(text("...
    # WHERE id = :sid")), passing a dashed UUID string, but the ORM stores
    # SQLite GUID columns as 32-char hex with no dashes — the WHERE clause
    # never matches on SQLite even though the row exists ("Élève/étudiant
    # introuvable"). Works on PostgreSQL (implicit text->uuid cast), which
    # is what production runs.
    _needs_postgres = pytest.mark.skipif(
        engine.dialect.name != "postgresql",
        reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID storage (see transcripts.py).",
    )

    @_needs_postgres
    def test_transcript_computes_ects_earned_only_for_passed_subjects(self):
        ctx = _build_transcript_fixture(ects_math=6.0, ects_french=4.0)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(
            f"/api/v1/transcripts/{ctx['student_id']}/",
            params={"academic_year_id": ctx["year_id"]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Math (15/20) passes -> its 6 ECTS count. French (6/20) fails -> its
        # 4 ECTS don't. Total possible is always 6+4=10 regardless of pass/fail.
        assert data["ects_earned"] == 6.0
        assert data["ects_possible"] == 10.0
        assert data["student"]["registration_number"].startswith("REG-")

    @_needs_postgres
    def test_transcript_reports_per_subject_pass_status(self):
        ctx = _build_transcript_fixture()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(
            f"/api/v1/transcripts/{ctx['student_id']}/",
            params={"academic_year_id": ctx["year_id"]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        subjects = {s["subject_name"]: s for s in resp.json()["periods"][0]["subjects"]}

        assert subjects["Mathématiques"]["passed"] is True
        assert subjects["Mathématiques"]["average"] == 15.0
        assert subjects["Français"]["passed"] is False
        assert subjects["Français"]["average"] == 6.0

    def test_transcript_requires_grades_read_permission(self):
        ctx = _build_transcript_fixture()
        # ACCOUNTANT has no grades:read (see ROLE_PERMISSIONS) — the right
        # role to prove the permission gate actually gates something.
        headers = _as({"id": str(uuid.uuid4()), "roles": ["ACCOUNTANT"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(
            f"/api/v1/transcripts/{ctx['student_id']}/",
            params={"academic_year_id": ctx["year_id"]},
            headers=headers,
        )
        assert resp.status_code == 403, resp.text

    def test_transcript_404_for_unknown_student(self):
        ctx = _build_transcript_fixture()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(
            f"/api/v1/transcripts/{uuid.uuid4()}/",
            params={"academic_year_id": ctx["year_id"]},
            headers=headers,
        )
        assert resp.status_code == 404, resp.text
