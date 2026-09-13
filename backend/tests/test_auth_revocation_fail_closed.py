"""P0 — differentiated JWT-revocation policy when Redis is unavailable.

When Redis (the blacklist / logout-all backend) is unreachable, the token's
revocation status cannot be verified. Policy:
  * PRIVILEGED accounts (SUPER_ADMIN, TENANT_ADMIN, MINISTRY_ADMIN,
    REGIONAL_DIRECTOR, PREFECTURE_ADMIN, COMMUNE_ADMIN) → refuse with 503.
  * SENSITIVE operations (users:write, payments:write, …) → refuse with 503,
    even for an otherwise non-privileged role (e.g. ACCOUNTANT).
  * Everyone/everything else → fail open (no platform-wide outage).
Gated by settings.AUTH_PRIVILEGED_FAIL_CLOSED (strict in prod, relaxed under
DEBUG); tests drive it deterministically via the _privileged_fail_closed hook.

get_current_user is exercised for real against the test DB; Redis is mocked
(available / blacklisted / stale-version / unreachable) — no real Redis.
"""
import uuid
from unittest.mock import MagicMock

import pytest
from conftest import get_test_client

client = get_test_client()

import app.core.security as security  # noqa: E402
from app.core.security import (  # noqa: E402
    create_access_token,
    get_current_user,
    require_permission,
    verify_token,
)
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402
from fastapi import HTTPException  # noqa: E402


# ─── DB helpers ──────────────────────────────────────────────────────────────
def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Revocation", slug=f"revoc-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(roles: list[str], tenant_id: str | None) -> str:
    user_id = str(uuid.uuid4())
    email = f"u.{uuid.uuid4().hex[:6]}@ecole.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Aïssatou", last_name="Sow",
            password_hash=get_password_hash("Password@2026"),
            is_active=True, is_verified=True,
        ))
        for role in roles:
            db.add(UserRole(user_id=user_id, tenant_id=tenant_id, role=role))
        db.commit()
    return user_id


def _request() -> MagicMock:
    request = MagicMock()
    request.headers.get.return_value = None
    return request


# ─── Redis mocking ───────────────────────────────────────────────────────────
def _redis_available(monkeypatch, *, blacklisted=False, current_version=0):
    async def fake_exists(key):
        return blacklisted

    async def fake_get(key):
        return str(current_version) if current_version else None

    monkeypatch.setattr(security, "_privileged_fail_closed", lambda: True)
    # patch the singleton the function imports
    from app.core.cache import redis_client
    monkeypatch.setattr(redis_client, "exists", fake_exists)
    monkeypatch.setattr(redis_client, "get", fake_get)


def _redis_down(monkeypatch, *, fail_closed=True):
    async def boom(*a, **k):
        raise ConnectionError("Redis unavailable (simulated)")

    monkeypatch.setattr(security, "_privileged_fail_closed", lambda: fail_closed)
    from app.core.cache import redis_client
    monkeypatch.setattr(redis_client, "exists", boom)
    monkeypatch.setattr(redis_client, "get", boom)


def _token(user_id, tenant_id, *, jti="jti-1", tv=0):
    return {"sub": user_id, "tenant_id": tenant_id, "jti": jti, "tv": tv}


# ─── 1. valid token + Redis available ────────────────────────────────────────
@pytest.mark.asyncio
async def test_valid_token_redis_available_ok(monkeypatch):
    _redis_available(monkeypatch)
    tid = _make_tenant()
    uid = _make_user(["TEACHER"], tid)
    result = await get_current_user(request=_request(), token=_token(uid, tid))
    assert result["id"] == uid
    assert result["_revocation_verified"] is True


# ─── 2. revoked (blacklisted) token + Redis available → 401 ──────────────────
@pytest.mark.asyncio
async def test_blacklisted_token_redis_available_401(monkeypatch):
    _redis_available(monkeypatch, blacklisted=True)
    tid = _make_tenant()
    uid = _make_user(["TEACHER"], tid)
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request=_request(), token=_token(uid, tid))
    assert exc.value.status_code == 401


# ─── 3. Redis unavailable + privileged account → 503 ─────────────────────────
@pytest.mark.asyncio
@pytest.mark.parametrize("role", [
    "SUPER_ADMIN", "TENANT_ADMIN", "MINISTRY_ADMIN",
    "REGIONAL_DIRECTOR", "PREFECTURE_ADMIN", "COMMUNE_ADMIN",
])
async def test_redis_down_privileged_account_503(monkeypatch, role):
    _redis_down(monkeypatch, fail_closed=True)
    tid = None if role in ("SUPER_ADMIN", "MINISTRY_ADMIN") else _make_tenant()
    uid = _make_user([role], tid)
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request=_request(), token=_token(uid, tid))
    assert exc.value.status_code == 503


