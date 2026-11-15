"""Central LMD UE/ECUE validation, opt-in compensation and safe settings."""
import uuid
from datetime import date, datetime

import pytest

from conftest import get_test_client
from app.core.database import SessionLocal, engine
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models import AcademicYear, Assessment, Grade, Semester, Student, Subject, TeachingUnit, Tenant
from app.models.audit_log import AuditLog
from app.services.lmd_validation import build_semester_validation

client = get_test_client()


@pytest.fixture(autouse=True)
def _clear_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _fixture(scores=(12, 8), *, name="Université Validation"):
    tenant_id, year_id, semester_id, student_id = (str(uuid.uuid4()) for _ in range(4))
    with SessionLocal() as db:
        tenant = Tenant(id=tenant_id, name=name, slug=f"validation-{tenant_id[:8]}",
                        type="university", country="GN", settings={})
        db.add(tenant)
        db.flush()
        year = AcademicYear(id=year_id, tenant_id=tenant_id, name="2026-2027", code=f"Y-{tenant_id[:6]}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1))
        semester = Semester(id=semester_id, tenant_id=tenant_id, academic_year_id=year_id,
                            name="Semestre 1", number=1, start_date=date(2026, 9, 1), end_date=date(2027, 1, 31))
        student = Student(id=student_id, tenant_id=tenant_id, registration_number=f"MAT-{tenant_id[:8]}",
                          first_name="Aïssatou", last_name="Diallo", date_of_birth=date(2004, 2, 3), gender="FEMALE")
        db.add_all([year, semester, student])
        db.flush()
        unit = TeachingUnit(tenant_id=tenant_id, semester_id=semester_id, code="UE-MATH", name="Mathématiques", ects=6)
        db.add(unit)
        db.flush()
        subjects = [
            Subject(tenant_id=tenant_id, semester_id=semester_id, teaching_unit_id=unit.id,
                    code="ECUE-A", name="Algèbre", ects=3, coefficient=1),
            Subject(tenant_id=tenant_id, semester_id=semester_id, teaching_unit_id=unit.id,
                    code="ECUE-B", name="Analyse", ects=3, coefficient=1),
        ]
        db.add_all(subjects)
        db.flush()
        for subject, score in zip(subjects, scores):
            values = score if isinstance(score, (tuple, list)) else (score,)
            for index, value in enumerate(values, 1):
                assessment = Assessment(tenant_id=tenant_id, subject_id=subject.id, academic_year_id=year_id,
                                        name=f"Évaluation {index} {subject.code}", date=datetime(2027, 1, 10), max_score=20)
                db.add(assessment)
                db.flush()
                if value is not None:
                    db.add(Grade(tenant_id=tenant_id, student_id=student_id, subject_id=subject.id,
                                 assessment_id=assessment.id, academic_year_id=year_id, score=value, max_score=20))
        db.commit()
    user = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return {"tenant": tenant_id, "year": year_id, "semester": semester_id, "student": student_id,
            "headers": {"Authorization": f"Bearer {token}"}, "user": user}


def _rules(**overrides):
    return {
        "intra_ue_compensation_enabled": False,
        "semester_compensation_enabled": False,
        "semester_pass_grade": 10,
        "minimum_compensable_ue_grade": 5,
        "require_all_ecues_graded": True,
        **overrides,
    }


def test_default_preserves_per_ecue_capitalization():
    ctx = _fixture((12, 8))
    with SessionLocal() as db:
        result = build_semester_validation(
            db, tenant_id=ctx["tenant"], student_id=ctx["student"], semester_id=ctx["semester"],
        )
    assert result["rules_revision"] == 0
    assert result["compensation_applied"] is False
    assert result["status"] == "PARTIALLY_CAPITALIZED"
    assert result["ects_earned"] == 3
    assert result["ects_possible"] == 6
    assert result["teaching_units"][0]["average"] == 10


def test_unrounded_score_below_threshold_is_not_capitalized():
    ctx = _fixture((9.996, 12))
    with SessionLocal() as db:
        result = build_semester_validation(
            db, tenant_id=ctx["tenant"], student_id=ctx["student"], semester_id=ctx["semester"],
        )
    ecues = {item["code"]: item for item in result["teaching_units"][0]["ecues"]}
    assert ecues["ECUE-A"]["average"] == 10.0  # display rounding only
    assert ecues["ECUE-A"]["passed"] is False
    assert result["ects_earned"] == 3


def test_multiple_assessments_are_averaged_once_per_ecue():
    ctx = _fixture(((8, 12), 10))
    with SessionLocal() as db:
        result = build_semester_validation(
            db, tenant_id=ctx["tenant"], student_id=ctx["student"], semester_id=ctx["semester"],
        )
    assert result["teaching_units"][0]["average"] == 10
    assert result["ects_earned"] == 6
    assert result["ects_possible"] == 6


def test_same_named_units_remain_separate_by_identifier():
    ctx = _fixture((12, 12))
    with SessionLocal() as db:
        unit = TeachingUnit(
            tenant_id=ctx["tenant"], semester_id=ctx["semester"], code="UE-MATH-2", name="Mathématiques", ects=3,
        )
        db.add(unit)
        db.flush()
        subject = Subject(
            tenant_id=ctx["tenant"], semester_id=ctx["semester"], teaching_unit_id=unit.id,
            code="ECUE-C", name="Algèbre", ects=3, coefficient=1,
        )
        db.add(subject)
        db.flush()
        assessment = Assessment(
            tenant_id=ctx["tenant"], subject_id=subject.id, academic_year_id=ctx["year"],
            name="Examen ECUE-C", date=datetime(2027, 1, 10), max_score=20,
        )
        db.add(assessment)
        db.flush()
        db.add(Grade(
            tenant_id=ctx["tenant"], student_id=ctx["student"], subject_id=subject.id,
            assessment_id=assessment.id, academic_year_id=ctx["year"], score=11, max_score=20,
        ))
        db.commit()
        result = build_semester_validation(
            db, tenant_id=ctx["tenant"], student_id=ctx["student"], semester_id=ctx["semester"],
        )
    assert len(result["teaching_units"]) == 2
    assert {item["code"] for item in result["teaching_units"]} == {"UE-MATH", "UE-MATH-2"}
    assert result["ects_possible"] == 9
    assert result["ects_earned"] == 9


def test_semester_compensation_is_not_reported_when_nothing_needed_it():
    ctx = _fixture((12, 11))
    saved = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0, "rules": _rules(semester_compensation_enabled=True),
    })
    assert saved.status_code == 200
    result = client.get(
        f"/api/v1/semesters/{ctx['semester']}/validation/{ctx['student']}/", headers=ctx["headers"],
    ).json()
    assert result["compensation_applied"] is False
    assert result["status"] == "VALIDATED_DIRECT"


