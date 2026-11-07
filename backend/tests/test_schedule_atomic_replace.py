"""Atomic replacement of one class schedule, with tenant and conflict guards."""
import uuid
from datetime import time
from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Classroom, Room, ScheduleSlot, Subject, Tenant, User, UserRole,
)


HEADERS = {"Authorization": "Bearer mock-token"}
BASE = "/api/v1/schedule/classes"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def schedule_ctx():
    ids = {key: str(uuid.uuid4()) for key in (
        "tenant", "other_tenant", "classroom", "other_classroom", "foreign_classroom",
        "subject", "foreign_subject", "room", "foreign_room", "old_slot", "external_slot",
        "teacher", "foreign_teacher", "non_teacher",
    )}
    with SessionLocal() as db:
        db.add_all([
            Tenant(id=ids["tenant"], name="École Planning", slug=f"planning-{ids['tenant']}",
                   type="primary", country="GN", settings={}),
            Tenant(id=ids["other_tenant"], name="Autre École", slug=f"planning-{ids['other_tenant']}",
                   type="primary", country="GN", settings={}),
        ])
        db.flush()
        db.add_all([
            Classroom(id=ids["classroom"], tenant_id=ids["tenant"], name="CM2 A"),
            Classroom(id=ids["other_classroom"], tenant_id=ids["tenant"], name="CM2 B"),
            Classroom(id=ids["foreign_classroom"], tenant_id=ids["other_tenant"], name="Étrangère"),
            Subject(id=ids["subject"], tenant_id=ids["tenant"], name="Mathématiques"),
            Subject(id=ids["foreign_subject"], tenant_id=ids["other_tenant"], name="Matière étrangère"),
            Room(id=ids["room"], tenant_id=ids["tenant"], name="Salle 1"),
            Room(id=ids["foreign_room"], tenant_id=ids["other_tenant"], name="Salle étrangère"),
            User(id=ids["teacher"], tenant_id=ids["tenant"],
                 email=f"{ids['teacher']}@example.test", username=ids["teacher"]),
            User(id=ids["non_teacher"], tenant_id=ids["tenant"],
                 email=f"{ids['non_teacher']}@example.test", username=ids["non_teacher"]),
            User(id=ids["foreign_teacher"], tenant_id=ids["other_tenant"],
                 email=f"{ids['foreign_teacher']}@example.test", username=ids["foreign_teacher"]),
        ])
        db.flush()
        db.add_all([
            UserRole(tenant_id=ids["tenant"], user_id=ids["teacher"], role="TEACHER"),
            UserRole(tenant_id=ids["tenant"], user_id=ids["non_teacher"], role="STUDENT"),
            UserRole(tenant_id=ids["other_tenant"], user_id=ids["foreign_teacher"], role="TEACHER"),
        ])
        db.add(ScheduleSlot(
            id=ids["old_slot"], tenant_id=ids["tenant"], class_id=ids["classroom"],
            subject_id=ids["subject"], room_id=ids["room"], day_of_week=1,
            start_time=time(8), end_time=time(9),
        ))
        db.commit()
    return ids


def _as(ids, *, tenant_key="tenant", roles=("TENANT_ADMIN",)):
    user = {"id": str(uuid.uuid4()), "tenant_id": ids[tenant_key], "roles": list(roles)}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _slot(ids, **overrides):
    slot = {
        "subject_id": ids["subject"], "day_of_week": 2,
        "start_time": "08:00:00", "end_time": "09:00:00", "room_id": ids["room"],
    }
    slot.update(overrides)
    return slot


def _replace(ids, slots, *, class_key="classroom", tenant_key="tenant", roles=("TENANT_ADMIN",)):
    return client.put(
        f"{BASE}/{ids[class_key]}/replace/", json={"slots": slots},
        headers=_as(ids, tenant_key=tenant_key, roles=roles),
    )


def _class_slot_ids(ids):
    with SessionLocal() as db:
        return [str(row.id) for row in db.query(ScheduleSlot).filter(
            ScheduleSlot.class_id == ids["classroom"]
        ).order_by(ScheduleSlot.start_time).all()]


