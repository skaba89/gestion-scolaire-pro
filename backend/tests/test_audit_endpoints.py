"""/audit/ : lecture isolée par établissement, entrées du navigateur bornées.

Module sans aucun test jusqu'au 2026-10-27. Constats corrigés :
- POST /audit/ et /audit/log acceptaient une action en texte libre : un
  compte ayant audit:write (TENANT_ADMIN, DIRECTOR) pouvait écrire une entrée
  « LOGIN » ou « UPDATE_SETTINGS » indiscernable de celles du serveur. Les
  entrées du navigateur sont désormais préfixées CLIENT_ ;
- resource_type est NOT NULL en base mais était facultatif : 500 sans lui ;
- details sans borne ;
- l'INSERT ne fournissait pas d'id (colonne sans valeur par défaut) : chaque
  appel échouait en 500 depuis l'origine.
"""
import uuid
from datetime import datetime, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

URL = "/api/v1/audit/"


def _tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Audit", slug=f"audit-{tenant_id[:8]}", type="school",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tenant_id


def _user(tenant_id: str, role: str = "TENANT_ADMIN") -> tuple[str, dict]:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=user_id, tenant_id=tenant_id, email=f"au.{user_id[:8]}@ecole.gn", username=f"au.{user_id[:8]}",
                    first_name="Kadiatou", last_name="Diallo", password_hash="x", is_active=True))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, role=role))
        db.commit()
    token = create_access_token({
        "sub": user_id, "tenant_id": tenant_id, "roles": [role], "jti": uuid.uuid4().hex[:16],
        "auth_time": int(datetime.now(timezone.utc).timestamp()),
    })
    return user_id, {"Authorization": f"Bearer {token}"}


def _log(tenant_id: str, user_id: str, action: str) -> None:
    with SessionLocal() as db:
        db.add(AuditLog(tenant_id=tenant_id, user_id=user_id, action=action, resource_type="TEST", severity="INFO"))
        db.commit()


@pytest.mark.skipif(settings.is_sqlite, reason="SQL brut sur UUID : format de stockage propre à PostgreSQL (job CI PostgreSQL).")
class TestRead:
    def test_admin_sees_only_own_tenant_entries(self):
        tenant_a, tenant_b = _tenant(), _tenant()
        admin_a, headers_a = _user(tenant_a)
        admin_b, _ = _user(tenant_b)
        _log(tenant_a, admin_a, "UPDATE_SETTINGS")
        _log(tenant_b, admin_b, "DELETE_STUDENT")

        resp = client.get(URL, headers=headers_a)
        assert resp.status_code == 200
        actions = {row["action"] for row in resp.json()}
        assert "UPDATE_SETTINGS" in actions
        assert "DELETE_STUDENT" not in actions
        assert {row["tenant_id"] for row in resp.json()} == {tenant_a}

    def test_filters_and_pagination(self):
        tenant_id = _tenant()
        admin, headers = _user(tenant_id)
        for action in ("A_ONE", "A_TWO", "A_TWO"):
            _log(tenant_id, admin, action)
        assert len(client.get(URL, headers=headers, params={"action": "A_TWO"}).json()) == 2
        assert len(client.get(URL, headers=headers, params={"page_size": 1}).json()) == 1
        assert client.get(URL, headers=headers, params={"page_size": 101}).status_code == 422

    @pytest.mark.parametrize("role", ["TEACHER", "STUDENT", "PARENT"])
    def test_non_admin_roles_cannot_read(self, role):
        _, headers = _user(_tenant(), role)
        assert client.get(URL, headers=headers).status_code == 403


class TestClientEntriesValidation:
    @pytest.mark.parametrize("payload", [
        {"action": "login; DROP"},
        {"action": "x"},
        {"action": "LOGIN", "severity": "DEBUG"},
        {"action": "LOGIN", "resource_type": "R" * 51},
        {"action": "LOGIN", "details": {"blob": "x" * 11_000}},
    ])
    def test_malformed_entries_are_refused(self, payload):
        _, headers = _user(_tenant())
        assert client.post(URL, headers=headers, json=payload).status_code == 422

    def test_teacher_cannot_write(self):
        _, headers = _user(_tenant(), "TEACHER")
        assert client.post(URL, headers=headers, json={"action": "VIEW_PAGE"}).status_code == 403


@pytest.mark.skipif(settings.is_sqlite, reason="INSERT … NOW() en SQL brut : PostgreSQL uniquement (job CI PostgreSQL).")
class TestClientEntriesStored:
    @pytest.mark.parametrize("path", [URL, "/api/v1/audit/log"])
    def test_client_entry_is_prefixed_and_attributed(self, path):
        tenant_id = _tenant()
        admin, headers = _user(tenant_id)
        resp = client.post(path, headers=headers, json={"action": "LOGIN", "details": {"note": "x"}})
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["action"] == "CLIENT_LOGIN"
        assert body["resource_type"] == "CLIENT"
        assert str(body["user_id"]) == admin
        assert str(body["tenant_id"]) == tenant_id

    def test_already_prefixed_action_is_not_doubled(self):
        _, headers = _user(_tenant())
        assert client.post(URL, headers=headers, json={"action": "CLIENT_EXPORT"}).json()["action"] == "CLIENT_EXPORT"
