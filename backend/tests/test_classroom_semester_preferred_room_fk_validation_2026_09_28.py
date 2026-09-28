"""POST /classrooms/, POST /classrooms/{class_id}/subjects/{subject_id}/,
POST /subject-preferred-rooms/, POST /semesters/ — 6th systematic audit
sweep, same bug class already fixed on subject associations (PR #251),
teacher assignments (_validate_assignment_fks in academic/teachers.py)
and student subject registration (_validate_student_and_subjects_in_tenant
in aliases.py).

crud/academic.py::create_classroom inserted level_id/campus_id/
program_id/academic_year_id/main_room_id/department_ids verbatim with no
check they belong to the caller's tenant; assign_subject_to_classroom
(operational/infrastructure.py) inserted class_id/subject_id (URL params)
the same way; create_subject_preferred_room inserted subject_id/room_id
verbatim; create_semester inserted academic_year_id verbatim. All of
these reference globally-unique-PK tables (not tenant-scoped composite
keys), so any caller holding the relevant :write permission in their own
tenant could point these associations at another tenant's data.
"""
import datetime
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.campus import Campus  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.program import Program  # noqa: E402
from app.models.room import Room  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

CLASSROOMS_BASE = "/api/v1/infrastructure/classrooms"
PREFERRED_ROOMS_BASE = "/api/v1/subject-preferred-rooms"
SEMESTERS_BASE = "/api/v1/semesters"


def _as(user: dict) -> dict:
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
            id=tenant_id, name="École Classes Test", slug=f"class-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_level(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Level(id=obj_id, tenant_id=tenant_id, name="6eme"))
        db.commit()
    return obj_id


def _make_campus(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Campus(id=obj_id, tenant_id=tenant_id, name="Campus Principal"))
        db.commit()
    return obj_id


def _make_program(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Program(id=obj_id, tenant_id=tenant_id, name="Programme Standard"))
        db.commit()
    return obj_id


def _make_academic_year(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=obj_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=datetime.date(2026, 9, 1), end_date=datetime.date(2027, 7, 1), is_current=True,
        ))
        db.commit()
    return obj_id


def _make_room(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Room(id=obj_id, tenant_id=tenant_id, name="Salle 101"))
        db.commit()
    return obj_id


def _make_department(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Department(id=obj_id, tenant_id=tenant_id, name="Sciences"))
        db.commit()
    return obj_id


def _make_subject(tenant_id: str, name: str = "Mathématiques") -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=obj_id, tenant_id=tenant_id, name=name))
        db.commit()
    return obj_id


def _make_classroom(tenant_id: str) -> str:
    obj_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=obj_id, tenant_id=tenant_id, name="6eme A"))
        db.commit()
    return obj_id


class TestCreateClassroomValidatesForeignKeys:
    def test_level_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_level_id = _make_level(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={"name": "6eme B", "level_id": foreign_level_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_campus_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_campus_id = _make_campus(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={"name": "6eme B", "campus_id": foreign_campus_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_program_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_program_id = _make_program(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={"name": "6eme B", "program_id": foreign_program_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_academic_year_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_ay_id = _make_academic_year(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={"name": "6eme B", "academic_year_id": foreign_ay_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_main_room_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_room_id = _make_room(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={"name": "6eme B", "main_room_id": foreign_room_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_department_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_dept_id = _make_department(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={"name": "6eme B", "department_ids": [foreign_dept_id]}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_classroom_within_own_tenant_is_created(self):
        tenant_id = _make_tenant()
        level_id = _make_level(tenant_id)
        campus_id = _make_campus(tenant_id)
        program_id = _make_program(tenant_id)
        ay_id = _make_academic_year(tenant_id)
        room_id = _make_room(tenant_id)
        dept_id = _make_department(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{CLASSROOMS_BASE}/", json={
            "name": "6eme C", "level_id": level_id, "campus_id": campus_id, "program_id": program_id,
            "academic_year_id": ay_id, "main_room_id": room_id, "department_ids": [dept_id],
        }, headers=headers)
        assert resp.status_code == 200, resp.text


class TestAssignSubjectToClassroomValidatesForeignKeys:
    def test_class_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_class_id = _make_classroom(tenant_b)
        subject_id = _make_subject(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/{foreign_class_id}/subjects/{subject_id}/", json={}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_subject_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        class_id = _make_classroom(tenant_a)
        foreign_subject_id = _make_subject(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{CLASSROOMS_BASE}/{class_id}/subjects/{foreign_subject_id}/", json={}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_assignment_within_own_tenant_succeeds(self):
        tenant_id = _make_tenant()
        class_id = _make_classroom(tenant_id)
        subject_id = _make_subject(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{CLASSROOMS_BASE}/{class_id}/subjects/{subject_id}/", json={}, headers=headers)
        assert resp.status_code == 200, resp.text


class TestCreateSubjectPreferredRoomValidatesForeignKeys:
    def test_subject_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_subject_id = _make_subject(tenant_b)
        room_id = _make_room(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{PREFERRED_ROOMS_BASE}/", json={
            "subject_id": foreign_subject_id, "room_id": room_id,
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_room_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        subject_id = _make_subject(tenant_a)
        foreign_room_id = _make_room(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{PREFERRED_ROOMS_BASE}/", json={
            "subject_id": subject_id, "room_id": foreign_room_id,
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_link_within_own_tenant_is_created(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        room_id = _make_room(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{PREFERRED_ROOMS_BASE}/", json={
            "subject_id": subject_id, "room_id": room_id,
        }, headers=headers)
        assert resp.status_code == 201, resp.text


class TestCreateSemesterValidatesForeignKeys:
    def test_academic_year_from_another_tenant_is_rejected(self):
        tenant_a, tenant_b = _make_tenant(), _make_tenant()
        foreign_ay_id = _make_academic_year(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{SEMESTERS_BASE}/", json={
            "academic_year_id": foreign_ay_id, "name": "Semestre 1", "number": 1,
            "start_date": "2026-09-01", "end_date": "2027-01-31",
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_semester_within_own_tenant_is_created(self):
        tenant_id = _make_tenant()
        ay_id = _make_academic_year(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{SEMESTERS_BASE}/", json={
            "academic_year_id": ay_id, "name": "Semestre 1", "number": 1,
            "start_date": "2026-09-01", "end_date": "2027-01-31",
        }, headers=headers)
        assert resp.status_code == 201, resp.text
