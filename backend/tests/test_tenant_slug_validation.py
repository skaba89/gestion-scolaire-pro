"""Validation du slug de tenant — incident production (2026-08-25),
signalé par un utilisateur via capture d'écran : un établissement créé
avec un slug contenant une URL complète (collée par erreur dans le champ,
côté frontend comme backend il n'existait aucune validation de format)
devient définitivement inaccessible via /:slug ("Établissement
introuvable"), et jusqu'à ce correctif rien ne permettait même de le
réparer après coup (slug absent de TenantUpdate/ALLOWED_FIELDS_ADMIN
côté validation, même si techniquement listé dans ALLOWED_FIELDS_SUPER).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.schemas.tenants import validate_tenant_slug  # noqa: E402

BASE = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def _clear_overrides():
    # get_current_user is overridden via a global mutable dict — without
    # this, an override set by the last test in this file leaks into
    # whichever test file collects next (alphabetically, test_tenants.py),
    # turning its "requires auth" 401 assertions into 403s. Established
    # pattern, see tests/test_grades_idempotency.py.
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant(slug: str = None) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Slug Test", slug=slug or f"slug-test-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestValidateTenantSlugFunction:
    """Le validateur lui-même (partagé par la création et la mise à jour)."""

    def test_accepts_a_normal_slug(self):
        assert validate_tenant_slug("universite-la-source") == "universite-la-source"

    def test_lowercases_and_strips(self):
        assert validate_tenant_slug("  Universite-La-Source  ") == "universite-la-source"

    def test_rejects_a_full_url(self):
        # Le cas réel de l'incident : "https://www.udm.com" collé dans le
        # champ slug au lieu du champ "site web".
        for bad in ["https://www.udm.com", "http://udm.com", "www.udm.com"]:
            try:
                validate_tenant_slug(bad)
                assert False, f"{bad!r} aurait dû être rejeté"
            except ValueError:
                pass

    def test_rejects_spaces_and_special_characters(self):
        for bad in ["mon école", "école/annexe", "école_annexe", "école.gn", "école@gn"]:
            try:
                validate_tenant_slug(bad)
                assert False, f"{bad!r} aurait dû être rejeté"
            except ValueError:
                pass

    def test_rejects_empty_string(self):
        try:
            validate_tenant_slug("   ")
            assert False
        except ValueError:
            pass

    def test_rejects_too_long(self):
        try:
            validate_tenant_slug("a" * 64)
            assert False
        except ValueError:
            pass


class TestSlugValidationNeverAppliesToReads:
    """Régression réelle attrapée en écrivant ce correctif : le validateur
    avait d'abord été posé sur TenantBase, dont TenantResponse hérite
    aussi — FastAPI applique les validateurs Pydantic à la SÉRIALISATION
    de sortie autant qu'à l'entrée, donc un tenant déjà en base avec un
    slug legacy non conforme (avant ce correctif, ou une donnée
    corrompue quelconque) aurait fait planter n'importe quel endpoint le
    renvoyant avec un 500 (ResponseValidationError) au lieu de simplement
    l'afficher. Le validateur ne doit vivre QUE sur les schémas d'écriture
    (TenantCreate, TenantWithAdminCreate)."""

    def test_listing_tenants_survives_a_legacy_non_conforming_slug(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            t.slug = "Legacy_Slug.With.Dots"  # jamais accepté en écriture, mais déjà en base
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.get(f"{BASE}/?page_size=100", headers=headers)
        assert resp.status_code == 200, resp.text
        assert any(t["id"] == tenant_id for t in resp.json())


class TestCreateTenantRejectsBadSlug:
    def test_create_tenant_rejects_url_as_slug(self):
        headers = _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.post(f"{BASE}/", json={
            "name": "UdM", "slug": "https://www.udm.com", "type": "university",
        }, headers=headers)
        assert resp.status_code == 422, resp.text

    def test_create_tenant_accepts_valid_slug(self):
        headers = _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.post(f"{BASE}/", json={
            "name": "UdM", "slug": "udm", "type": "university",
        }, headers=headers)
        assert resp.status_code == 201, resp.text
        assert resp.json()["slug"] == "udm"


class TestUpdateTenantSlugRepairPath:
    """Le vrai chemin de réparation : un SUPER_ADMIN doit pouvoir corriger
    un slug déjà cassé — et ce chemin doit lui-même valider le format,
    puisqu'il contourne entièrement le schéma Pydantic (dict brut +
    setattr, voir update_tenant())."""

    def test_super_admin_can_repair_a_broken_slug(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            t.slug = "https://www.udm-repair-test.com"  # simule le slug déjà cassé en base
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.patch(f"{BASE}/{tenant_id}/", json={"slug": "udm-repare"}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["slug"] == "udm-repare"

    def test_update_endpoint_rejects_bad_slug_too(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.patch(f"{BASE}/{tenant_id}/", json={"slug": "https://evil.example"}, headers=headers)
        assert resp.status_code == 400, resp.text

    def test_update_rejects_slug_collision_with_another_tenant(self):
        _make_tenant(slug="deja-pris")
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.patch(f"{BASE}/{tenant_id}/", json={"slug": "deja-pris"}, headers=headers)
        assert resp.status_code == 409, resp.text

    def test_tenant_admin_cannot_change_slug(self):
        """slug reste hors de ALLOWED_FIELDS_ADMIN — seul un SUPER_ADMIN
        peut le modifier (changer l'URL canonique d'un établissement en
        production est une opération qui mérite la supervision de
        l'opérateur de la plateforme, pas un self-service)."""
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.patch(f"{BASE}/{tenant_id}/", json={"slug": "nouveau-slug"}, headers=headers)
        assert resp.status_code == 400, resp.text
