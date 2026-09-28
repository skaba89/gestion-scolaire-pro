"""POST/PUT /subjects/ and POST /subjects/{id}/levels/{level_id}/
(academic/subjects.py, crud/academic.py) — 5th systematic audit sweep,
same bug class already fixed on teacher assignments
(test_teacher_assignment_fk_validation.py) and student subject
registration (aliases.py's _validate_student_and_subjects_in_tenant).

create_subject/update_subject inserted department_ids/level_ids/
prerequisite_subject_ids verbatim into subject_departments/subject_levels/
subject_prerequisites with no check they belong to the caller's tenant,
and assign_subject_to_level inserted subject_id/level_id the same way.
departments.id/levels.id/subjects.id are globally unique primary keys
(not tenant-scoped composite keys), so a TENANT_ADMIN/DEPARTMENT_HEAD
holding subjects:write in their own tenant could pass another tenant's
department/level/subject UUID and create a persistent cross-tenant
association row.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

BASE = "/api/v1/subjects"


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
            id=tenant_id, name="École Matières Test", slug=f"subj-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_department(tenant_id: str) -> str:
    dept_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Department(id=dept_id, tenant_id=tenant_id, name="Sciences"))
        db.commit()
    return dept_id


def _make_level(tenant_id: str) -> str:
    level_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Level(id=level_id, tenant_id=tenant_id, name="6eme"))
        db.commit()
    return level_id


def _make_subject(tenant_id: str, name: str = "Mathématiques") -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
        db.commit()
    return subject_id


class TestCreateSubjectValidatesAssociationForeignKeys:
    def test_department_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        foreign_dept_id = _make_department(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json={
            "name": "Physique", "department_ids": [foreign_dept_id],
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_level_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        foreign_level_id = _make_level(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json={
            "name": "Chimie", "level_ids": [foreign_level_id],
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_prerequisite_subject_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        foreign_subject_id = _make_subject(tenant_b, name="Biologie")
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json={
            "name": "Biologie Avancée", "prerequisite_subject_ids": [foreign_subject_id],
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_associations_within_own_tenant_are_created(self):
        tenant_id = _make_tenant()
        dept_id = _make_department(tenant_id)
        level_id = _make_level(tenant_id)
        prereq_id = _make_subject(tenant_id, name="Algèbre 1")
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json={
            "name": "Algèbre 2",
            "department_ids": [dept_id],
            "level_ids": [level_id],
            "prerequisite_subject_ids": [prereq_id],
        }, headers=headers)
        assert resp.status_code == 201, resp.text


class TestUpdateSubjectValidatesAssociationForeignKeys:
    def test_update_rejects_level_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_id = _make_subject(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        foreign_level_id = _make_level(tenant_b)
        resp = client.put(f"{BASE}/{subject_id}/", json={"level_ids": [foreign_level_id]}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_update_accepts_level_within_own_tenant(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        level_id = _make_level(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{subject_id}/", json={"level_ids": [level_id]}, headers=headers)
        assert resp.status_code == 200, resp.text


class TestAssignSubjectToLevelValidatesForeignKeys:
    def test_subject_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        foreign_subject_id = _make_subject(tenant_b)
        level_id = _make_level(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/{foreign_subject_id}/levels/{level_id}/", headers=headers)
        assert resp.status_code == 404, resp.text

    def test_level_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_id = _make_subject(tenant_a)
        foreign_level_id = _make_level(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/{subject_id}/levels/{foreign_level_id}/", headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_assignment_within_own_tenant_succeeds(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        level_id = _make_level(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/{subject_id}/levels/{level_id}/", headers=headers)
        assert resp.status_code == 200, resp.text
