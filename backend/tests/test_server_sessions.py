"""Sessions serveur et audit des authentifications (P0-1/P0-2, audit 2026-11-02).

Avant ce correctif :
- la page « Sessions » listait toujours zéro session et « terminer une
  session » affichait un succès sans rien révoquer (stub front) ;
- aucun événement d'authentification n'était écrit par le serveur ;
- chaque /auth/refresh/ ajoutait un jti au registre Redis sans retirer
  l'ancien (TTL 30 min pour des sessions de 7 jours), d'où des 429
  « Too many active sessions » sur des rafraîchissements légitimes.

Les tests du registre exigent un vrai Redis (comme test_token_lifecycle.py) ;
les contrôles d'autorisation (403/404) et l'indisponibilité du registre
n'en ont pas besoin.
"""
import os
import uuid

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import jwt as jwt_lib  # noqa: E402
import pytest  # noqa: E402
from conftest import get_test_client, redis_is_available  # noqa: E402
from app.core.config import settings  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

client = get_test_client()

_needs_redis = pytest.mark.skipif(
    not redis_is_available(), reason="le registre des sessions est dans Redis"
)

LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
LOGOUT_URL = "/api/v1/auth/logout/"
SESSIONS_URL = "/api/v1/auth/sessions/"
ME_URL = "/api/v1/users/me/"
PASSWORD = "Sessions@2026!"
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


@pytest.fixture(scope="module", autouse=True)
def _setup():
    from app.core.database import Base, engine
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    previous = auth_limiter.enabled
    auth_limiter.enabled = False
    yield
    auth_limiter.enabled = previous


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Sessions", slug=f"sessions-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, roles: list[str]) -> tuple[str, str]:
    user_id = str(uuid.uuid4())
    email = f"session.{uuid.uuid4().hex[:8]}@ecole.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Aïssatou", last_name="Diallo",
            password_hash=get_password_hash(PASSWORD), is_active=True, is_verified=True,
        ))
        for role in roles:
            db.add(UserRole(user_id=user_id, tenant_id=tenant_id, role=role))
        db.commit()
    return user_id, email


