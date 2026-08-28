"""Audit templates de site public (2026-08-28) : 11 champs de
TenantLandingSettings, éditables côté admin (LandingPageEditor.tsx) et
réellement lus par les 6 templates de site (4 legacy + 2 Website Builder
premium), étaient absents du modèle Pydantic backend
(TenantLandingSettings, schemas/tenants.py) — exactement le même piège
que celui documenté et déjà corrigé une fois pour site_template_id dans
test_tenant_site_template_id.py, qui notait explicitement ce gap comme
"hors scope" à l'époque : "C'était déjà le cas pour tagline/motto/etc
[...] gap pré-existant, hors scope ici".

_build_public_response() (tenants.py) reconstruit
TenantLandingSettings(**landing_raw) — tout champ absent de ce modèle
est silencieusement supprimé à la lecture publique, même si l'admin l'a
bien sauvegardé via PATCH /tenants/settings/ (qui, lui, accepte
n'importe quelle clé sans validation). Ce test verrouille que les 11
champs survivent désormais ce même chemin."""
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
            id=tenant_id, name="Université Landing Fields Test", slug=f"landing-fields-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
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


LANDING_PAYLOAD = {
    "tagline": "Former les esprits de demain",
    "facebook": "https://facebook.com/test",
    "instagram": "https://instagram.com/test",
    "twitter": "https://twitter.com/test",
    "youtube": "https://youtube.com/test",
    "opening_hours": "Lun-Ven 8h-18h",
    "features": ["Cantine", "Internat", "Bus scolaire"],
    "show_gallery": True,
    "school_motto": "Excellence et rigueur",
    "founded_year": 1998,
    "accreditation": "Accrédité Ministère de l'Éducation",
}


class TestLandingFieldsSurviveThePublicRoundTrip:
    def test_all_eleven_fields_appear_on_public_read_after_admin_patch(self):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        patched = client.patch(
            "/api/v1/tenants/settings/",
            json={"landing": LANDING_PAYLOAD},
            headers=headers,
        )
        assert patched.status_code == 200, patched.text

        with SessionLocal() as db:
            slug = db.get(Tenant, tenant_id).slug

        public = client.get(f"/api/v1/tenants/public/{slug}/")
        assert public.status_code == 200, public.text
        landing = public.json()["landing"]

        for key, value in LANDING_PAYLOAD.items():
            assert landing.get(key) == value, f"{key!r} n'a pas survécu au chemin public : {landing.get(key)!r} != {value!r}"

    def test_facebook_url_style_fields_also_survive_alongside_the_unsuffixed_ones(self):
        # Les templates premium préfèrent facebook_url/twitter_url/
        # linkedin_url avant de retomber sur facebook/twitter — les deux
        # conventions doivent survivre simultanément.
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        client.patch(
            "/api/v1/tenants/settings/",
            json={"landing": {
                "facebook_url": "https://facebook.com/suffixed",
                "twitter_url": "https://twitter.com/suffixed",
                "linkedin_url": "https://linkedin.com/suffixed",
            }},
            headers=headers,
        )

        with SessionLocal() as db:
            slug = db.get(Tenant, tenant_id).slug

        public = client.get(f"/api/v1/tenants/public/{slug}/")
        landing = public.json()["landing"]
        assert landing["facebook_url"] == "https://facebook.com/suffixed"
        assert landing["twitter_url"] == "https://twitter.com/suffixed"
        assert landing["linkedin_url"] == "https://linkedin.com/suffixed"

    def test_public_read_defaults_are_sane_when_never_set(self):
        tenant_id, _ = _make_tenant_with_admin()
        with SessionLocal() as db:
            slug = db.get(Tenant, tenant_id).slug

        public = client.get(f"/api/v1/tenants/public/{slug}/")
        assert public.status_code == 200, public.text
        landing = public.json()["landing"]

        assert landing.get("tagline") is None
        assert landing.get("school_motto") is None
        assert landing.get("founded_year") is None
        assert landing.get("show_gallery") is None
        assert landing.get("features") == []
