"""Audit templates de site public (2026-08-28), constat "important" :
PATCH /tenants/{id}/ acceptait "logo_url"/"favicon_url" dans
ALLOWED_FIELDS_ADMIN alors que le modèle SQLAlchemy Tenant
(app/models/tenant.py) n'a aucune colonne de ce nom. `setattr(tenant,
key, value)` créait donc un attribut Python éphémère jamais persisté
par db.commit() — l'endpoint répondait 200 comme si la sauvegarde avait
réussi, alors que rien n'était écrit en base. Aucun appelant réel
n'envoyait ces deux champs à cet endpoint (le vrai chemin de sauvegarde
du logo est BrandingSettings.tsx -> updateSettings() -> le champ JSON
"settings", toujours autorisé). Ce test verrouille que ces deux champs
sont désormais explicitement rejetés (400) plutôt que silencieusement
avalés."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant_with_admin() -> tuple:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Logo Url Test", slug=f"logo-url-test-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    admin_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=admin_id, tenant_id=tenant_id, email=f"{admin_id[:8]}@example.com",
            username=f"admin-{admin_id[:8]}", is_active=True,
        ))
        db.commit()
    return tenant_id, admin_id


class TestLogoUrlFaviconUrlRejectedOnPatch:
    def test_logo_url_is_rejected_with_400_not_silently_swallowed(self):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(f"{BASE}/{tenant_id}/", json={"logo_url": "https://example.com/logo.png"}, headers=headers)

        assert resp.status_code == 400, resp.text
        assert "logo_url" in resp.json()["detail"]

    def test_favicon_url_is_rejected_with_400_not_silently_swallowed(self):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(f"{BASE}/{tenant_id}/", json={"favicon_url": "https://example.com/favicon.ico"}, headers=headers)

        assert resp.status_code == 400, resp.text
        assert "favicon_url" in resp.json()["detail"]

    def test_allowed_fields_still_work_normally(self):
        # Regression guard: removing logo_url/favicon_url must not disturb
        # any other field in ALLOWED_FIELDS_ADMIN.
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(f"{BASE}/{tenant_id}/", json={"name": "École Renommée"}, headers=headers)

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "École Renommée"