def _login(email: str, user_agent: str = DESKTOP_UA) -> str:
    resp = client.post(
        LOGIN_URL, data={"username": email, "password": PASSWORD}, headers={"User-Agent": user_agent}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _sid(token: str) -> str:
    return jwt_lib.decode(token, options={"verify_signature": False})["sid"]


def _audit_rows(tenant_id: str, user_id: str) -> list:
    from app.models.audit_log import AuditLog

    with SessionLocal() as db:
        return (
            db.query(AuditLog)
            .filter(AuditLog.tenant_id == tenant_id, AuditLog.resource_id == user_id, AuditLog.resource_type == "AUTH")
            .all()
        )


def _audit_actions(tenant_id: str, user_id: str) -> list[str]:
    return [r.action for r in _audit_rows(tenant_id, user_id)]


# ─── Identifiant de session stable ──────────────────────────────────────────

@_needs_redis
class TestStableSessionId:
    def test_refresh_keeps_the_session_id(self):
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        token = _login(email)
        refreshed = client.post(REFRESH_URL, headers=_auth(token))
        assert refreshed.status_code == 200, refreshed.text
        assert _sid(refreshed.json()["access_token"]) == _sid(token)

    def test_repeated_refreshes_never_hit_the_session_cap(self):
        """BUG-SESS-03 : 10 rafraîchissements = toujours UNE session, jamais 429."""
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        token = _login(email)
        for i in range(10):
            resp = client.post(REFRESH_URL, headers=_auth(token))
            assert resp.status_code == 200, f"refresh #{i+1}: {resp.text}"
            token = resp.json()["access_token"]
        sessions = client.get(SESSIONS_URL, headers=_auth(token))
        assert sessions.status_code == 200, sessions.text
        assert len(sessions.json()) == 1


# ─── Liste et révocation par l'utilisateur ─────────────────────────────────

@_needs_redis
class TestOwnSessions:
    def test_lists_real_sessions_with_device_and_current_flag(self):
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        first = _login(email)
        second = _login(email, user_agent="Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36")

        resp = client.get(SESSIONS_URL, headers=_auth(second))
        assert resp.status_code == 200, resp.text
        by_id = {s["id"]: s for s in resp.json()}
        assert set(by_id) == {_sid(first), _sid(second)}
        assert by_id[_sid(second)]["is_current"] is True
        assert by_id[_sid(first)]["is_current"] is False
        assert by_id[_sid(second)]["device_type"] == "mobile"
        assert by_id[_sid(first)]["browser"] == "Chrome"
        assert by_id[_sid(first)]["os"] == "Windows"

    def test_revoked_session_is_refused_on_requests_and_refresh(self):
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        lost_device = _login(email)
        this_device = _login(email)

        resp = client.delete(f"{SESSIONS_URL}{_sid(lost_device)}/", headers=_auth(this_device))
        assert resp.status_code == 200, resp.text

        assert client.get(ME_URL, headers=_auth(lost_device)).status_code == 401
        assert client.post(REFRESH_URL, headers=_auth(lost_device)).status_code == 401
        # L'appareil qui a révoqué reste connecté.
        assert client.get(ME_URL, headers=_auth(this_device)).status_code == 200
        listed = client.get(SESSIONS_URL, headers=_auth(this_device)).json()
        assert [s["id"] for s in listed] == [_sid(this_device)]

    def test_cannot_revoke_another_accounts_session(self):
        tenant_id = _make_tenant()
        _, victim_email = _make_user(tenant_id, ["TEACHER"])
        _, attacker_email = _make_user(tenant_id, ["TEACHER"])
        victim = _login(victim_email)
        attacker = _login(attacker_email)

        resp = client.delete(f"{SESSIONS_URL}{_sid(victim)}/", headers=_auth(attacker))
        assert resp.status_code == 404, resp.text
        assert client.get(ME_URL, headers=_auth(victim)).status_code == 200

    def test_unknown_session_is_404_not_a_fake_success(self):
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        token = _login(email)
        resp = client.delete(f"{SESSIONS_URL}does-not-exist/", headers=_auth(token))
        assert resp.status_code == 404, resp.text

    def test_logout_removes_the_session_from_the_list(self):
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        leaving = _login(email)
        staying = _login(email)
        assert client.post(LOGOUT_URL, headers=_auth(leaving)).status_code == 200
        listed = client.get(SESSIONS_URL, headers=_auth(staying)).json()
        assert [s["id"] for s in listed] == [_sid(staying)]


# ─── Administration : sessions d'un compte de l'établissement ──────────────

@_needs_redis
class TestAdminSessions:
    def test_admin_lists_and_revokes_a_users_session(self):
        tenant_id = _make_tenant()
        _, admin_email = _make_user(tenant_id, ["DIRECTOR"])
        teacher_id, teacher_email = _make_user(tenant_id, ["TEACHER"])
        admin = _login(admin_email)
        teacher = _login(teacher_email)

        listed = client.get(f"/api/v1/users/{teacher_id}/sessions/", headers=_auth(admin))
        assert listed.status_code == 200, listed.text
        assert [s["id"] for s in listed.json()] == [_sid(teacher)]

        revoked = client.delete(f"/api/v1/users/{teacher_id}/sessions/{_sid(teacher)}/", headers=_auth(admin))
        assert revoked.status_code == 200, revoked.text
        assert client.get(ME_URL, headers=_auth(teacher)).status_code == 401


class TestAdminSessionsAuthorization:
    """Sans Redis : l'autorisation est décidée avant tout accès au registre."""

    def test_admin_of_another_tenant_gets_404(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        teacher_id, _ = _make_user(tenant_a, ["TEACHER"])
        _, admin_b_email = _make_user(tenant_b, ["DIRECTOR"])
        admin_b = _login(admin_b_email)

        listed = client.get(f"/api/v1/users/{teacher_id}/sessions/", headers=_auth(admin_b))
        assert listed.status_code == 404, listed.text
        revoked = client.delete(f"/api/v1/users/{teacher_id}/sessions/any-sid/", headers=_auth(admin_b))
        assert revoked.status_code == 404, revoked.text

    def test_role_without_users_write_gets_403(self):
        tenant_id = _make_tenant()
        target_id, _ = _make_user(tenant_id, ["TEACHER"])
        _, teacher_email = _make_user(tenant_id, ["TEACHER"])
        teacher = _login(teacher_email)

        assert client.get(f"/api/v1/users/{target_id}/sessions/", headers=_auth(teacher)).status_code == 403
        assert client.delete(
            f"/api/v1/users/{target_id}/sessions/any-sid/", headers=_auth(teacher)
        ).status_code == 403

    def test_unauthenticated_is_401(self):
        assert client.get(SESSIONS_URL).status_code == 401


class TestSessionRegistryUnavailable:
    def test_listing_is_503_not_an_empty_list(self, monkeypatch):
        """Registre injoignable : jamais une liste vide trompeuse."""
        from app.core import sessions

        async def _down(_user_id):
            raise sessions.SessionStoreUnavailable("down")

        monkeypatch.setattr(sessions, "list_sessions", _down)
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        token = _login(email)
        resp = client.get(SESSIONS_URL, headers=_auth(token))
        assert resp.status_code == 503, resp.text

    def test_revocation_is_503_not_a_fake_success(self, monkeypatch):
        from app.core import sessions

        async def _down(_user_id, _sid):
            raise sessions.SessionStoreUnavailable("down")

        monkeypatch.setattr(sessions, "revoke_session", _down)
        tenant_id = _make_tenant()
        _, email = _make_user(tenant_id, ["TEACHER"])
        token = _login(email)
        resp = client.delete(f"{SESSIONS_URL}whatever/", headers=_auth(token))
        assert resp.status_code == 503, resp.text


# ─── Audit serveur des authentifications ───────────────────────────────────

class TestAuthEventsAreAuditedByTheServer:
    def test_successful_and_failed_logins_are_recorded(self):
        tenant_id = _make_tenant()
        user_id, email = _make_user(tenant_id, ["TEACHER"])

        bad = client.post(LOGIN_URL, data={"username": email, "password": "wrong-password"})
        assert bad.status_code == 401
        _login(email)

        actions = _audit_actions(tenant_id, user_id)
        assert "LOGIN_FAILED" in actions
        assert "LOGIN_SUCCESS" in actions

    def test_audit_row_carries_user_agent_and_identity(self):
        tenant_id = _make_tenant()
        user_id, email = _make_user(tenant_id, ["TEACHER"])
        _login(email)
        rows = [r for r in _audit_rows(tenant_id, user_id) if r.action == "LOGIN_SUCCESS"]
        assert len(rows) == 1
        assert rows[0].user_agent == DESKTOP_UA
        assert rows[0].user_id == user_id
        assert rows[0].ip_address  # adresse du client de test

    @_needs_redis
    def test_logout_and_revocation_are_recorded(self):
        tenant_id = _make_tenant()
        user_id, email = _make_user(tenant_id, ["TEACHER"])
        other = _login(email)
        current = _login(email)
        assert client.delete(f"{SESSIONS_URL}{_sid(other)}/", headers=_auth(current)).status_code == 200
        assert client.post(LOGOUT_URL, headers=_auth(current)).status_code == 200

        actions = _audit_actions(tenant_id, user_id)
        assert "SESSION_REVOKED" in actions
        assert "LOGOUT" in actions

    @pytest.mark.skipif(settings.is_sqlite, reason="GET /audit/ est en SQL brut sur UUID : PostgreSQL uniquement (job CI PostgreSQL).")
    def test_audit_history_is_readable_by_resource_type(self):
        """Le front lit l'historique par GET /audit/?resource_type=AUTH
        (réponse = tableau, pas {items: ...})."""
        tenant_id = _make_tenant()
        _, admin_email = _make_user(tenant_id, ["TENANT_ADMIN"])
        admin = _login(admin_email)
        resp = client.get("/api/v1/audit/", params={"resource_type": "AUTH"}, headers=_auth(admin))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert isinstance(body, list)
        assert any(r["action"] == "LOGIN_SUCCESS" for r in body)
        assert all(r["tenant_id"] == tenant_id for r in body)