# ─── 4. Redis unavailable + privileged OPERATION (non-privileged role) → 503 ─
def test_redis_down_sensitive_operation_503(monkeypatch):
    monkeypatch.setattr(security, "_privileged_fail_closed", lambda: True)
    # ACCOUNTANT is not a privileged ACCOUNT, but payments:write is a sensitive op.
    current_user = {"id": "u1", "roles": ["ACCOUNTANT"], "_revocation_verified": False}
    dep = require_permission("payments:write")
    with pytest.raises(HTTPException) as exc:
        dep(current_user=current_user)
    assert exc.value.status_code == 503


def test_redis_down_non_sensitive_operation_allowed(monkeypatch):
    monkeypatch.setattr(security, "_privileged_fail_closed", lambda: True)
    current_user = {"id": "u1", "roles": ["ACCOUNTANT"], "_revocation_verified": False}
    dep = require_permission("students:read")  # not sensitive
    assert dep(current_user=current_user) is current_user


# ─── 5. non-privileged account + Redis unavailable → fail-open (allowed) ─────
@pytest.mark.asyncio
async def test_redis_down_non_privileged_account_fail_open(monkeypatch):
    _redis_down(monkeypatch, fail_closed=True)
    tid = _make_tenant()
    uid = _make_user(["TEACHER"], tid)
    result = await get_current_user(request=_request(), token=_token(uid, tid))
    assert result["id"] == uid
    assert result["_revocation_verified"] is False


@pytest.mark.asyncio
async def test_redis_down_privileged_but_policy_relaxed_allowed(monkeypatch):
    """AUTH_PRIVILEGED_FAIL_CLOSED off (DEBUG default) → no general outage."""
    _redis_down(monkeypatch, fail_closed=False)
    tid = _make_tenant()
    uid = _make_user(["TENANT_ADMIN"], tid)
    result = await get_current_user(request=_request(), token=_token(uid, tid))
    assert result["id"] == uid
    assert result["_revocation_verified"] is False


# ─── 6 & 7. expired / invalid token → 401 (verify_token) ─────────────────────
def test_expired_token_401():
    from datetime import timedelta
    tok = create_access_token({"sub": "u1"}, expires_delta=timedelta(minutes=-5))
    with pytest.raises(HTTPException) as exc:
        verify_token(tok)
    assert exc.value.status_code == 401


def test_invalid_token_401():
    with pytest.raises(HTTPException) as exc:
        verify_token("not.a.valid.jwt")
    assert exc.value.status_code == 401


# ─── 8. logout-all: stale token version + Redis available → 401 ──────────────
@pytest.mark.asyncio
async def test_stale_token_version_redis_available_401(monkeypatch):
    _redis_available(monkeypatch, current_version=5)  # server bumped to 5
    tid = _make_tenant()
    uid = _make_user(["TEACHER"], tid)
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request=_request(), token=_token(uid, tid, tv=1))
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_current_token_version_redis_available_ok(monkeypatch):
    _redis_available(monkeypatch, current_version=5)
    tid = _make_tenant()
    uid = _make_user(["TEACHER"], tid)
    result = await get_current_user(request=_request(), token=_token(uid, tid, tv=5))
    assert result["id"] == uid


# ─── 9. RBAC no regression ───────────────────────────────────────────────────
def test_rbac_grants_and_denies_normally():
    granted = {"id": "u1", "roles": ["TEACHER"], "_revocation_verified": True}
    assert require_permission("grades:write")(current_user=granted) is granted

    denied = {"id": "u2", "roles": ["STUDENT"], "_revocation_verified": True}
    with pytest.raises(HTTPException) as exc:
        require_permission("grades:write")(current_user=denied)
    assert exc.value.status_code == 403


def test_super_admin_wildcard_still_grants_sensitive_when_verified():
    su = {"id": "s1", "roles": ["SUPER_ADMIN"], "_revocation_verified": True}
    assert require_permission("payments:write")(current_user=su) is su


# ─── 10. multi-tenant no regression ──────────────────────────────────────────
@pytest.mark.asyncio
async def test_tenant_id_resolution_unchanged(monkeypatch):
    _redis_available(monkeypatch)
    tid = _make_tenant()
    uid = _make_user(["TEACHER"], tid)
    result = await get_current_user(request=_request(), token=_token(uid, tid))
    assert result["tenant_id"] == tid


@pytest.mark.asyncio
async def test_sensitive_op_proceeds_when_verified(monkeypatch):
    """A normal tenant user performing a sensitive op with a verified token
    is NOT blocked — the 503 only triggers on an unverifiable status."""
    _redis_available(monkeypatch)
    tid = _make_tenant()
    uid = _make_user(["ACCOUNTANT"], tid)
    user = await get_current_user(request=_request(), token=_token(uid, tid))
    assert user["_revocation_verified"] is True
    assert require_permission("payments:write")(current_user=user) is user
