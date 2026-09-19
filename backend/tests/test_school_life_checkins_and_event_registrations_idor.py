"""GET/POST /school-life/check-ins/ and /school-life/event-registrations/ —
institutional-readiness audit, 2026-09, 9e vague.

Both check-in endpoints took student_id/student_ids straight from the
caller with only Depends(get_current_user) — no permission check, no
ownership check, and (for check-ins) no verification that student_id even
belonged to the caller's tenant. Any authenticated user (STUDENT, PARENT —
neither holds school_life:read/write) could read or forge another
student's attendance-badge check-ins.

Event registrations had the same gap plus a cross-tenant FK-injection hole:
event_id/student_id/alumni_id were inserted into career_event_registrations
with zero validation that they belonged to the caller's tenant at all.

Fixed by reusing the same self/parent/permission-holder rule already
applied to homework submissions (_can_submit_for_student in homework.py),
here as _is_self_or_parent_of_student / _can_access_checkin_for_student in
school_life.py.

career_events/career_event_registrations are raw-DDL Postgres-only tables
(see app/core/operational_tables.py) — same constraint as
test_homework_submissions_idor_and_fk.py. student_check_ins has a real
SQLAlchemy model/migration and works on both dialects.
"""
import uuid
from datetime import date, datetime, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

CHECKINS_URL = "/api/v1/school-life/check-ins/"
EVENT_REGISTRATIONS_URL = "/api/v1/school-life/event-registrations/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Check-in IDOR Test", slug=f"ci-idor-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Amadou", last_name="Bah",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_student(tenant_id: str, *, user_id: str = None) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, user_id=user_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _link_parent(tenant_id: str, *, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id, parent_id=parent_id, student_id=student_id,
        ))
        db.commit()


class TestCheckInIdor:
    def test_student_cannot_create_check_in_for_another_student(self):
        tenant_id = _make_tenant()
        attacker_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=attacker_user_id)
        victim_student_id = _make_student(tenant_id)

        resp = client.post(CHECKINS_URL, headers=_as({
            "id": attacker_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"student_id": victim_student_id, "direction": "IN"})
        assert resp.status_code == 403, resp.text

    def test_student_can_check_in_self(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id, user_id=user_id)

        resp = client.post(CHECKINS_URL, headers=_as({
            "id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "direction": "IN"})
        assert resp.status_code == 200, resp.text

    def test_teacher_can_check_in_any_student(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)

        resp = client.post(CHECKINS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "direction": "IN"})
        assert resp.status_code == 200, resp.text

    def test_student_cannot_read_another_students_check_ins(self):
        tenant_id = _make_tenant()
        attacker_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=attacker_user_id)
        victim_student_id = _make_student(tenant_id)

        resp = client.get(CHECKINS_URL, params={"student_ids": [victim_student_id]}, headers=_as({
            "id": attacker_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 403, resp.text

    def test_student_without_student_ids_is_rejected_not_given_everything(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=user_id)

        resp = client.get(CHECKINS_URL, headers=_as({
            "id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 403, resp.text

    def test_parent_can_read_own_childs_check_ins(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        _link_parent(tenant_id, parent_id=parent_id, student_id=student_id)

        resp = client.get(CHECKINS_URL, params={"student_ids": [student_id]}, headers=_as({
            "id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 200, resp.text

    def test_teacher_can_read_any_students_check_ins(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)

        resp = client.get(CHECKINS_URL, params={"student_ids": [student_id]}, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 200, resp.text


@pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="career_events/career_event_registrations are raw Postgres-only operational tables.",
)
class TestEventRegistrationIdorAndFk:
    def _make_event(self, tenant_id: str) -> str:
        with SessionLocal() as db:
            from sqlalchemy import text
            event_id = str(uuid.uuid4())
            db.execute(text("""
                INSERT INTO career_events
                    (id, tenant_id, title, event_type, start_datetime, is_active)
                VALUES (:id, :tid, 'Forum emploi', 'workshop', :start, true)
            """), {"id": event_id, "tid": tenant_id, "start": datetime.now(timezone.utc).replace(tzinfo=None)})
            db.commit()
        return event_id

    def test_student_cannot_register_another_student(self):
        tenant_id = _make_tenant()
        attacker_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=attacker_user_id)
        victim_student_id = _make_student(tenant_id)
        event_id = self._make_event(tenant_id)

        resp = client.post(EVENT_REGISTRATIONS_URL, headers=_as({
            "id": attacker_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"event_id": event_id, "student_id": victim_student_id})
        assert resp.status_code == 403, resp.text

    def test_student_can_register_self(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id, user_id=user_id)
        event_id = self._make_event(tenant_id)

        resp = client.post(EVENT_REGISTRATIONS_URL, headers=_as({
            "id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"event_id": event_id, "student_id": student_id})
        assert resp.status_code == 201, resp.text

    def test_alumni_cannot_register_someone_elses_alumni_id(self):
        tenant_id = _make_tenant()
        event_id = self._make_event(tenant_id)

        resp = client.post(EVENT_REGISTRATIONS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id,
        }), json={"event_id": event_id, "alumni_id": str(uuid.uuid4())})
        assert resp.status_code == 403, resp.text

    def test_registration_rejects_event_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        user_id = _make_user(tenant_a)
        student_id = _make_student(tenant_a, user_id=user_id)
        event_in_b = self._make_event(tenant_b)

        resp = client.post(EVENT_REGISTRATIONS_URL, headers=_as({
            "id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_a,
        }), json={"event_id": event_in_b, "student_id": student_id})
        assert resp.status_code == 404, resp.text

    def test_student_cannot_list_all_tenant_registrations(self):
        tenant_id = _make_tenant()
        attacker_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=attacker_user_id)
        victim_student_id = _make_student(tenant_id)

        resp = client.get(EVENT_REGISTRATIONS_URL, params={"student_id": victim_student_id}, headers=_as({
            "id": attacker_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 403, resp.text

    def test_staff_can_register_any_student(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        event_id = self._make_event(tenant_id)

        resp = client.post(EVENT_REGISTRATIONS_URL, headers=_admin_headers(tenant_id), json={
            "event_id": event_id, "student_id": student_id,
        })
        assert resp.status_code == 201, resp.text
