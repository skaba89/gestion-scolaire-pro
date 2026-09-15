"""Authorization on library borrow/return and survey create/update/delete
(institutional-readiness audit, 2026-09).

- POST /api/v1/library/borrow/ and POST /api/v1/library/return/ took
  whatever user_id/borrow_id the caller named, with no permission check at
  all — any authenticated tenant user could attribute a borrow (or falsely
  mark any active borrow as returned) to someone else.
- POST/PATCH/DELETE /api/v1/surveys/ had no require_permission() at all,
  unlike every other survey write (add/update/delete_survey_question,
  already on settings:write) — any authenticated tenant user could create,
  edit or delete a whole survey.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Write Auth Test", slug=f"wat-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return user_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestLibraryBorrowReturnRequirePermission:
    def test_student_cannot_borrow_on_behalf_of_another(self):
        tenant_id = _make_tenant()
        student_id = _make_user(tenant_id)
        victim_id = _make_user(tenant_id)
        student = {"id": student_id, "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).post(
            "/api/v1/library/borrow/",
            json={"resource_id": str(uuid.uuid4()), "user_id": victim_id, "due_date": "2026-09-15"},
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_student_cannot_mark_a_borrow_as_returned(self):
        tenant_id = _make_tenant()
        student = {"id": _make_user(tenant_id), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).post(
            "/api/v1/library/return/",
            json={"borrow_id": str(uuid.uuid4())},
            headers=HEADERS,
        )
        assert resp.status_code == 403


class TestSurveyWritesRequirePermission:
    def test_student_cannot_create_survey(self):
        tenant_id = _make_tenant()
        student = {"id": _make_user(tenant_id), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).post(
            "/api/v1/surveys/",
            json={"title": "Sondage pirate", "questions": []},
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_parent_cannot_update_survey(self):
        tenant_id = _make_tenant()
        parent = {"id": _make_user(tenant_id), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent).patch(
            f"/api/v1/surveys/{uuid.uuid4()}/",
            json={"title": "Modifié"},
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_teacher_cannot_delete_survey(self):
        tenant_id = _make_tenant()
        teacher = {"id": _make_user(tenant_id), "roles": ["TEACHER"], "tenant_id": tenant_id}
        resp = _as(teacher).delete(f"/api/v1/surveys/{uuid.uuid4()}/", headers=HEADERS)
        assert resp.status_code == 403

    def test_tenant_admin_can_create_survey(self):
        tenant_id = _make_tenant()
        admin = {"id": _make_user(tenant_id), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
        resp = _as(admin).post(
            "/api/v1/surveys/",
            json={"title": "Sondage légitime", "questions": []},
            headers=HEADERS,
        )
        assert resp.status_code == 201, resp.text
