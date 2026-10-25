"""Bornes de session et désactivation d'établissement (2026-10-25).

1. /auth/refresh/ accepte un jeton expiré — et en acceptait un expiré depuis
   n'importe quand : un jeton resté dans le localStorage d'un ordinateur
   partagé, ou volé, se rafraîchissait indéfiniment. Désormais :
     - refus si le jeton est expiré depuis plus de SESSION_IDLE_TIMEOUT_HOURS ;
     - refus si la connexion d'origine (`auth_time`) date de plus de
       SESSION_MAX_AGE_DAYS ; `auth_time` est recopié tel quel ;
     - un ancien jeton sans `auth_time` est accepté une fois (pas de
       déconnexion générale au déploiement) et reçoit l'heure courante ;
     - un jeton d'impersonation ne peut pas être prolongé.
2. Un établissement désactivé n'était bloqué qu'à /auth/login/ : ses sessions
   ouvertes continuaient (requêtes et rafraîchissements). Désormais 403 à
   chaque requête et au rafraîchissement ; SUPER_ADMIN n'est pas concerné.
3. http_exception_handler transmet exc.headers (Retry-After,
   WWW-Authenticate) et les champs d'un detail structuré (402 de
   require_plan).
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import get_test_client
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import jwt

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.exceptions import http_exception_handler  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

ME_URL = "/api/v1/users/me/"
REFRESH_URL = "/api/v1/auth/refresh/"


def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _make_tenant(is_active: bool = True) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Session Test", slug=f"sess-{tenant_id[:8]}",
            type="school", country="GN", is_active=is_active, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str | None, role: str = "STAFF") -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"s.{user_id[:8]}@ecole.gn",
            username=f"s.{user_id[:8]}", first_name="Fanta", last_name="Diallo",
            password_hash="x", is_active=True,
        ))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, role=role))
        db.commit()
    return user_id


def _set_tenant_active(tenant_id: str, is_active: bool) -> None:
    with SessionLocal() as db:
        db.query(Tenant).filter(Tenant.id == tenant_id).first().is_active = is_active
        db.commit()


def _token(user_id: str, tenant_id: str | None, *, expired_for: timedelta | None = None, **claims) -> str:
    delta = -expired_for if expired_for is not None else None
    return create_access_token(
        {"sub": user_id, "tenant_id": tenant_id, "roles": [], "jti": uuid.uuid4().hex[:16], **claims},
        expires_delta=delta,
    )


def _refresh(token: str):
    return client.post(REFRESH_URL, headers={"Authorization": f"Bearer {token}"})


def _claims(token: str) -> dict:
    return jwt.decode(token, options={"verify_signature": False})


# ─── 1. Bornes de session au rafraîchissement ─────────────────────────────────

class TestRefreshSessionBounds:
    def test_recently_expired_token_still_refreshes_and_keeps_auth_time(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        login_time = _now() - 3600
        resp = _refresh(_token(user_id, tenant_id, expired_for=timedelta(minutes=10), auth_time=login_time))
        assert resp.status_code == 200, resp.text
        assert _claims(resp.json()["access_token"])["auth_time"] == login_time

    def test_token_idle_longer_than_timeout_is_refused(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        idle = timedelta(hours=settings.SESSION_IDLE_TIMEOUT_HOURS, minutes=5)
        resp = _refresh(_token(user_id, tenant_id, expired_for=idle, auth_time=_now() - 86400))
        assert resp.status_code == 401
        assert "inactivité" in resp.json()["message"]

    def test_session_older_than_max_age_is_refused_even_if_active(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        too_old = _now() - settings.SESSION_MAX_AGE_DAYS * 86400 - 60
        resp = _refresh(_token(user_id, tenant_id, expired_for=timedelta(minutes=1), auth_time=too_old))
        assert resp.status_code == 401
        assert "trop ancienne" in resp.json()["message"]

    def test_legacy_token_without_auth_time_refreshes_once_and_gets_one(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        before = _now()
        resp = _refresh(_token(user_id, tenant_id, expired_for=timedelta(minutes=5)))
        assert resp.status_code == 200, resp.text
        assert _claims(resp.json()["access_token"])["auth_time"] >= before

    def test_impersonation_token_cannot_be_refreshed(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id, role="TENANT_ADMIN")
        resp = _refresh(_token(user_id, tenant_id, auth_time=_now(), impersonated_by=str(uuid.uuid4())))
        assert resp.status_code == 401


# ─── 2. Établissement désactivé ───────────────────────────────────────────────

class TestDeactivatedTenantLosesAccess:
    def test_open_session_is_cut_off_on_next_request(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        headers = {"Authorization": f"Bearer {_token(user_id, tenant_id, auth_time=_now())}"}
        assert client.get(ME_URL, headers=headers).status_code == 200

        _set_tenant_active(tenant_id, False)
        resp = client.get(ME_URL, headers=headers)
        assert resp.status_code == 403
        assert "désactivé" in resp.json()["message"]

    def test_refresh_is_refused(self):
        tenant_id = _make_tenant(is_active=False)
        user_id = _make_user(tenant_id)
        resp = _refresh(_token(user_id, tenant_id, expired_for=timedelta(minutes=5), auth_time=_now()))
        assert resp.status_code == 403

    def test_super_admin_keeps_access_to_a_deactivated_tenant(self):
        tenant_id = _make_tenant(is_active=False)
        admin_id = _make_user(None, role="SUPER_ADMIN")
        headers = {
            "Authorization": f"Bearer {_token(admin_id, None, auth_time=_now())}",
            "X-Tenant-ID": tenant_id,
        }
        assert client.get(ME_URL, headers=headers).status_code == 200


# ─── 3. Gestionnaire d'erreurs HTTP ───────────────────────────────────────────

@pytest.fixture
def error_client():
    app = FastAPI()
    app.add_exception_handler(HTTPException, http_exception_handler)

    @app.get("/busy")
    def busy():
        raise HTTPException(status_code=503, detail="Réessayez", headers={"Retry-After": "5"})

    @app.get("/plan")
    def plan():
        raise HTTPException(status_code=402, detail={
            "error": "PLAN_REQUIRED", "required_plan": "pro", "message": "Plan requis",
            "upgrade_url": "/billing",
        })

    return TestClient(app)


def test_error_handler_keeps_exception_headers(error_client):
    resp = error_client.get("/busy")
    assert resp.status_code == 503
    assert resp.headers["Retry-After"] == "5"


def test_error_handler_keeps_structured_402_fields(error_client):
    body = error_client.get("/plan").json()
    assert body["error"] == "PLAN_REQUIRED"
    assert body["required_plan"] == "pro"
    assert body["upgrade_url"] == "/billing"
    assert body["message"] == "Plan requis"
