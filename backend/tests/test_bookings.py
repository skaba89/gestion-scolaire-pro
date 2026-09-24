"""/admin/bookings was a 404 for every role — the page (src/pages/admin/
Bookings.tsx: room/equipment reservation calendar) has called GET/POST
/school-life/bookable-resources/ and /school-life/bookings/ since it was
written, but neither the endpoints nor the tables backing them ever
existed. Same bug class and fix pattern as
test_teacher_work_hours.py/backend/tests/test_teacher_work_hours.py — see
docs/PERMISSIONS_MATRIX.md.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

# bookable_resources/bookings are raw-SQL operational tables (DDL only in
# app/core/operational_tables.py, no ORM model, never created by
# Base.metadata.create_all()) — Postgres-only, same pattern as
# test_teacher_work_hours.py.
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="bookable_resources/bookings are raw-SQL operational tables "
           "whose DDL is Postgres-specific and never created on SQLite "
           "test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

HEADERS = {"Authorization": "Bearer mock-token"}
BASE = "/api/v1/school-life"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Bookings Test", slug=f"bookings-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, role: str) -> str:
    """bookings.user_id is a real FK (the booking's owner, joined for its
    nested "user" field) — unlike teacher_work_hours.recorded_by, this one
    must reference an actual row."""
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Aïssatou", last_name="Camara",
            password_hash="x", is_active=True,
        ))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, tenant_id=tenant_id, role=role))
        db.commit()
    return user_id


def _as(tenant_id: str, role: str, user_id: str | None = None) -> dict:
    user = {"id": user_id or _make_user(tenant_id, role), "roles": [role], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


class TestBookableResourcesAccess:
    @pytest.mark.parametrize("role", ["DIRECTOR", "DEPARTMENT_HEAD", "SECRETARY", "TENANT_ADMIN", "TEACHER"])
    def test_role_can_list_and_create_resource(self, role):
        tenant_id = _make_tenant()
        list_resp = client.get(f"{BASE}/bookable-resources/", headers=_as(tenant_id, role))
        assert list_resp.status_code == 200, list_resp.text
        assert list_resp.json() == []

        create_resp = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Salle B12", "resource_type": "room", "capacity": 30,
        }, headers=_as(tenant_id, role))
        assert create_resp.status_code == 201, create_resp.text
        body = create_resp.json()
        assert body["name"] == "Salle B12"
        assert body["is_active"] is True

    def test_soft_delete_hides_resource_from_list(self):
        tenant_id = _make_tenant()
        created = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Vidéoprojecteur", "resource_type": "equipment",
        }, headers=_as(tenant_id, "DIRECTOR")).json()

        patch_resp = client.patch(
            f"{BASE}/bookable-resources/{created['id']}/", json={"is_active": False},
            headers=_as(tenant_id, "DIRECTOR"),
        )
        assert patch_resp.status_code == 200, patch_resp.text

        list_resp = client.get(f"{BASE}/bookable-resources/", headers=_as(tenant_id, "DIRECTOR"))
        assert list_resp.json() == []


class TestBookingsAccessAndConflicts:
    def test_create_booking_without_approval_is_auto_approved(self):
        tenant_id = _make_tenant()
        resource = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Salle A1", "requires_approval": False,
        }, headers=_as(tenant_id, "DIRECTOR")).json()

        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(hours=1)
        resp = client.post(f"{BASE}/bookings/", json={
            "resource_id": resource["id"], "title": "Réunion pédagogique",
            "start_time": _iso(start), "end_time": _iso(end),
        }, headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "approved"
        assert body["resource"]["name"] == "Salle A1"

    def test_create_booking_requiring_approval_is_pending(self):
        tenant_id = _make_tenant()
        resource = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Salle B2", "requires_approval": True,
        }, headers=_as(tenant_id, "DIRECTOR")).json()

        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(hours=1)
        resp = client.post(f"{BASE}/bookings/", json={
            "resource_id": resource["id"], "title": "Conseil de classe",
            "start_time": _iso(start), "end_time": _iso(end),
        }, headers=_as(tenant_id, "SECRETARY"))
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "pending"

    def test_overlapping_booking_is_rejected_with_409(self):
        tenant_id = _make_tenant()
        resource = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Salle C3",
        }, headers=_as(tenant_id, "DIRECTOR")).json()

        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(hours=2)
        first = client.post(f"{BASE}/bookings/", json={
            "resource_id": resource["id"], "title": "Cours de sciences",
            "start_time": _iso(start), "end_time": _iso(end),
        }, headers=_as(tenant_id, "DIRECTOR"))
        assert first.status_code == 201, first.text

        overlap_start = start + timedelta(minutes=30)
        overlap_end = overlap_start + timedelta(hours=1)
        second = client.post(f"{BASE}/bookings/", json={
            "resource_id": resource["id"], "title": "Réunion parents",
            "start_time": _iso(overlap_start), "end_time": _iso(overlap_end),
        }, headers=_as(tenant_id, "SECRETARY"))
        assert second.status_code == 409, second.text

    def test_conflict_precheck_endpoint_matches_authoritative_check(self):
        tenant_id = _make_tenant()
        resource = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Salle D4",
        }, headers=_as(tenant_id, "DIRECTOR")).json()

        start = datetime.now(timezone.utc) + timedelta(days=3)
        end = start + timedelta(hours=1)
        client.post(f"{BASE}/bookings/", json={
            "resource_id": resource["id"], "title": "Atelier",
            "start_time": _iso(start), "end_time": _iso(end),
        }, headers=_as(tenant_id, "DIRECTOR"))

        precheck = client.get(f"{BASE}/bookings/", params={
            "resource_id": resource["id"], "check_conflicts": "true",
            "start_before": _iso(end), "end_after": _iso(start),
        }, headers=_as(tenant_id, "DIRECTOR"))
        assert precheck.status_code == 409, precheck.text

    def test_director_can_approve_a_pending_booking(self):
        tenant_id = _make_tenant()
        resource = client.post(f"{BASE}/bookable-resources/", json={
            "name": "Salle E5", "requires_approval": True,
        }, headers=_as(tenant_id, "DIRECTOR")).json()

        start = datetime.now(timezone.utc) + timedelta(days=4)
        end = start + timedelta(hours=1)
        booking = client.post(f"{BASE}/bookings/", json={
            "resource_id": resource["id"], "title": "Sortie scolaire",
            "start_time": _iso(start), "end_time": _iso(end),
        }, headers=_as(tenant_id, "SECRETARY")).json()
        assert booking["status"] == "pending"

        director_id = str(uuid.uuid4())
        approve_resp = client.put(f"{BASE}/bookings/{booking['id']}/", json={
            "status": "approved", "approved_by": director_id,
        }, headers=_as(tenant_id, "DIRECTOR", user_id=director_id))
        assert approve_resp.status_code == 200, approve_resp.text
        assert approve_resp.json()["status"] == "approved"
        assert approve_resp.json()["approved_by"] == director_id


class TestBookingsDeniedForUnrelatedRoles:
    def test_student_cannot_list_or_book(self):
        tenant_id = _make_tenant()
        resp = client.get(f"{BASE}/bookable-resources/", headers=_as(tenant_id, "STUDENT"))
        assert resp.status_code == 403, resp.text
