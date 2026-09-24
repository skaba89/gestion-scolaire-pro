"""/admin/teacher-hours was a 404 for every role — the page and its nav
item existed, but neither the GET/POST /hr/teacher-work-hours/ endpoints
nor the table they read/write ever existed. departments.py's
department_teachers endpoint also queries teacher_work_hours directly for
a "hours this month" figure and would have 500'd against a real database;
analytics.py's national-scale summary mocks the same figures to 0 with a
comment noting the table doesn't exist. See docs/PERMISSIONS_MATRIX.md and
backend/app/core/operational_tables.py.
"""
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

# teacher_work_hours is a raw-SQL operational table (DDL only in
# app/core/operational_tables.py, no ORM model, never created by
# Base.metadata.create_all()) — Postgres-only, same pattern as
# test_director_finance_read_access.py.
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="teacher_work_hours is a raw-SQL operational table whose DDL "
           "is Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

HEADERS = {"Authorization": "Bearer mock-token"}
BASE = "/api/v1/hr"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Teacher Hours Test", slug=f"teacher-hours-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_teacher(tenant_id: str) -> str:
    teacher_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=teacher_id, tenant_id=tenant_id, email=f"t.{teacher_id[:8]}@ecole.gn",
            username=f"t.{teacher_id[:8]}", first_name="Mariama", last_name="Diallo",
            password_hash="x", is_active=True,
        ))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=teacher_id, tenant_id=tenant_id, role="TEACHER"))
        db.commit()
    return teacher_id


def _as(tenant_id: str, role: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestDirectorTeacherWorkHoursAccess:
    def test_director_can_list_and_record_hours(self):
        tenant_id = _make_tenant()
        teacher_id = _make_teacher(tenant_id)

        list_resp = client.get(f"{BASE}/teacher-work-hours/", headers=_as(tenant_id, "DIRECTOR"))
        assert list_resp.status_code == 200, list_resp.text
        assert list_resp.json() == []

        create_resp = client.post(f"{BASE}/teacher-work-hours/", json={
            "teacher_id": teacher_id, "work_date": "2026-09-15", "hours_worked": 2.5,
            "description": "Cours de mathématiques",
        }, headers=_as(tenant_id, "DIRECTOR"))
        assert create_resp.status_code == 201, create_resp.text
        body = create_resp.json()
        assert body["teacher_id"] == teacher_id
        assert body["hours_worked"] == 2.5
        assert body["teacher"]["first_name"] == "Mariama"
        assert body["subject"] is None
        assert body["classroom"] is None

        list_resp_after = client.get(f"{BASE}/teacher-work-hours/", headers=_as(tenant_id, "DIRECTOR"))
        assert list_resp_after.status_code == 200, list_resp_after.text
        assert len(list_resp_after.json()) == 1

    def test_rejects_hours_out_of_range(self):
        tenant_id = _make_tenant()
        teacher_id = _make_teacher(tenant_id)

        resp = client.post(f"{BASE}/teacher-work-hours/", json={
            "teacher_id": teacher_id, "work_date": "2026-09-15", "hours_worked": 30,
        }, headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 422, resp.text

    def test_rejects_teacher_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        teacher_in_b = _make_teacher(tenant_b)

        resp = client.post(f"{BASE}/teacher-work-hours/", json={
            "teacher_id": teacher_in_b, "work_date": "2026-09-15", "hours_worked": 1,
        }, headers=_as(tenant_a, "DIRECTOR"))
        assert resp.status_code == 404, resp.text


class TestDepartmentHeadAndStaffTeacherWorkHoursAccess:
    """Permissions audit (2026-09): frontend already grants
    DEPARTMENT_HEAD/STAFF "teacher_progress:read" for this nav item."""

    @pytest.mark.parametrize("role", ["DEPARTMENT_HEAD", "STAFF", "SECRETARY", "TENANT_ADMIN"])
    def test_role_can_list_hours(self, role):
        tenant_id = _make_tenant()
        resp = client.get(f"{BASE}/teacher-work-hours/", headers=_as(tenant_id, role))
        assert resp.status_code == 200, resp.text


class TestTeacherWorkHoursDeniedForUnrelatedRoles:
    def test_teacher_role_itself_cannot_read(self):
        """TEACHER has no teacher_progress:* grant — this page is for
        staff who log/review hours, not the teacher being logged."""
        tenant_id = _make_tenant()
        resp = client.get(f"{BASE}/teacher-work-hours/", headers=_as(tenant_id, "TEACHER"))
        assert resp.status_code == 403, resp.text
