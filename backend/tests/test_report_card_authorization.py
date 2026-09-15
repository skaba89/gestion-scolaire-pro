"""Authorization on POST /api/v1/school-life/generate-report-card/v2/ and
.../generate-report-cards/batch/ (institutional-readiness audit, 2026-09).

Before this fix, both endpoints depended on get_current_user() ONLY — no
require_permission() and no ownership check — even though they fetch a
real student's (or a whole classroom's) grades, rank and absences
server-side by ID. Any authenticated STUDENT or PARENT could pass any
student_id/classroom_id in the tenant and download someone else's child's
grades, or an entire class's.

Same fix pattern already established and tested for GET /grades/ in
academic/grades.py::list_grades (see its own "Règle métier /
confidentialité" comment) — reused verbatim here.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
V2_URL = "/api/v1/school-life/generate-report-card/v2/"
BATCH_URL = "/api/v1/school-life/generate-report-cards/batch/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Bulletin Test", slug=f"bulletin-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=reg,
            first_name="Mamadou", last_name="Bah",
            date_of_birth=date(2010, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", password_hash="x",
            first_name="Test", last_name="User", is_active=True,
        ))
        db.commit()
    return user_id


def _link_parent(tenant_id: str, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id,
            parent_id=parent_id, student_id=student_id,
        ))
        db.commit()


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _v2_payload(student_id: str) -> dict:
    return {
        "student_id": student_id,
        "term_id": str(uuid.uuid4()),
        "classroom_id": str(uuid.uuid4()),
    }


class TestV2NoBusinessReadingSomeoneElsesReportCard:
    def test_student_cannot_view_another_students_report_card(self):
        tenant_id = _make_tenant()
        student_account_id = _make_user(tenant_id)
        own_id = _make_student(tenant_id, reg="REG-OWN-1")
        other_id = _make_student(tenant_id, reg="REG-OTHER-1")
        with SessionLocal() as db:
            db.query(Student).filter(Student.id == own_id).update({"user_id": student_account_id})
            db.commit()
        student_user = {"id": student_account_id, "roles": ["STUDENT"], "tenant_id": tenant_id}

        resp = _as(student_user).post(V2_URL, json=_v2_payload(other_id), headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_cannot_view_unrelated_childs_report_card(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        own_child_id = _make_student(tenant_id, reg="REG-CHILD-1")
        other_child_id = _make_student(tenant_id, reg="REG-CHILD-2")
        _link_parent(tenant_id, parent_id, own_child_id)
        parent_user = {"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}

        resp = _as(parent_user).post(V2_URL, json=_v2_payload(other_child_id), headers=HEADERS)
        assert resp.status_code == 403

    def test_teacher_cannot_batch_generate_via_wrong_role(self):
        """grades:write gate — a role with only grades:read (STUDENT) must
        never reach the classroom-wide batch export."""
        tenant_id = _make_tenant()
        student_user = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student_user).post(
            BATCH_URL,
            json={"classroom_id": str(uuid.uuid4()), "term_id": str(uuid.uuid4())},
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_parent_cannot_batch_generate_whole_class(self):
        tenant_id = _make_tenant()
        parent_user = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent_user).post(
            BATCH_URL,
            json={"classroom_id": str(uuid.uuid4()), "term_id": str(uuid.uuid4())},
            headers=HEADERS,
        )
        assert resp.status_code == 403


class TestV2LegitimateAccessKeepsWorking:
    def test_student_can_view_own_report_card(self):
        tenant_id = _make_tenant()
        student_account_id = _make_user(tenant_id)
        own_id = _make_student(tenant_id, reg="REG-SELF-1")
        with SessionLocal() as db:
            db.query(Student).filter(Student.id == own_id).update({"user_id": student_account_id})
            db.commit()
        student_user = {"id": student_account_id, "roles": ["STUDENT"], "tenant_id": tenant_id}

        resp = _as(student_user).post(V2_URL, json=_v2_payload(own_id), headers=HEADERS)
        # 404 ("classroom introuvable") is an acceptable outcome here — the
        # point is it's authorized (no 403) and reaches real DB lookups.
        assert resp.status_code in (200, 404), resp.text

    def test_parent_can_view_own_childs_report_card(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        child_id = _make_student(tenant_id, reg="REG-CHILD-3")
        _link_parent(tenant_id, parent_id, child_id)
        parent_user = {"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}

        resp = _as(parent_user).post(V2_URL, json=_v2_payload(child_id), headers=HEADERS)
        assert resp.status_code in (200, 404), resp.text

    def test_teacher_can_target_any_students_report_card(self):
        tenant_id = _make_tenant()
        other_student_id = _make_student(tenant_id, reg="REG-CLASS-1")
        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}

        resp = _as(teacher_user).post(V2_URL, json=_v2_payload(other_student_id), headers=HEADERS)
        assert resp.status_code in (200, 404), resp.text
