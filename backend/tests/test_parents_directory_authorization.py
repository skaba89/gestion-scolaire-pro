"""Authorization on GET /api/v1/parents/ and GET /api/v1/parents/students/{id}/parents/
(institutional-readiness audit, 2026-09).

Before this fix, both endpoints depended on get_current_user() ONLY — no
require_permission() and (for the second one) no ownership check — even
though the first returns the ENTIRE tenant's parent directory (name, email,
phone, address, occupation, linked children) and the second returns a named
student's parents' contact details for any student_id in the tenant. Any
authenticated STUDENT, TEACHER or ALUMNI could pull every parent's PII, or
look up a classmate's parents' phone numbers.

Same fix pattern already established for hr.py (P0) and
generate_smart_report_card (see test_hr_authorization.py /
test_report_card_authorization.py).
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
LIST_URL = "/api/v1/parents/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Parents Test", slug=f"parents-{tenant_id[:8]}",
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
            first_name="Fatoumata", last_name="Diallo",
            date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE,
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


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestNoBusinessReadingTheParentDirectory:
    def test_student_cannot_list_all_parents(self):
        tenant_id = _make_tenant()
        student_user = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student_user).get(LIST_URL, headers=HEADERS)
        assert resp.status_code == 403

    def test_teacher_cannot_list_all_parents(self):
        tenant_id = _make_tenant()
        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}
        resp = _as(teacher_user).get(LIST_URL, headers=HEADERS)
        assert resp.status_code == 403

    def test_student_cannot_view_another_students_parents(self):
        tenant_id = _make_tenant()
        other_student_id = _make_student(tenant_id, reg="REG-PAR-1")
        student_user = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student_user).get(f"/api/v1/parents/students/{other_student_id}/parents/", headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_cannot_view_arbitrary_students_parents(self):
        tenant_id = _make_tenant()
        other_student_id = _make_student(tenant_id, reg="REG-PAR-2")
        parent_user = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent_user).get(f"/api/v1/parents/students/{other_student_id}/parents/", headers=HEADERS)
        assert resp.status_code == 403


class TestLegitimateAccessKeepsWorking:
    def test_director_can_list_all_parents(self):
        tenant_id = _make_tenant()
        director_user = {"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": tenant_id}
        resp = _as(director_user).get(LIST_URL, headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_secretary_can_list_all_parents(self):
        tenant_id = _make_tenant()
        secretary_user = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}
        resp = _as(secretary_user).get(LIST_URL, headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_staff_can_list_all_parents(self):
        tenant_id = _make_tenant()
        staff_user = {"id": str(uuid.uuid4()), "roles": ["STAFF"], "tenant_id": tenant_id}
        resp = _as(staff_user).get(LIST_URL, headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_teacher_can_view_a_students_parents(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="REG-PAR-3")
        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}
        resp = _as(teacher_user).get(f"/api/v1/parents/students/{student_id}/parents/", headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_director_can_view_a_students_parents(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="REG-PAR-4")
        director_user = {"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": tenant_id}
        resp = _as(director_user).get(f"/api/v1/parents/students/{student_id}/parents/", headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_parent_can_view_own_childs_parents(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        child_id = _make_student(tenant_id, reg="REG-PAR-5")
        with SessionLocal() as db:
            db.add(ParentStudent(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                parent_id=parent_id, student_id=child_id,
            ))
            db.commit()
        parent_user = {"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent_user).get(f"/api/v1/parents/students/{child_id}/parents/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
