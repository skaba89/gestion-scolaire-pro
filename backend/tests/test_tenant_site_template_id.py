"""Website Builder premium — la sélection de template de site
(settings.landing.site_template_id) doit survivre le chemin public
(GET /tenants/public/{slug}/), pas seulement le chemin admin
(PATCH /tenants/settings/).

Point de fragilité identifié explicitement en concevant cette
fonctionnalité : PATCH /tenants/settings/ accepte déjà n'importe quelle
clé dans `landing` sans validation (merge brut dans Tenant.settings),
mais _build_public_response() (tenants.py) reconstruit
TenantLandingSettings(**landing_raw) — tout champ absent de ce modèle
Pydantic est silencieusement supprimé à la lecture, même si l'admin l'a
bien sauvegardé. C'était déjà le cas pour "tagline"/"motto"/etc
(éditables dans LandingPageEditor.tsx mais jamais déclarés côté backend,
donc jamais visibles publiquement — gap pré-existant, hors scope ici).
Ce test verrouille que site_template_id, lui, a bien été déclaré et
survit réellement ce chemin."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_overrides():
    # get_current_user est surchargé via un dict global mutable — sans
    # ceci, une override laissée par le dernier test de ce fichier fuite
    # vers le prochain fichier collecté en ordre alphabétique (pattern
    # établi, voir tests/test_grades_idempotency.py et les incidents
    # réels qu'il a corrigés plus tôt cette session).
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
            id=tenant_id, name="Lycée Site Template Test", slug=f"site-template-{tenant_id[:8]}",
            type="HIGH_SCHOOL", country="GN", is_active=True, settings={},
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


class TestSiteTemplateIdSurvivesThePublicRoundTrip:
    def test_site_template_id_set_via_admin_patch_appears_on_public_read(self):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        patched = client.patch(
            "/api/v1/tenants/settings/",
            json={"landing": {"site_template_id": "school-excellence"}},
            headers=headers,
        )
        assert patched.status_code == 200, patched.text

        with SessionLocal() as db:
            tenant = db.get(Tenant, tenant_id)
            slug = tenant.slug

        public = client.get(f"/api/v1/tenants/public/{slug}/")
        assert public.status_code == 200, public.text
        assert public.json()["landing"]["site_template_id"] == "school-excellence"

    def test_public_read_defaults_to_none_when_never_set(self):
        tenant_id, _ = _make_tenant_with_admin()
        with SessionLocal() as db:
            slug = db.get(Tenant, tenant_id).slug

        public = client.get(f"/api/v1/tenants/public/{slug}/")
        assert public.status_code == 200, public.text
        assert public.json()["landing"].get("site_template_id") is None

    def test_admin_settings_read_also_reflects_the_saved_value(self):
        # GET /tenants/settings/ (admin, own tenant) is unvalidated — it
        # already worked for every landing key before this feature, but
        # locking it here too catches any accidental future scoping of
        # that read path to an explicit field allowlist.
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        client.patch("/api/v1/tenants/settings/", json={"landing": {"site_template_id": "school-excellence"}}, headers=headers)

        admin_read = client.get("/api/v1/tenants/settings/", headers=headers)
        assert admin_read.status_code == 200, admin_read.text
        assert admin_read.json()["landing"]["site_template_id"] == "school-excellence"
