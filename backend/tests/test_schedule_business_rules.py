"""Institutional-readiness audit (2026-09), business-rules subagent —
schedule.py had no double-booking check at all: the same teacher, room,
or class could be given two overlapping slots on the same day, silently.
This is the exact timetable a government inspector would review.

_find_schedule_conflict() (schedule.py) now backs both create_schedule_slot
and update_schedule_slot with a 409 on overlap.

create_schedule_slot/update_schedule_slot's raw SQL uses NOW(), a
Postgres-only function (pre-existing, unrelated to this fix) — SQLite has
no such function, so this endpoint has only ever worked against real
Postgres. Skipped on SQLite accordingly."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.room import Room  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="create_schedule_slot/update_schedule_slot's raw SQL uses "
           "NOW(), a Postgres-only function — pre-existing, unrelated to "
           "the double-booking fix under test.",
)

BASE = "/api/v1/schedule"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Emploi du Temps Test", slug=f"schedule-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_classroom(tenant_id: str, name: str = "6eme A") -> str:
    classroom_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name=name))
        db.commit()
    return classroom_id


def _make_subject(tenant_id: str, name: str = "Mathématiques") -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
        db.commit()
    return subject_id


def _make_room(tenant_id: str, name: str = "Salle 1") -> str:
    room_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Room(id=room_id, tenant_id=tenant_id, name=name))
        db.commit()
    return room_id


def _make_teacher(tenant_id: str) -> str:
    teacher_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=teacher_id, tenant_id=tenant_id, email=f"{teacher_id[:8]}@example.com",
            username=f"teacher-{teacher_id[:8]}", is_active=True,
        ))
        db.commit()
    return teacher_id


def _setup(tenant_id: str):
    return {
        "class_id": _make_classroom(tenant_id),
        "subject_id": _make_subject(tenant_id),
        "teacher_id": _make_teacher(tenant_id),
    }


def _slot(fixtures: dict, day_of_week: int, start_time: str, end_time: str, **overrides) -> dict:
    payload = {
        "class_id": fixtures["class_id"], "subject_id": fixtures["subject_id"],
        "teacher_id": fixtures["teacher_id"], "day_of_week": day_of_week,
        "start_time": start_time, "end_time": end_time,
    }
    payload.update(overrides)
    return payload


class TestScheduleDoubleBookingOnCreate:
    def test_overlapping_slot_for_same_teacher_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)

        first = client.post(f"{BASE}/", json=_slot(fixtures, 1, "08:00", "09:00"), headers=headers)
        assert first.status_code == 201, first.text

        other_class = _make_classroom(tenant_id, "5eme B")
        conflicting = client.post(f"{BASE}/", json=_slot(
            fixtures, 1, "08:30", "09:30", class_id=other_class,
        ), headers=headers)
        assert conflicting.status_code == 409, conflicting.text

    def test_overlapping_slot_for_same_room_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)
        room_id = _make_room(tenant_id)

        first = client.post(f"{BASE}/", json=_slot(fixtures, 2, "10:00", "11:00", room_id=room_id), headers=headers)
        assert first.status_code == 201, first.text

        other_class = _make_classroom(tenant_id, "5eme B")
        other_teacher = _make_teacher(tenant_id)
        conflicting = client.post(f"{BASE}/", json=_slot(
            fixtures, 2, "10:30", "11:30", room_id=room_id,
            class_id=other_class, teacher_id=other_teacher,
        ), headers=headers)
        assert conflicting.status_code == 409, conflicting.text

    def test_overlapping_slot_for_same_class_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)

        first = client.post(f"{BASE}/", json=_slot(fixtures, 3, "14:00", "15:00"), headers=headers)
        assert first.status_code == 201, first.text

        other_teacher = _make_teacher(tenant_id)
        other_subject = _make_subject(tenant_id, "Français")
        conflicting = client.post(f"{BASE}/", json=_slot(
            fixtures, 3, "14:30", "15:30", teacher_id=other_teacher, subject_id=other_subject,
        ), headers=headers)
        assert conflicting.status_code == 409, conflicting.text

    def test_touching_edge_slots_are_accepted(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)

        first = client.post(f"{BASE}/", json=_slot(fixtures, 4, "10:00", "11:00"), headers=headers)
        assert first.status_code == 201, first.text

        second = client.post(f"{BASE}/", json=_slot(fixtures, 4, "11:00", "12:00"), headers=headers)
        assert second.status_code == 201, second.text

    def test_same_teacher_different_day_is_accepted(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)

        first = client.post(f"{BASE}/", json=_slot(fixtures, 1, "08:00", "09:00"), headers=headers)
        assert first.status_code == 201, first.text

        second = client.post(f"{BASE}/", json=_slot(fixtures, 2, "08:00", "09:00"), headers=headers)
        assert second.status_code == 201, second.text


class TestScheduleDoubleBookingOnUpdate:
    def test_moving_slot_into_an_existing_slot_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)

        client.post(f"{BASE}/", json=_slot(fixtures, 5, "08:00", "09:00"), headers=headers)
        movable = client.post(f"{BASE}/", json=_slot(fixtures, 5, "10:00", "11:00"), headers=headers).json()

        moved = client.put(f"{BASE}/{movable['id']}/", json={"start_time": "08:30", "end_time": "09:30"}, headers=headers)
        assert moved.status_code == 409, moved.text

    def test_updating_a_slot_without_changing_its_overlap_does_not_false_positive(self):
        """exclude_slot_id must exempt the slot's own existing time range
        from the conflict check it is being compared against."""
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        fixtures = _setup(tenant_id)

        created = client.post(f"{BASE}/", json=_slot(fixtures, 6, "08:00", "09:00"), headers=headers).json()

        updated = client.put(f"{BASE}/{created['id']}/", json={"subject_id": fixtures["subject_id"]}, headers=headers)
        assert updated.status_code == 200, updated.text
