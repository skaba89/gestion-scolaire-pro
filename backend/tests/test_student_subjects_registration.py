"""Individual course registration (/student-subjects/) — institutional-
readiness audit, 2026-09, university/LMD "base structure".

POST /student-subjects/ has existed for a while but inserted into a
`student_subjects` table that never actually existed anywhere (no ORM
model, no migration) — every call against real PostgreSQL has always
failed with "relation student_subjects does not exist". Fixed alongside:
- adding the missing table (see 20260917_0001_add_student_subjects_table.py
  and app/models/associations.py),
- completing the CRUD (GET list, DELETE unassign — only POST existed),
- switching the permission from settings:write (a platform-config
  permission with no real relation to this action) to subjects:write —
  no prior behavior to preserve, the endpoint has never worked,
- validating that student_id/subject_id actually belong to the caller's
  tenant before inserting (previously trusted as-is).

Raw SQL here compares dashed UUID strings directly, which can't match
SQLite's dash-less hex GUID storage — same documented limitation as
test_payment_receipt.py for sibling endpoints. Postgres-only.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Raw SQL compares dashed UUID strings, incompatible with SQLite's dash-less hex GUID storage.",
)

URL = "/api/v1/student-subjects/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class _AuthedClient:
    def __init__(self, headers: dict):
        self._headers = headers

    def get(self, url, **kwargs):
        return client.get(url, headers=self._headers, **kwargs)

    def post(self, url, **kwargs):
        return client.post(url, headers=self._headers, **kwargs)

    def delete(self, url, **kwargs):
        return client.delete(url, headers=self._headers, **kwargs)


def _as(user: dict) -> _AuthedClient:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return _AuthedClient({"Authorization": f"Bearer {token}"})


def _make_tenant_with_student_and_subject():
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Inscription Cours Test", slug=f"course-reg-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.flush()
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{student_id[:8]}",
            first_name="Mariama", last_name="Camara",
            date_of_birth=date(2003, 2, 10), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.flush()
        db.add(Subject(
            id=subject_id, tenant_id=tenant_id, name="Algorithmique", code="ALG101",
            ects=6.0,
        ))
        db.commit()
    return {"tenant_id": tenant_id, "student_id": student_id, "subject_id": subject_id}


@_needs_postgres
class TestAssignSubjectsToStudent:
    def test_tenant_admin_can_register_student_for_course(self):
        ctx = _make_tenant_with_student_and_subject()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}).post(
            URL, json={"student_id": ctx["student_id"], "subject_ids": [ctx["subject_id"]]},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["total"] == 1

    def test_department_head_can_register_student_for_course(self):
        ctx = _make_tenant_with_student_and_subject()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": ctx["tenant_id"]}).post(
            URL, json={"student_id": ctx["student_id"], "subject_ids": [ctx["subject_id"]]},
        )
        assert resp.status_code == 201, resp.text

    def test_teacher_cannot_register_student_for_course(self):
        """TEACHER holds subjects:read only — no write access to curriculum assignment."""
        ctx = _make_tenant_with_student_and_subject()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": ctx["tenant_id"]}).post(
            URL, json={"student_id": ctx["student_id"], "subject_ids": [ctx["subject_id"]]},
        )
        assert resp.status_code == 403, resp.text

    def test_rejects_student_from_another_tenant(self):
        ctx = _make_tenant_with_student_and_subject()
        other = _make_tenant_with_student_and_subject()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}).post(
            URL, json={"student_id": other["student_id"], "subject_ids": [ctx["subject_id"]]},
        )
        assert resp.status_code == 404, resp.text

    def test_rejects_subject_from_another_tenant(self):
        ctx = _make_tenant_with_student_and_subject()
        other = _make_tenant_with_student_and_subject()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}).post(
            URL, json={"student_id": ctx["student_id"], "subject_ids": [other["subject_id"]]},
        )
        assert resp.status_code == 404, resp.text

    def test_assigning_twice_is_idempotent(self):
        ctx = _make_tenant_with_student_and_subject()
        headers_client = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        body = {"student_id": ctx["student_id"], "subject_ids": [ctx["subject_id"]]}
        first = headers_client.post(URL, json=body)
        second = headers_client.post(URL, json=body)
        assert first.status_code == 201
        assert second.status_code == 201
        assert second.json()["total"] == 0  # already assigned, nothing new


@_needs_postgres
class TestListAndUnassignStudentSubjects:
    def test_list_returns_registered_courses_with_ects(self):
        ctx = _make_tenant_with_student_and_subject()
        admin = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        admin.post(URL, json={"student_id": ctx["student_id"], "subject_ids": [ctx["subject_id"]]})

        resp = admin.get(URL, params={"student_id": ctx["student_id"]})
        assert resp.status_code == 200, resp.text
        courses = resp.json()
        assert len(courses) == 1
        assert courses[0]["subject_id"] == ctx["subject_id"]
        assert courses[0]["ects"] == 6.0

    def test_unassign_removes_the_course(self):
        ctx = _make_tenant_with_student_and_subject()
        admin = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        admin.post(URL, json={"student_id": ctx["student_id"], "subject_ids": [ctx["subject_id"]]})

        resp = admin.delete(f"{URL}{ctx['subject_id']}/", params={"student_id": ctx["student_id"]})
        assert resp.status_code == 204, resp.text

        listing = admin.get(URL, params={"student_id": ctx["student_id"]})
        assert listing.json() == []

    def test_unassign_nonexistent_registration_returns_404(self):
        ctx = _make_tenant_with_student_and_subject()
        admin = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = admin.delete(f"{URL}{ctx['subject_id']}/", params={"student_id": ctx["student_id"]})
        assert resp.status_code == 404, resp.text
