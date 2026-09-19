"""POST /notifications/ (core/notifications.py::create_notification) —
institutional-readiness audit, 2026-09.

create_bulk_notifications already validated that a target user_id belongs
to the caller's tenant (403 otherwise). The single-create sibling had the
identical trust boundary (an ADMIN/SUPER_ADMIN/MANAGER can set user_id
from the body) but never checked the target's tenant — missed when the
bulk endpoint was hardened.

Note: is_admin here checks for roles "SUPER_ADMIN"/"ADMIN"/"MANAGER" —
of which only SUPER_ADMIN is an actual role in ROLE_PERMISSIONS
(app/core/security.py); TENANT_ADMIN/DIRECTOR never hit this branch at
all (their own user_id always wins), a separate pre-existing quirk out of
scope here. These tests use SUPER_ADMIN to exercise the vulnerable path."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="notifications uses RLS, exercised against Postgres in this suite.",
)

URL = "/api/v1/notifications/"


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
            id=tenant_id, name="École Notifications Test", slug=f"notif-{tenant_id[:8]}",
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


class TestCreateNotificationRejectsCrossTenantTarget:
    def test_admin_cannot_target_user_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        admin_id = _make_user(tenant_a)
        victim_id = _make_user(tenant_b)
        headers = _as({"id": admin_id, "roles": ["SUPER_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(URL, json={
            "title": "Test", "message": "x", "user_id": victim_id,
        }, headers=headers)
        assert resp.status_code == 403, resp.text

        with SessionLocal() as db:
            assert db.query(Notification).filter(Notification.user_id == victim_id).first() is None

    def test_admin_can_target_user_in_same_tenant(self):
        tenant_id = _make_tenant()
        admin_id = _make_user(tenant_id)
        target_id = _make_user(tenant_id)
        headers = _as({"id": admin_id, "roles": ["SUPER_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(URL, json={
            "title": "Test", "message": "x", "user_id": target_id,
        }, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["user_id"] == target_id