def test_replaces_existing_schedule_in_one_operation(schedule_ctx):
    ids = schedule_ctx
    response = _replace(ids, [
        _slot(ids),
        _slot(ids, start_time="09:00:00", end_time="10:00:00"),
    ])
    assert response.status_code == 200, response.text
    assert response.json()["count"] == 2
    new_ids = _class_slot_ids(ids)
    assert len(new_ids) == 2
    assert ids["old_slot"] not in new_ids


@pytest.mark.parametrize("field,foreign_key", [
    ("subject_id", "foreign_subject"), ("room_id", "foreign_room"),
    ("teacher_id", "foreign_teacher"),
])
def test_rejects_foreign_references_without_erasing_old_schedule(schedule_ctx, field, foreign_key):
    ids = schedule_ctx
    response = _replace(ids, [_slot(ids, **{field: ids[foreign_key]})])
    assert response.status_code == 404
    assert _class_slot_ids(ids) == [ids["old_slot"]]


def test_rejects_same_tenant_user_without_teacher_role(schedule_ctx):
    ids = schedule_ctx
    response = _replace(ids, [_slot(ids, teacher_id=ids["non_teacher"])])
    assert response.status_code == 404
    assert _class_slot_ids(ids) == [ids["old_slot"]]


def test_accepts_same_tenant_teacher(schedule_ctx):
    ids = schedule_ctx
    response = _replace(ids, [_slot(ids, teacher_id=ids["teacher"])])
    assert response.status_code == 200, response.text
    assert response.json() == {"count": 1}


def test_foreign_class_is_hidden_without_erasing_own_schedule(schedule_ctx):
    ids = schedule_ctx
    response = _replace(
        ids, [_slot(ids)], class_key="foreign_classroom", tenant_key="tenant"
    )
    assert response.status_code == 404
    assert _class_slot_ids(ids) == [ids["old_slot"]]


def test_rejects_internal_overlap_without_erasing_old_schedule(schedule_ctx):
    ids = schedule_ctx
    response = _replace(ids, [
        _slot(ids, start_time="10:00:00", end_time="11:00:00"),
        _slot(ids, start_time="10:30:00", end_time="11:30:00"),
    ])
    assert response.status_code == 409
    assert _class_slot_ids(ids) == [ids["old_slot"]]


def test_rejects_external_room_conflict_without_erasing_old_schedule(schedule_ctx):
    ids = schedule_ctx
    with SessionLocal() as db:
        db.add(ScheduleSlot(
            id=ids["external_slot"], tenant_id=ids["tenant"],
            class_id=ids["other_classroom"], subject_id=ids["subject"], room_id=ids["room"],
            day_of_week=3, start_time=time(10), end_time=time(11),
        ))
        db.commit()
    response = _replace(ids, [
        _slot(ids, day_of_week=3, start_time="10:30:00", end_time="11:30:00")
    ])
    assert response.status_code == 409
    assert _class_slot_ids(ids) == [ids["old_slot"]]


def test_student_cannot_replace_schedule(schedule_ctx):
    response = _replace(schedule_ctx, [_slot(schedule_ctx)], roles=("STUDENT",))
    assert response.status_code == 403
    assert _class_slot_ids(schedule_ctx) == [schedule_ctx["old_slot"]]


def test_database_failure_rolls_back_old_schedule(schedule_ctx):
    ids = schedule_ctx
    with patch("sqlalchemy.orm.Session.commit", side_effect=SQLAlchemyError("outage")):
        response = _replace(ids, [_slot(ids)])
    assert response.status_code == 503
    assert _class_slot_ids(ids) == [ids["old_slot"]]


def test_authentication_is_required(schedule_ctx):
    app.dependency_overrides.pop(get_current_user, None)
    response = client.put(
        f"{BASE}/{schedule_ctx['classroom']}/replace/", json={"slots": [_slot(schedule_ctx)]}
    )
    assert response.status_code == 401


def test_empty_replacement_is_rejected(schedule_ctx):
    response = _replace(schedule_ctx, [])
    assert response.status_code == 422
    assert _class_slot_ids(schedule_ctx) == [schedule_ctx["old_slot"]]
