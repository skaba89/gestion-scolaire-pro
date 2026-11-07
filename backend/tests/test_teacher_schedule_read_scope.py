"""GET /teachers/{teacher_id}/schedule/: tenant and caller scope tests."""
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
from app.models import Classroom, Room, ScheduleSlot, Subject, Tenant, User  # noqa: E402


HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def schedule_ctx():
    ids = {key: str(uuid.uuid4()) for key in (
        "tenant", "other_tenant", "admin", "teacher", "other_teacher",
        "foreign_teacher", "classroom", "subject", "room", "slot",
    )}
    with SessionLocal() as db:
        db.add_all([
            Tenant(id=ids["tenant"], name="École Emploi", slug=f"sched-{ids['tenant']}",
                   type="primary", country="GN", settings={}),
            Tenant(id=ids["other_tenant"], name="Autre École", slug=f"sched-{ids['other_tenant']}",
                   type="primary", country="GN", settings={}),
        ])
        db.flush()
        for key, tenant_key in [
            ("admin", "tenant"), ("teacher", "tenant"),
            ("other_teacher", "tenant"), ("foreign_teacher", "other_tenant"),
        ]:
            db.add(User(
                id=ids[key], tenant_id=ids[tenant_key], email=f"{ids[key]}@example.com",
                username=ids[key], first_name=key, last_name="Test", is_active=True,
            ))
        db.add(Classroom(id=ids["classroom"], tenant_id=ids["tenant"], name="CM2 A"))
        db.add(Subject(id=ids["subject"], tenant_id=ids["tenant"], name="Mathématiques"))
        db.add(Room(id=ids["room"], tenant_id=ids["tenant"], name="Salle 12"))
        db.flush()
        db.add(ScheduleSlot(
            id=ids["slot"], tenant_id=ids["tenant"], class_id=ids["classroom"],
            subject_id=ids["subject"], teacher_id=ids["teacher"], room_id=ids["room"],
            day_of_week=1, start_time=time(8, 0), end_time=time(9, 30),
        ))
        db.commit()
    return ids


def _as(user_id: str, tenant_id: str, roles):
    user = {"id": user_id, "tenant_id": tenant_id, "roles": list(roles)}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _get(ids, teacher_key="teacher", caller_key="admin", roles=("TENANT_ADMIN",)):
    return client.get(
        f"/api/v1/teachers/{ids[teacher_key]}/schedule/",
        headers=_as(ids[caller_key], ids["tenant"], roles),
    )


def test_admin_reads_selected_teacher_schedule(schedule_ctx):
    response = _get(schedule_ctx)
    assert response.status_code == 200, response.text
    assert response.json() == [{
        "id": schedule_ctx["slot"],
        "day_of_week": 1,
        "start_time": "08:00:00",
        "end_time": "09:30:00",
        "room_name": "Salle 12",
        "classrooms": {"id": schedule_ctx["classroom"], "name": "CM2 A"},
        "subjects": {"id": schedule_ctx["subject"], "name": "Mathématiques"},
    }]


def test_teacher_reads_own_schedule(schedule_ctx):
    response = _get(schedule_ctx, caller_key="teacher", roles=("TEACHER",))
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [schedule_ctx["slot"]]


def test_teacher_cannot_read_another_teachers_schedule(schedule_ctx):
    response = _get(
        schedule_ctx, teacher_key="other_teacher", caller_key="teacher", roles=("TEACHER",)
    )
    assert response.status_code == 403


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "ALUMNI"])
def test_non_staff_roles_cannot_read_teacher_schedule(schedule_ctx, role):
    response = _get(schedule_ctx, caller_key="other_teacher", roles=(role,))
    assert response.status_code == 403


def test_foreign_tenant_teacher_is_hidden(schedule_ctx):
    response = _get(schedule_ctx, teacher_key="foreign_teacher")
    assert response.status_code == 404


def test_unknown_teacher_is_not_an_empty_schedule(schedule_ctx):
    response = client.get(
        f"/api/v1/teachers/{uuid.uuid4()}/schedule/",
        headers=_as(schedule_ctx["admin"], schedule_ctx["tenant"], ("TENANT_ADMIN",)),
    )
    assert response.status_code == 404


def test_database_failure_is_visible(schedule_ctx):
    with patch("sqlalchemy.orm.Query.all", side_effect=SQLAlchemyError("outage")):
        response = _get(schedule_ctx)
    assert response.status_code == 503


def test_authentication_is_required(schedule_ctx):
    app.dependency_overrides.pop(get_current_user, None)
    response = client.get(f"/api/v1/teachers/{schedule_ctx['teacher']}/schedule/")
    assert response.status_code == 401