def test_intra_ue_compensation_is_explicit_and_audited():
    ctx = _fixture((12, 8))
    response = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0, "rules": _rules(intra_ue_compensation_enabled=True),
    })
    assert response.status_code == 200, response.text
    assert response.json()["revision"] == 1
    preview = client.get(
        f"/api/v1/semesters/{ctx['semester']}/validation/{ctx['student']}/", headers=ctx["headers"],
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["status"] == "VALIDATED_DIRECT"
    assert body["ects_earned"] == 6
    assert body["teaching_units"][0]["status"] == "VALIDATED_DIRECT"
    with SessionLocal() as db:
        assert db.query(AuditLog).filter(
            AuditLog.tenant_id == ctx["tenant"], AuditLog.action == "UPDATE_LMD_VALIDATION_RULES",
        ).count() == 1


def test_semester_compensation_respects_eliminatory_floor():
    ctx = _fixture((16, 4))
    saved = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0,
        "rules": _rules(semester_compensation_enabled=True, minimum_compensable_ue_grade=5),
    })
    assert saved.status_code == 200
    result = client.get(
        f"/api/v1/semesters/{ctx['semester']}/validation/{ctx['student']}/", headers=ctx["headers"],
    ).json()
    # UE average is 10, so intra-UE is not required; the UE is not below the
    # eliminatory floor even though one ECUE is. Only UE-level floors apply.
    assert result["compensation_applied"] is True
    assert result["status"] == "VALIDATED_COMPENSATION"


def test_incomplete_semester_is_never_compensated_by_default_policy():
    ctx = _fixture((14, None))
    saved = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0, "rules": _rules(semester_compensation_enabled=True),
    })
    assert saved.status_code == 200
    result = client.get(
        f"/api/v1/semesters/{ctx['semester']}/validation/{ctx['student']}/", headers=ctx["headers"],
    ).json()
    assert result["compensation_applied"] is False
    assert result["status"] == "INCOMPLETE"


def test_rules_revision_validation_and_generic_settings_bypass():
    ctx = _fixture()
    bad_floor = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0, "rules": _rules(semester_pass_grade=10, minimum_compensable_ue_grade=11),
    })
    assert bad_floor.status_code == 422
    saved = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0, "rules": _rules(intra_ue_compensation_enabled=True),
    })
    assert saved.status_code == 200
    stale = client.put("/api/v1/teaching-units/validation-rules/", headers=ctx["headers"], json={
        "expected_revision": 0, "rules": _rules(),
    })
    assert stale.status_code == 409
    bypass = client.patch("/api/v1/tenants/settings/", headers=ctx["headers"], json={
        "lmd_validation_rules": {"revision": 99, "rules": _rules()},
    })
    assert bypass.status_code == 422


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL row locks")
def test_concurrent_rules_update_accepts_one_writer():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from fastapi import HTTPException
    from starlette.requests import Request
    from app.api.v1.endpoints.academic.teaching_units import update_validation_rules
    from app.schemas.academic import LmdValidationRules, LmdValidationRulesUpdate

    ctx = _fixture(name="Université Concurrence LMD")
    barrier = Barrier(2)

    def save(enabled):
        with SessionLocal() as db:
            barrier.wait(timeout=10)
            try:
                body = LmdValidationRulesUpdate(
                    expected_revision=0,
                    rules=LmdValidationRules(**_rules(intra_ue_compensation_enabled=enabled)),
                )
                return update_validation_rules(
                    body, Request({"type": "http", "headers": []}), db, ctx["user"],
                )["revision"]
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [True, False]))
    assert sorted(results) == [1, 409]
