"""Authorization on the write endpoints of /api/v1/infrastructure/
(institutional-readiness audit, 2026-09).

Before this fix, create_room/create_program/update_program/delete_program/
create_classroom/create_enrollment/assign_subject_to_classroom/
remove_subject_from_classroom depended ONLY on get_current_user() — no
require_permission() at all. Any authenticated tenant user (STUDENT,
PARENT, ALUMNI included) could create or delete rooms, programs,
classrooms, enrollments, or reassign a classroom's subjects.

Reads (GET) are deliberately left open — broad academic-structure
visibility is intentional, same as subjects/levels.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
BASE = "/api/v1/infrastructure"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Infra Test", slug=f"infra-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _as(tenant_id: str, role: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestNoBusinessWritingInfrastructure:
    def test_student_cannot_create_room(self):
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/rooms/", json={"name": "Salle 101"}, headers=_as(tenant_id, "STUDENT"))
        assert resp.status_code == 403

    def test_parent_cannot_create_program(self):
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/programs/", json={"name": "Faux programme"}, headers=_as(tenant_id, "PARENT"))
        assert resp.status_code == 403

    def test_alumni_cannot_create_classroom(self):
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/classrooms/", json={"name": "Fausse classe"}, headers=_as(tenant_id, "ALUMNI"))
        assert resp.status_code == 403

    def test_student_cannot_create_enrollment(self):
        tenant_id = _make_tenant()
        resp = client.post(
            f"{BASE}/enrollments/",
            json={
                "student_id": str(uuid.uuid4()), "class_id": str(uuid.uuid4()),
                "academic_year_id": str(uuid.uuid4()),
            },
            headers=_as(tenant_id, "STUDENT"),
        )
        assert resp.status_code == 403

    def test_teacher_cannot_assign_subject_to_classroom(self):
        tenant_id = _make_tenant()
        resp = client.post(
            f"{BASE}/classrooms/{uuid.uuid4()}/subjects/{uuid.uuid4()}/",
            json={}, headers=_as(tenant_id, "TEACHER"),
        )
        assert resp.status_code == 403

    def test_student_cannot_remove_subject_from_classroom(self):
        tenant_id = _make_tenant()
        resp = client.delete(
            f"{BASE}/classrooms/{uuid.uuid4()}/subjects/{uuid.uuid4()}/",
            headers=_as(tenant_id, "STUDENT"),
        )
        assert resp.status_code == 403


class TestLegitimateAccessKeepsWorking:
    def test_tenant_admin_can_create_room(self):
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/rooms/", json={"name": "Salle 101"}, headers=_as(tenant_id, "TENANT_ADMIN"))
        assert resp.status_code == 200, resp.text

    def test_director_can_create_room(self):
        """DIRECTOR already has 'rooms:manage' in the frontend (permissions.ts)
        — must not regress now that the backend actually checks a permission."""
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/rooms/", json={"name": "Salle 102"}, headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text

    def test_tenant_admin_can_create_and_update_program(self):
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/programs/", json={"name": "Génie Civil"}, headers=_as(tenant_id, "TENANT_ADMIN"))
        assert resp.status_code == 200, resp.text
        program_id = resp.json()["id"]

        resp = client.patch(
            f"{BASE}/programs/{program_id}/", json={"code": "GC"}, headers=_as(tenant_id, "TENANT_ADMIN"),
        )
        assert resp.status_code == 200, resp.text

    def test_director_can_create_classroom(self):
        tenant_id = _make_tenant()
        resp = client.post(f"{BASE}/classrooms/", json={"name": "Terminale A"}, headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text

    def test_secretary_can_create_enrollment(self):
        tenant_id = _make_tenant()
        student_id = str(uuid.uuid4())
        classroom_id = str(uuid.uuid4())
        ay_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Student(
                id=student_id, tenant_id=tenant_id, registration_number="INFRA-1",
                first_name="Aissatou", last_name="Bah",
                date_of_birth=date(2011, 1, 1), gender=Gender.FEMALE,
                status=StudentStatus.ACTIVE,
            ))
            db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name="6e A"))
            db.add(AcademicYear(
                id=ay_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
                start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
            ))
            db.commit()

        resp = client.post(
            f"{BASE}/enrollments/",
            json={"student_id": student_id, "class_id": classroom_id, "academic_year_id": ay_id},
            headers=_as(tenant_id, "SECRETARY"),
        )
        assert resp.status_code == 200, resp.text

    def test_tenant_admin_can_assign_and_remove_subject_from_classroom(self):
        tenant_id = _make_tenant()
        classroom_id = str(uuid.uuid4())
        subject_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name="5e B"))
            db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
            db.commit()

        resp = client.post(
            f"{BASE}/classrooms/{classroom_id}/subjects/{subject_id}/",
            json={"coefficient": 2}, headers=_as(tenant_id, "TENANT_ADMIN"),
        )
        assert resp.status_code == 200, resp.text

        resp = client.delete(
            f"{BASE}/classrooms/{classroom_id}/subjects/{subject_id}/",
            headers=_as(tenant_id, "TENANT_ADMIN"),
        )
        assert resp.status_code == 200, resp.text
