"""Tests de `require_plan` (app/core/security.py) : comportement fail-closed.

Choix d'implémentation : `SessionLocal` est remplacé (monkeypatch de
`app.core.database.SessionLocal`, résolu localement dans `_check` à chaque
appel) par une fausse session. C'est plus robuste que la base SQLite de test :
les erreurs base (OperationalError, erreur au `.query()`) et les exceptions
inattendues ne sont pas reproductibles proprement avec une vraie base, et on
n'est pas dépendant du schéma / des fixtures de la table `tenants`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import OperationalError, SQLAlchemyError

import app.core.database as db_module
from app.core.security import get_current_user, require_plan

TENANT_ID = str(uuid.uuid4())


def _naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _user(roles=("TENANT_ADMIN",), tenant_id=TENANT_ID) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "email": "admin@example.test",
        "roles": list(roles),
        "tenant_id": tenant_id,
    }


def _tenant(plan="pro", status="active", trial_ends_at=None) -> SimpleNamespace:
    return SimpleNamespace(
        subscription_plan=plan,
        subscription_status=status,
        trial_ends_at=trial_ends_at,
    )


class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._result


class _FakeSession:
    def __init__(self, result=None, query_error: Exception | None = None):
        self._result = result
        self._query_error = query_error

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def query(self, *_args, **_kwargs):
        if self._query_error is not None:
            raise self._query_error
        return _FakeQuery(self._result)

    def execute(self, *_args, **_kwargs):
        # Le patch est global : d'autres consommateurs de SessionLocal pendant
        # une requête HTTP (ex. middleware quota) ne doivent pas s'y appuyer.
        raise NotImplementedError("_FakeSession ne sert qu'à require_plan")


@pytest.fixture
def patch_session(monkeypatch):
    """Installe un faux SessionLocal ; retourne la liste des appels."""

    def _install(tenant=None, query_error=None, factory_error=None):
        calls: list[int] = []

        def _factory():
            calls.append(1)
            if factory_error is not None:
                raise factory_error
            return _FakeSession(result=tenant, query_error=query_error)

        monkeypatch.setattr(db_module, "SessionLocal", _factory)
        return calls

    return _install


def _call(min_plan="pro", user=None):
    return require_plan(min_plan)(current_user=user if user is not None else _user())


# ─── Accès accordé ──────────────────────────────────────────────────────────────

class TestAccessGranted:
    def test_pro_active_allowed(self, patch_session):
        patch_session(_tenant("pro", "active"))
        user = _user()
        assert _call("pro", user) is user

    def test_enterprise_active_allowed_for_pro(self, patch_session):
        patch_session(_tenant("enterprise", "active"))
        user = _user()
        assert _call("pro", user) is user

    def test_pro_trialing_without_trial_end_allowed(self, patch_session):
        # Comportement actuel figé : trialing sans trial_ends_at => accès.
        # Faiblesse connue suivie en ticket séparé (docs/STATUT_ACTUEL.md,
        # 2026-10-04) : ce test changera quand la règle métier sera revue.
        patch_session(_tenant("pro", "trialing", None))
        user = _user()
        assert _call("pro", user) is user

    def test_pro_trialing_future_trial_end_allowed(self, patch_session):
        patch_session(_tenant("pro", "trialing", _naive_utc_now() + timedelta(days=5)))
        user = _user()
        assert _call("pro", user) is user

    def test_status_none_defaults_to_trialing_allowed(self, patch_session):
        patch_session(_tenant("pro", None, None))
        user = _user()
        assert _call("pro", user) is user


# ─── Fail-closed : tenant introuvable / erreurs ─────────────────────────────────

class TestFailClosed:
    def test_tenant_not_found_returns_403(self, patch_session):
        patch_session(None)
        with pytest.raises(HTTPException) as exc:
            _call("pro")
        assert exc.value.status_code == 403
        assert exc.value.detail["error"] == "TENANT_NOT_FOUND"
        assert exc.value.detail["error_code"] == "TENANT_NOT_FOUND"

    def test_operational_error_on_session_returns_503(self, patch_session):
        patch_session(factory_error=OperationalError("SELECT 1", {}, Exception("down")))
        with pytest.raises(HTTPException) as exc:
            _call("pro")
        assert exc.value.status_code == 503
        assert exc.value.headers["Retry-After"] == "5"

    def test_sqlalchemy_error_on_query_returns_503(self, patch_session):
        patch_session(query_error=SQLAlchemyError("boom"))
        with pytest.raises(HTTPException) as exc:
            _call("pro")
        assert exc.value.status_code == 503
        assert exc.value.headers["Retry-After"] == "5"

    def test_unexpected_exception_propagates_without_access(self, patch_session):
        patch_session(factory_error=RuntimeError("inattendue"))
        with pytest.raises(RuntimeError):
            _call("pro")

    def test_unexpected_exception_on_query_propagates(self, patch_session):
        patch_session(query_error=RuntimeError("inattendue"))
        with pytest.raises(RuntimeError):
            _call("pro")


# ─── SUPER_ADMIN / absence de tenant ────────────────────────────────────────────

class TestBypassAndNoTenant:
    def test_super_admin_bypasses_db(self, patch_session):
        calls = patch_session(factory_error=OperationalError("SELECT 1", {}, Exception("down")))
        user = _user(roles=("SUPER_ADMIN",), tenant_id=None)
        assert _call("enterprise", user) is user
        assert calls == [], "SessionLocal ne doit pas être appelé pour un SUPER_ADMIN"

    @pytest.mark.parametrize("tenant_id", [None, ""])
    def test_no_tenant_id_returns_402(self, patch_session, tenant_id):
        calls = patch_session(_tenant("enterprise", "active"))
        with pytest.raises(HTTPException) as exc:
            _call("pro", _user(tenant_id=tenant_id))
        assert exc.value.status_code == 402
        assert exc.value.detail["error"] == "PLAN_REQUIRED"
        assert calls == []


# ─── Refus 402 ──────────────────────────────────────────────────────────────────

class TestPaymentRequired:
    def _assert_402(self, **expected):
        with pytest.raises(HTTPException) as exc:
            _call("pro")
        assert exc.value.status_code == 402
        assert exc.value.detail["error"] == "PLAN_REQUIRED"
        for key, value in expected.items():
            assert exc.value.detail[key] == value
        return exc.value

    def test_plan_none_defaults_to_starter(self, patch_session):
        patch_session(_tenant(None, "active"))
        self._assert_402(current_plan="starter")

    def test_unknown_plan_has_zero_weight(self, patch_session):
        patch_session(_tenant("gold", "active"))
        self._assert_402(current_plan="gold")

    def test_starter_active_denied(self, patch_session):
        patch_session(_tenant("starter", "active"))
        self._assert_402(current_plan="starter", current_status="active", required_plan="pro")

    def test_trialing_expired_trial_denied(self, patch_session):
        patch_session(_tenant("pro", "trialing", _naive_utc_now() - timedelta(days=1)))
        self._assert_402(current_status="expired")

    @pytest.mark.parametrize("status", ["expired", "canceled", "past_due"])
    def test_inactive_statuses_denied(self, patch_session, status):
        patch_session(_tenant("pro", status))
        self._assert_402(current_status=status)


# ─── Test HTTP ──────────────────────────────────────────────────────────────────

def _post_import_preview(client):
    """POST /import/students/preview/ en TENANT_ADMIN (get_current_user surchargé).

    Le SessionLocal factice (patch_session) évite de dépendre du schéma de la
    base de test.
    """
    from app.core.security import create_access_token
    from app.main import app

    tenant_id = str(uuid.uuid4())
    user = _user(tenant_id=tenant_id)
    app.dependency_overrides[get_current_user] = lambda: user
    # Le middleware tenant exige un Bearer (401 sinon) avant les dépendances.
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    try:
        return client.post(
            "/api/v1/import/students/preview/",
            files={"file": ("students.csv", b"first_name,last_name\nA,B\n", "text/csv")},
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)


class TestHttpFailClosed:
    """Contrat réellement reçu par le client : http_exception_handler
    (core/exceptions.py) aplatit un detail dict — seuls « message » et
    « error_code » sont propagés — et ne transmet pas exc.headers."""

    def test_import_preview_unknown_tenant_returns_403(self, client, patch_session):
        patch_session(None)
        resp = _post_import_preview(client)
        assert resp.status_code == 403, resp.text
        assert resp.json()["error"] == "TENANT_NOT_FOUND"
        assert resp.json()["detail"] == "Établissement introuvable ou inaccessible."

    def test_import_preview_db_error_returns_503(self, client, patch_session):
        patch_session(factory_error=OperationalError("SELECT 1", {}, Exception("down")))
        resp = _post_import_preview(client)
        assert resp.status_code == 503, resp.text
        assert "indisponible" in resp.json()["detail"]
