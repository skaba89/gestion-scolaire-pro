"""Institutional-readiness audit (2026-09), second endpoint sweep — five
write endpoints with no permission/ownership check at all:

1. POST/PATCH/DELETE /achievement-definitions/ — any authenticated user
   could create/edit/delete a tenant's gamification config.
2. POST /student-achievements/ — any authenticated user could manually
   award an arbitrary achievement to any student.
3. POST /gamification/process-event/ — any authenticated user could farm
   points/badges for any student_id (fixed with an ownership-aware check:
   a school_life:write holder, or the student themselves for their own
   self-triggered events like HOMEWORK_SUBMITTED).
4. DELETE /shared-notes/{id} — no author check at all, unlike
   create_shared_note() which stamps author_id.
5. POST /parents/appointment-slots/ — no permission check at all despite
   its own docstring saying "typically used by admin/teachers".

achievement_definitions/student_achievements/shared_notes/appointment_slots
are raw Postgres-only operational tables (gen_random_uuid()/etc, see
app/core/operational_tables.py) never created in the SQLite test lifespan.
Tests that only need the permission/ownership check to run (which happens
before any table access) run everywhere; tests that need a real row are
Postgres-only, matching test_alumni_ownership_authorization.py's
established convention.
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
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="achievement_definitions/student_achievements/shared_notes are "
           "raw Postgres-only operational tables (see app/core/operational_tables.py).",
)

if engine.dialect.name == "postgresql":
    # These tables are created by app.core.operational_tables at real app
    # startup (lifespan) — self-healing in actual production/staging — but
    # the test client installs a no-op lifespan (conftest.get_test_client)
    # and `alembic upgrade head` alone never created them. Run the same
    # startup step explicitly, same pattern as
    # test_message_reactions_authorization.py.
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

ACHIEVEMENT_DEFS_URL = "/api/v1/achievement-definitions/"
STUDENT_ACHIEVEMENTS_URL = "/api/v1/student-achievements/"
PROCESS_EVENT_URL = "/api/v1/gamification/process-event/"
SHARED_NOTES_URL = "/api/v1/shared-notes/"
APPOINTMENT_SLOTS_URL = "/api/v1/parents/appointment-slots/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Gamification Test", slug=f"gam-{tenant_id[:8]}",
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


def _make_student(tenant_id: str, *, user_id: str | None = None) -> str:
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


class TestAchievementDefinitionsAuthorization:
    def test_student_cannot_create_achievement_definition(self):
        tenant_id = _make_tenant()
        resp = client.post(ACHIEVEMENT_DEFS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"name": "Badge Triché"})
        assert resp.status_code == 403, resp.text

    def test_student_cannot_update_achievement_definition(self):
        tenant_id = _make_tenant()
        resp = client.patch(f"{ACHIEVEMENT_DEFS_URL}{uuid.uuid4()}/", headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"points_value": 9999})
        assert resp.status_code == 403, resp.text

    def test_student_cannot_delete_achievement_definition(self):
        tenant_id = _make_tenant()
        resp = client.delete(f"{ACHIEVEMENT_DEFS_URL}{uuid.uuid4()}/", headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 403, resp.text


class TestStudentAchievementAuthorization:
    def test_parent_cannot_award_achievement(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        resp = client.post(STUDENT_ACHIEVEMENTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "achievement_id": str(uuid.uuid4())})
        assert resp.status_code == 403, resp.text


class TestGamificationEventOwnership:
    def test_student_cannot_trigger_event_for_another_student(self):
        tenant_id = _make_tenant()
        attacker_id = str(uuid.uuid4())
        victim_student_id = _make_student(tenant_id)

        resp = client.post(PROCESS_EVENT_URL, headers=_as({
            "id": attacker_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"event_type": "HOMEWORK_SUBMITTED", "student_id": victim_student_id})
        assert resp.status_code == 403, resp.text

    @_needs_postgres
    def test_student_can_trigger_event_for_self(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id, user_id=user_id)

        resp = client.post(PROCESS_EVENT_URL, headers=_as({
            "id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"event_type": "HOMEWORK_SUBMITTED", "student_id": student_id})
        assert resp.status_code == 200, resp.text

    @_needs_postgres
    def test_teacher_can_trigger_event_for_any_student(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)

        resp = client.post(PROCESS_EVENT_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id,
        }), json={"event_type": "GRADE_ADDED", "student_id": student_id})
        assert resp.status_code == 200, resp.text


class TestSharedNoteDeletionAuthorization:
    @_needs_postgres
    def test_non_author_without_permission_cannot_delete(self):
        tenant_id = _make_tenant()
        author_id = _make_user(tenant_id)
        author_headers = _as({"id": author_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        created = client.post(SHARED_NOTES_URL, headers=author_headers, json={"title": "Ma note", "content": "..."})
        assert created.status_code == 201, created.text
        note_id = created.json()["id"]

        other_id = _make_user(tenant_id)
        other_headers = _as({"id": other_id, "roles": ["STUDENT"], "tenant_id": tenant_id})
        resp = client.delete(f"{SHARED_NOTES_URL}{note_id}", headers=other_headers)
        assert resp.status_code == 403, resp.text

    @_needs_postgres
    def test_author_can_delete_own_note(self):
        tenant_id = _make_tenant()
        author_id = _make_user(tenant_id)
        author_headers = _as({"id": author_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        created = client.post(SHARED_NOTES_URL, headers=author_headers, json={"title": "Ma note", "content": "..."})
        assert created.status_code == 201, created.text
        note_id = created.json()["id"]

        resp = client.delete(f"{SHARED_NOTES_URL}{note_id}", headers=author_headers)
        assert resp.status_code == 204, resp.text


class TestAppointmentSlotAuthorization:
    def test_parent_cannot_create_appointment_slot(self):
        tenant_id = _make_tenant()
        resp = client.post(APPOINTMENT_SLOTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id,
        }), json={"date": "2026-10-01", "start_time": "10:00", "end_time": "10:30"})
        assert resp.status_code == 403, resp.text

    def test_teacher_cannot_create_slot_for_another_teacher(self):
        tenant_id = _make_tenant()
        resp = client.post(APPOINTMENT_SLOTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id,
        }), json={
            "teacher_id": str(uuid.uuid4()), "date": "2026-10-01",
            "start_time": "10:00", "end_time": "10:30",
        })
        assert resp.status_code == 403, resp.text

    @_needs_postgres
    def test_teacher_can_create_own_slot(self):
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        resp = client.post(APPOINTMENT_SLOTS_URL, headers=_as({
            "id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id,
        }), json={"date": "2026-10-01", "start_time": "10:00", "end_time": "10:30"})
        assert resp.status_code == 201, resp.text
