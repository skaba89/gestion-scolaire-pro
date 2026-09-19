"""A deactivated account must lose access immediately, not at token expiry.

Institutional-readiness audit (2026-09), account-lifecycle subagent finding
#1: get_current_user() loaded the user and only checked "does it exist?" —
never "is_active". is_active was checked only at /auth/login/ and
/auth/refresh/. Since get_current_user() is the dependency behind virtually
every protected endpoint (via require_permission()), a user deactivated by
a TENANT_ADMIN (PATCH /users/{id}/toggle-status/) kept full access with
their already-issued access token until it naturally expired
(ACCESS_TOKEN_EXPIRE_MINUTES, default 30) — the deactivation had zero
immediate effect.

Fixed in two places, deliberately overlapping (defense-in-depth):
- get_current_user() now rejects a token whose user is not is_active,
  independent of Redis/token-blacklist availability.
- toggle_user_status() now also calls blacklist_all_user_tokens() on
  deactivation (same pattern as reset_user_password()), so even a stale
  token-version claim is invalidated immediately, not just is_active.

These tests exercise the real get_current_user() dependency (no override)
through GET /api/v1/users/me/, proving a deactivated user is rejected with
401 and an active user is not affected.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

ME_URL = "/api/v1/users/me/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Désactivation Test", slug=f"deact-{tenant_id[:8]}",
            type="school", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, *, role: str, is_active: bool = True) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Amadou", last_name="Bah",
            password_hash="x", is_active=is_active,
        ))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, role=role))
        db.commit()
    return user_id


def _token_for(user_id: str, tenant_id: str) -> str:
    return create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": []})


def _set_active(user_id: str, is_active: bool) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.id == user_id).first()
        user.is_active = is_active
        db.commit()


class TestDeactivatedAccountLosesAccess:
    def test_active_user_can_access_protected_endpoint(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id, role="STAFF")
        headers = {"Authorization": f"Bearer {_token_for(user_id, tenant_id)}"}

        resp = client.get(ME_URL, headers=headers)
        assert resp.status_code == 200, resp.text

    def test_deactivated_user_token_is_rejected_immediately(self):
        """Same already-issued token, no re-login — deactivation alone
        must be enough to cut off access on the very next request."""
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id, role="STAFF")
        headers = {"Authorization": f"Bearer {_token_for(user_id, tenant_id)}"}

        # Token issued while active still works...
        assert client.get(ME_URL, headers=headers).status_code == 200

        # ...but not after deactivation, with the exact same token.
        _set_active(user_id, False)
        resp = client.get(ME_URL, headers=headers)
        assert resp.status_code == 401, resp.text

    def test_reactivated_user_regains_access(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id, role="STAFF", is_active=False)
        headers = {"Authorization": f"Bearer {_token_for(user_id, tenant_id)}"}

        assert client.get(ME_URL, headers=headers).status_code == 401

        _set_active(user_id, True)
        resp = client.get(ME_URL, headers=headers)
        assert resp.status_code == 200, resp.text
