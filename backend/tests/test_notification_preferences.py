"""GET/PUT /notifications/preferences/ — Phase 6 PWA backlog follow-up.

src/hooks/usePushNotifications.ts only ever persisted these toggles to
localStorage: they never synced across a user's devices and the server
never knew about them (every DB/push notification was created
unconditionally). This adds server-side persistence, one row per user,
get-or-create on first read. Actually filtering server-sent notifications
by these preferences is a separate, larger change and out of scope here.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.notification_preference import NotificationPreference  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="notification_preferences uses RLS, exercised against Postgres in this suite.",
)

URL = "/api/v1/notifications/preferences/"


def _make_tenant(name: str = "École Préférences Notif") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"notif-pref-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str | None, *, email: str | None = None) -> str:
    user_id = str(uuid.uuid4())
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Test", last_name="User", is_active=True,
        ))
        db.commit()
    return user_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _headers(user_id: str, tenant_id: str | None) -> dict:
    return _as({"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id})


class TestGetPreferences:
    def test_get_creates_defaults_on_first_read(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)

        resp = client.get(URL, headers=_headers(user_id, tenant_id))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["grades"] is True
        assert body["absences"] is True
        assert body["messages"] is True
        assert body["homework"] is True
        assert body["events"] is True
        assert body["payments"] is True
        assert body["user_id"] == user_id

        with SessionLocal() as db:
            row = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()
            assert row is not None

    def test_get_is_idempotent_no_duplicate_rows(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        headers = _headers(user_id, tenant_id)

        client.get(URL, headers=headers)
        client.get(URL, headers=headers)

        with SessionLocal() as db:
            count = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).count()
            assert count == 1

    def test_requires_auth(self):
        resp = client.get(URL)
        assert resp.status_code == 401


class TestUpdatePreferences:
    def test_partial_update_persists_and_leaves_others_untouched(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        headers = _headers(user_id, tenant_id)

        resp = client.put(URL, json={"payments": False}, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["payments"] is False
        assert body["grades"] is True  # untouched

        # Persisted, not just returned
        get_resp = client.get(URL, headers=headers)
        assert get_resp.json()["payments"] is False

    def test_update_without_prior_get_creates_row(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        headers = _headers(user_id, tenant_id)

        resp = client.put(URL, json={"absences": False}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["absences"] is False

    def test_preferences_isolated_per_user(self):
        tenant_id = _make_tenant()
        user_a = _make_user(tenant_id)
        user_b = _make_user(tenant_id)

        client.put(URL, json={"messages": False}, headers=_headers(user_a, tenant_id))

        resp_b = client.get(URL, headers=_headers(user_b, tenant_id))
        assert resp_b.json()["messages"] is True  # unaffected by user_a's change

    def test_super_admin_without_tenant_can_set_preferences(self):
        """SUPER_ADMIN users have tenant_id=NULL — tenant_id is nullable on
        this table specifically to support that."""
        user_id = _make_user(None)
        headers = _as({"id": user_id, "roles": ["SUPER_ADMIN"], "tenant_id": None})

        resp = client.get(URL, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["tenant_id"] is None
