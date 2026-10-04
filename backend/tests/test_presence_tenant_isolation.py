"""PUT /api/v1/presence/ — isolation tenant / anti-IDOR (régression, 2026-10).

Avant : un TENANT_ADMIN (ou SUPER_ADMIN) pouvait passer n'importe quel
``user_id`` ; aucun contrôle d'appartenance au tenant, et l'upsert
``ON CONFLICT (user_id) DO UPDATE`` écrasait la présence d'un utilisateur
d'un autre tenant (RLS contournée par le rôle de connexion actuel).

Les refus (IDOR, id inexistant/invalide, rôle non admin) sont vérifiés sur
SQLite et PostgreSQL ; les cas autorisés exécutent le SQL PostgreSQL de
l'endpoint (NOW(), JSONB) et ne tournent donc que sur PostgreSQL (CI).
"""
import uuid

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

URL = "/api/v1/presence/"
requires_postgres = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="SQL PostgreSQL (NOW(), JSONB)")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user_id: str, tenant_id: str, roles: list) -> dict:
    user = {"id": user_id, "tenant_id": tenant_id, "roles": roles, "email": f"{user_id[:8]}@presence.test"}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": roles})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="Présence test", slug=f"presence-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _make_user(tenant_id: str) -> str:
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=uid, email=f"{uid[:8]}@presence.test", username=f"pr{uid[:8]}",
                    tenant_id=tenant_id, is_active=True))
        db.commit()
    return uid


@pytest.fixture
def two_tenants():
    a, b = _make_tenant(), _make_tenant()
    return {"A": a, "B": b, "admin_a": _make_user(a), "user_a": _make_user(a), "user_b": _make_user(b)}


class TestRefusals:
    def test_admin_a_cannot_update_user_of_tenant_b(self, two_tenants):
        t = two_tenants
        h = _as(t["admin_a"], t["A"], ["TENANT_ADMIN"])
        resp = client.put(URL, json={"user_id": t["user_b"], "is_online": True}, headers=h)
        assert resp.status_code == 404

    def test_unknown_user_id_returns_404(self, two_tenants):
        t = two_tenants
        h = _as(t["admin_a"], t["A"], ["TENANT_ADMIN"])
        resp = client.put(URL, json={"user_id": str(uuid.uuid4()), "is_online": True}, headers=h)
        assert resp.status_code == 404

    @pytest.mark.parametrize("bad_id", ["not-a-uuid", "../../users/1", "' OR 1=1 --", ""])
    def test_malformed_user_id_returns_404(self, two_tenants, bad_id):
        t = two_tenants
        h = _as(t["admin_a"], t["A"], ["TENANT_ADMIN"])
        resp = client.put(URL, json={"user_id": bad_id, "is_online": True}, headers=h)
        assert resp.status_code == 404

    def test_cross_tenant_and_unknown_ids_are_indistinguishable(self, two_tenants):
        """Pas d'oracle d'existence : même code et même corps."""
        t = two_tenants
        h = _as(t["admin_a"], t["A"], ["TENANT_ADMIN"])
        r_other = client.put(URL, json={"user_id": t["user_b"], "is_online": True}, headers=h)
        r_none = client.put(URL, json={"user_id": str(uuid.uuid4()), "is_online": True}, headers=h)
        strip = lambda r: {k: v for k, v in r.json().items() if k != "request_id"}
        assert (r_other.status_code, strip(r_other)) == (r_none.status_code, strip(r_none))

    def test_non_admin_cannot_update_another_user_same_tenant(self, two_tenants):
        t = two_tenants
        h = _as(t["user_a"], t["A"], ["TEACHER"])
        resp = client.put(URL, json={"user_id": t["admin_a"], "is_online": True}, headers=h)
        assert resp.status_code == 403


@requires_postgres
class TestAllowedAndNoOverwrite:
    def test_user_updates_own_presence(self, two_tenants):
        t = two_tenants
        h = _as(t["user_a"], t["A"], ["TEACHER"])
        resp = client.put(URL, json={"user_id": t["user_a"], "is_online": True}, headers=h)
        assert resp.status_code == 200, resp.text

    def test_admin_a_updates_user_of_tenant_a(self, two_tenants):
        t = two_tenants
        h = _as(t["admin_a"], t["A"], ["TENANT_ADMIN"])
        resp = client.put(URL, json={"user_id": t["user_a"], "is_online": False}, headers=h)
        assert resp.status_code == 200, resp.text
        with engine.connect() as c:
            row = c.execute(text("SELECT tenant_id::text, status FROM user_presence WHERE user_id = :u"),
                            {"u": t["user_a"]}).one()
        assert row == (t["A"], "offline")

    def test_idor_attempt_leaves_other_tenant_presence_untouched(self, two_tenants):
        t = two_tenants
        hb = _as(t["user_b"], t["B"], ["TEACHER"])
        assert client.put(URL, json={"user_id": t["user_b"], "status": "online"}, headers=hb).status_code == 200
        ha = _as(t["admin_a"], t["A"], ["TENANT_ADMIN"])
        resp = client.put(URL, json={"user_id": t["user_b"], "status": "offline"}, headers=ha)
        assert resp.status_code == 404
        with engine.connect() as c:
            row = c.execute(text("SELECT tenant_id::text, status FROM user_presence WHERE user_id = :u"),
                            {"u": t["user_b"]}).one()
        assert row == (t["B"], "online"), "la présence du tenant B a été modifiée par un admin du tenant A"
