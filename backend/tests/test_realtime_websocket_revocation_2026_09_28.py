"""GET /realtime/ws/{tenant_id}/{user_id} (core/realtime.py) — 8th
systematic audit sweep.

The WebSocket endpoint decoded the JWT directly and trusted its own
"roles"/tenant_id claims, bypassing every revocation check get_current_user()
enforces on every REST route: the per-token blacklist (logout/password
change), the logout-all token-version counter, and is_active (re-checked
against the DB on every request specifically because a deactivated
account's already-issued token must stop working immediately — see
test_account_deactivation_revokes_access.py). A still-unexpired token from
a deactivated account, a logged-out session, or a role since revoked in the
DB kept authenticating this endpoint for the life of the token.

Fixed by routing the same _evaluate_revocation() check used by
get_current_user() through this endpoint, and by re-reading is_active and
roles from the DB instead of trusting the token's claims.

Requires a real Redis instance — _evaluate_revocation() and
blacklist_all_user_tokens() both talk to app.core.cache.redis_client, same
constraint as test_tenant_5xx_redis_aggregation.py.
"""
import uuid

import pytest
from conftest import get_test_client, redis_is_available

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

_needs_redis = pytest.mark.skipif(not redis_is_available(), reason="Requires a real Redis instance")


@pytest.fixture(autouse=True)
def _no_leftover_get_current_user_override():
    """TestWebSocketRespectsLogoutAll authenticates POST /auth/logout-all/
    with a real, un-overridden token — it needs get_current_user() to
    resolve the caller from that token, not from a dependency_overrides
    entry a differently-scoped test elsewhere in the suite may have left
    registered on the shared `app` singleton without clearing it. Clearing
    it here (before and after) makes this file's assertions independent of
    full-suite run order."""
    app.dependency_overrides.pop(get_current_user, None)
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(scope="module", autouse=True)
def _disable_auth_rate_limiter():
    """This module calls the real POST /auth/logout-all/ endpoint, which
    shares its 5/minute-per-IP limiter with every other test hitting auth
    endpoints in the same full-suite run — disabled here to avoid a stray
    429 depending on run order, same pattern as test_token_lifecycle.py."""
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    previous = auth_limiter.enabled
    auth_limiter.enabled = False
    yield
    auth_limiter.enabled = previous


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École WS Test", slug=f"ws-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, *, role: str | None = None, is_active: bool = True) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Amadou", last_name="Bah",
            password_hash="x", is_active=is_active,
        ))
        if role:
            db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, role=role))
        db.commit()
    return user_id


def _set_active(user_id: str, is_active: bool) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.id == user_id).first()
        user.is_active = is_active
        db.commit()


def _remove_role(user_id: str, role: str) -> None:
    with SessionLocal() as db:
        db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == role).delete()
        db.commit()


def _token(user_id: str, tenant_id: str, *, roles=None, jti: str | None = None, tv: int = 0) -> str:
    data = {"sub": user_id, "tenant_id": tenant_id, "roles": roles or []}
    if jti:
        data["jti"] = jti
    if tv:
        data["tv"] = tv
    return create_access_token(data)


class TestWebSocketRejectsDeactivatedAccount:
    @_needs_redis
    def test_active_user_connection_is_accepted(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        token = _token(user_id, tenant_id)

        with client.websocket_connect(f"/api/v1/realtime/ws/{tenant_id}/{user_id}?token={token}") as ws:
            pass  # connection accepted, then cleanly closed by the context manager

    @_needs_redis
    def test_deactivated_user_token_is_rejected_immediately(self):
        """Same already-issued token, no re-login — deactivation alone must
        be enough to cut off the WebSocket, same as REST endpoints."""
        from starlette.testclient import WebSocketDisconnect

        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        token = _token(user_id, tenant_id)

        _set_active(user_id, False)
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/api/v1/realtime/ws/{tenant_id}/{user_id}?token={token}"):
                pass


class TestWebSocketRespectsLogoutAll:
    @_needs_redis
    def test_token_invalidated_by_logout_all_is_rejected(self):
        """Calls the real POST /auth/logout-all/ endpoint rather than
        blacklist_all_user_tokens() directly — the async Redis client binds
        to whichever event loop first touches it, and TestClient/anyio's
        own internal loop conflicts with a bare asyncio.run_until_complete()
        in the test (see test_token_lifecycle.py's own note on this exact
        pitfall: "attached to a different loop"). Going through the real
        HTTP endpoint keeps everything on TestClient's loop."""
        from starlette.testclient import WebSocketDisconnect

        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        # Token minted with tv=0, then logout-all bumps the server-side
        # version past it — the token must stop working without a new login.
        token = _token(user_id, tenant_id, tv=0)

        logout_all_resp = client.post("/api/v1/auth/logout-all/", headers={"Authorization": f"Bearer {token}"})
        assert logout_all_resp.status_code == 200, logout_all_resp.text

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/api/v1/realtime/ws/{tenant_id}/{user_id}?token={token}"):
                pass


class TestWebSocketRevokedSuperAdminRoleLosesCrossTenantAccess:
    @_needs_redis
    def test_super_admin_role_removed_in_db_cannot_cross_tenant(self):
        """token_roles used to be trusted straight from the JWT claim — a
        token minted while the user was SUPER_ADMIN kept the cross-tenant
        bypass even after the role was revoked in the DB. Roles must be
        re-read from the DB, same as get_current_user()."""
        from starlette.testclient import WebSocketDisconnect

        own_tenant = _make_tenant()
        other_tenant = _make_tenant()
        user_id = _make_user(own_tenant, role="SUPER_ADMIN")
        # Token claims SUPER_ADMIN (as it would have at mint time)...
        token = _token(user_id, own_tenant, roles=["SUPER_ADMIN"])

        # ...but the role is revoked in the DB before the connection attempt.
        _remove_role(user_id, "SUPER_ADMIN")

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/api/v1/realtime/ws/{other_tenant}/{user_id}?token={token}"):
                pass

    @_needs_redis
    def test_super_admin_role_still_in_db_can_cross_tenant(self):
        """Positive control: a genuinely current SUPER_ADMIN is unaffected."""
        own_tenant = _make_tenant()
        other_tenant = _make_tenant()
        user_id = _make_user(own_tenant, role="SUPER_ADMIN")
        token = _token(user_id, own_tenant, roles=["SUPER_ADMIN"])

        with client.websocket_connect(f"/api/v1/realtime/ws/{other_tenant}/{user_id}?token={token}"):
            pass
