"""PUT /homework-submissions/{id} (aliases.py::update_homework_submission)
— institutional-readiness audit, 2026-09.

Two gaps: (a) graded_by came from the request body, falling back to the
caller only if absent — any holder of homework:write could attribute a
grade to an arbitrary user id instead of themselves, breaking the "who
actually graded this" audit trail. (b) grade (NUMERIC(5,2), no CHECK
constraint) was inserted with no bound at all.

homework_submissions is a raw-SQL operational table (Postgres-specific
DDL: gen_random_uuid()/TIMESTAMPTZ, see app/core/operational_tables.py)
never created in the SQLite test lifespan — same constraint as
test_homework_submission_ownership.py."""
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from conftest import get_test_client

client = get_test_client()

from app.core import teacher_scope  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from test_teacher_attendance_scope_2026_09_27 import _make_classroom, _make_schedule_slot, _make_subject, _make_student  # noqa: E402
from test_teacher_scope_unified import _assign  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="homework_submissions is a raw Postgres-only operational table (see app/core/operational_tables.py).",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/homework-submissions"


def _as(user: dict) -> dict:
    user = {**user, "_cycle_ids": None}  # compte non restreint (périmètre par cycle)
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Notation Devoirs Test", slug=f"hw-grade-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return user_id


def _make_submission(tenant_id: str, teacher_id: str, *, scheduled=False) -> str:
    submission_id = str(uuid.uuid4())
    homework_id = str(uuid.uuid4())
    student_id = _make_student(tenant_id, reg="Notation")
    classroom_id = _make_classroom(tenant_id, name="Classe de notation")
    if scheduled:
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=_make_subject(tenant_id),
                            teacher_id=teacher_id)
    else:
        _assign(tenant_id, teacher_id, classroom_id)
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO homework (id, tenant_id, classroom_id, title)
            VALUES (:id, :tid, :cid, 'Devoir de notation')
        """), {"id": homework_id, "tid": tenant_id, "cid": classroom_id})
        db.execute(text("""
            INSERT INTO homework_submissions (id, tenant_id, homework_id, student_id, content)
            VALUES (:id, :tid, :hid, :sid, 'Ma réponse')
        """), {"id": submission_id, "tid": tenant_id, "hid": homework_id, "sid": student_id})
        db.commit()
    return submission_id


class TestGradedByCannotBeSpoofed:
    def test_client_supplied_graded_by_is_ignored(self):
        tenant_id = _make_tenant()
        real_teacher = _make_user(tenant_id)
        other_teacher = _make_user(tenant_id)
        submission_id = _make_submission(tenant_id, real_teacher)
        headers = _as({"id": real_teacher, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{submission_id}", json={
            "grade": 15, "feedback": "Bien", "graded_by": other_teacher,
        }, headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            row = db.execute(text(
                "SELECT graded_by FROM homework_submissions WHERE id = :id"
            ), {"id": submission_id}).mappings().first()
        assert str(row["graded_by"]) == real_teacher
        assert str(row["graded_by"]) != other_teacher


class TestGradeBoundsEnforced:
    def test_negative_grade_is_rejected(self):
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        submission_id = _make_submission(tenant_id, teacher_id)
        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{submission_id}", json={"grade": -5}, headers=headers)
        assert resp.status_code == 422, resp.text

    def test_grade_above_scale_is_rejected(self):
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        submission_id = _make_submission(tenant_id, teacher_id)
        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{submission_id}", json={"grade": 999}, headers=headers)
        assert resp.status_code == 422, resp.text

    def test_valid_grade_within_scale_is_accepted(self):
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        submission_id = _make_submission(tenant_id, teacher_id)
        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{submission_id}", json={"grade": 17.5}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["grade"] == 17.5


@pytest.mark.parametrize(("method", "route"), [
    ("PUT", "/api/v1/homework-submissions/{id}"),
    ("POST", "/api/v1/homework/submissions/{id}/grade/"),
])
@pytest.mark.parametrize("scheduled", [False, True], ids=["affectation", "emploi-du-temps"])
def test_grading_checks_the_teachers_class(method, route, scheduled):
    tenant = _make_tenant()
    teacher = _make_user(tenant)
    submission = _make_submission(tenant, teacher, scheduled=scheduled)
    headers = _as({"id": teacher, "roles": ["TEACHER"], "tenant_id": tenant})

    # Observer la règle de classe réelle sur un rendu autorisé.
    with patch.object(teacher_scope, "teacher_teaches_class",
                      wraps=teacher_scope.teacher_teaches_class) as check:
        response = client.request(method, route.format(id=submission), headers=headers,
                                  json={"grade": 14, "feedback": "Bien"})
    assert response.status_code == 200, response.text
    check.assert_called_once()
    with SessionLocal() as db:
        row = db.execute(text("SELECT grade, feedback, graded_by FROM homework_submissions WHERE id = :id"),
                         {"id": submission}).one()
    assert (row.grade, row.feedback, str(row.graded_by)) == (14, "Bien", teacher)


@pytest.mark.parametrize("case", ["autre-classe", "autre-établissement", "absent", "invalide"])
def test_out_of_scope_submission_does_not_grant_grading(case):
    tenant = _make_tenant()
    assigned = _make_user(tenant)
    other = _make_user(tenant)
    submission = _make_submission(tenant, assigned)
    user = {"id": other, "tenant_id": tenant, "roles": ["TEACHER"], "_cycle_ids": None}
    target_tenant = _make_tenant() if case == "autre-établissement" else tenant
    target_id = {"absent": str(uuid.uuid4()), "invalide": "invalide"}.get(case, submission)
    user["tenant_id"] = target_tenant
    with SessionLocal() as db:
        with pytest.raises(HTTPException) as denied:
            teacher_scope.require_submission_grading_scope(db, target_tenant, user, target_id)
        assert denied.value.status_code == 404
        row = db.execute(text("SELECT grade, graded_by FROM homework_submissions WHERE id = :id"),
                         {"id": submission}).one()
        assert row == (None, None)
