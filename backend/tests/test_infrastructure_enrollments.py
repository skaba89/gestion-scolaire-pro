"""GET /infrastructure/enrollments/ — class_id/status filtering + nested
student payload (aliases.py has a mirrored /enrollments/ router too).

Regression: useAttendance.ts and useGrades.ts call this endpoint with
`class_id`/`status` query params and read `enrollment.student.*` from the
response, but the endpoint previously ignored both query params and never
returned a nested `student` object — every teacher's classroom roster came
back empty regardless of which class was selected.
"""
import datetime
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/infrastructure/enrollments/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_fixture():
    tenant_id = str(uuid.uuid4())
    ay_id = str(uuid.uuid4())
    class_a_id = str(uuid.uuid4())
    class_b_id = str(uuid.uuid4())
    student_active_id = str(uuid.uuid4())
    student_withdrawn_id = str(uuid.uuid4())

    with SessionLocal() as db:
        # Tenant must be committed first: Classroom/AcademicYear only carry a
        # raw tenant_id FK (no ORM relationship("Tenant")), so SQLAlchemy's
        # flush-order inference can't be trusted to insert Tenant first.
        db.add(Tenant(
            id=tenant_id, name="École Inscriptions Test", slug=f"enr-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
        db.add(AcademicYear(
            id=ay_id, tenant_id=tenant_id, name="2025-2026", code="2025-2026",
            start_date=datetime.date(2025, 9, 1), end_date=datetime.date(2026, 7, 1),
            is_current=True,
        ))
        db.add(Classroom(id=class_a_id, tenant_id=tenant_id, name="6e A"))
        db.add(Classroom(id=class_b_id, tenant_id=tenant_id, name="6e B"))
        db.add(Student(
            id=student_active_id, tenant_id=tenant_id, first_name="Aïcha", last_name="Bah",
            registration_number=f"REG-{uuid.uuid4().hex[:6]}", status=StudentStatus.ACTIVE,
            date_of_birth=datetime.date(2013, 3, 4), gender=Gender.FEMALE,
        ))
        db.add(Student(
            id=student_withdrawn_id, tenant_id=tenant_id, first_name="Ousmane", last_name="Diallo",
            registration_number=f"REG-{uuid.uuid4().hex[:6]}", status=StudentStatus.ACTIVE,
            date_of_birth=datetime.date(2013, 6, 9), gender=Gender.MALE,
        ))
        db.add(Enrollment(
            id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_active_id,
            class_id=class_a_id, academic_year_id=ay_id, status="ACTIVE",
        ))
        db.add(Enrollment(
            id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_withdrawn_id,
            class_id=class_a_id, academic_year_id=ay_id, status="WITHDRAWN",
        ))
        # Enrollment in a different class — must not leak into class_a results.
        db.add(Enrollment(
            id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_active_id,
            class_id=class_b_id, academic_year_id=ay_id, status="ACTIVE",
        ))
        db.commit()

    return tenant_id, class_a_id, class_b_id, student_active_id


class TestInfrastructureEnrollments:
    def test_filters_by_class_id(self):
        tenant_id, class_a_id, class_b_id, _ = _make_fixture()
        resp = client.get(URL, params={"class_id": class_a_id}, headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert len(rows) == 2
        assert all(r["class_id"] == class_a_id for r in rows)

    def test_filters_by_status(self):
        tenant_id, class_a_id, _, student_active_id = _make_fixture()
        resp = client.get(
            URL, params={"class_id": class_a_id, "status": "active"}, headers=_as(tenant_id)
        )
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["student_id"] == student_active_id
        assert rows[0]["status"] == "ACTIVE"

    def test_response_includes_nested_student(self):
        tenant_id, class_a_id, _, student_active_id = _make_fixture()
        resp = client.get(
            URL, params={"class_id": class_a_id, "status": "active"}, headers=_as(tenant_id)
        )
        assert resp.status_code == 200, resp.text
        row = resp.json()[0]
        assert row["student"] is not None
        assert row["student"]["id"] == student_active_id
        assert row["student"]["first_name"] == "Aïcha"
        assert row["student"]["registration_number"]

    def test_no_class_id_returns_all_tenant_enrollments(self):
        tenant_id, _, _, _ = _make_fixture()
        resp = client.get(URL, headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 3
