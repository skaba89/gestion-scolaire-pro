"""Ministry aggregate overview — national audit Phase 2.

MINISTRY_ADMIN is a new, deliberately narrow platform-level role: it must
see aggregate counts (how many establishments, by region/type) but must
NEVER be able to read an individual tenant's name, contact info, or any
tenant-scoped data (students, grades, payments...). These tests prove both
halves: the role CAN reach the aggregate endpoint, and the response shape
never leaks per-tenant detail; and roles without ministry:read (including
TENANT_ADMIN) are refused.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

OVERVIEW_URL = "/api/v1/ministry/overview/"


def _make_tenant(
    name: str, *, region: str | None, ttype: str = "primary", active: bool = True,
    prefecture: str | None = None, commune: str | None = None,
) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id,
            name=name,
            slug=f"ministry-{tenant_id[:8]}",
            type=ttype,
            country="GN",
            region=region,
            prefecture=prefecture,
            commune=commune,
            is_active=active,
            settings={},
        ))
        db.commit()
    return tenant_id


def _as(user: dict) -> dict:
    """Override get_current_user (bypasses DB/blacklist lookups) AND return
    a real bearer token header — TenantMiddleware enforces its own "needs a
    bearer token" check ahead of FastAPI's dependency injection for any
    route outside its public-path list, so a dependency override alone
    isn't enough (same requirement as test_operational_pagination.py).
    """
    from app.core.security import create_access_token

    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({
        "sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", []),
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    """A module-level teardown_function() only fires for bare test
    functions, NOT for methods inside a `class Test...:` block — it would
    silently leak get_current_user's override into every test file that
    runs afterward in the same pytest session (national audit finding).
    An autouse fixture tears down reliably in both cases."""
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestMinistryOverviewAccess:
    def test_ministry_admin_can_access_overview(self):
        resp = client.get(OVERVIEW_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["MINISTRY_ADMIN"], "tenant_id": None}))
        assert resp.status_code == 200, resp.text

    def test_super_admin_can_access_overview(self):
        """SUPER_ADMIN's wildcard "*" permission must also grant access —
        no institutional role should be MORE privileged than the platform
        super-admin."""
        resp = client.get(OVERVIEW_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}))
        assert resp.status_code == 200, resp.text

    def test_tenant_admin_cannot_access_overview(self):
        resp = client.get(OVERVIEW_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": str(uuid.uuid4())}))
        assert resp.status_code == 403, resp.text

    def test_teacher_cannot_access_overview(self):
        resp = client.get(OVERVIEW_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": str(uuid.uuid4())}))
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_request_rejected(self):
        app.dependency_overrides.pop(get_current_user, None)
        resp = client.get(OVERVIEW_URL)
        assert resp.status_code == 401, resp.text


class TestMinistryOverviewShape:
    def test_overview_counts_reflect_created_tenants(self):
        region = f"region-{uuid.uuid4().hex[:8]}"
        _make_tenant("École Ministry Test 1", region=region, ttype="primary", active=True)
        _make_tenant("École Ministry Test 2", region=region, ttype="high", active=False)

        resp = client.get(OVERVIEW_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["MINISTRY_ADMIN"], "tenant_id": None}))
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["by_region"].get(region) == 2
        assert data["total_establishments"] >= 2
        assert data["inactive_establishments"] >= 1

    def test_overview_never_leaks_individual_tenant_fields(self):
        """The response must only ever contain aggregate counts — no tenant
        name, slug, email, or any other per-establishment field."""
        unique_name = f"École Secrète {uuid.uuid4().hex[:8]}"
        _make_tenant(unique_name, region="test-region")

        resp = client.get(OVERVIEW_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["MINISTRY_ADMIN"], "tenant_id": None}))
        assert resp.status_code == 200, resp.text
        body_text = resp.text
        assert unique_name not in body_text

        expected_keys = {
            "total_establishments", "active_establishments",
            "inactive_establishments", "by_region", "by_prefecture",
            "by_commune", "by_type",
        }
        assert set(resp.json().keys()) == expected_keys


class TestRegionalDirectorScoping:
    """National audit Phase 7 — REGIONAL_DIRECTOR must only ever see its
    own region's aggregate, never the national picture MINISTRY_ADMIN sees."""

    def test_regional_director_only_sees_own_region(self):
        region_a = f"region-a-{uuid.uuid4().hex[:8]}"
        region_b = f"region-b-{uuid.uuid4().hex[:8]}"
        _make_tenant("École A1", region=region_a)
        _make_tenant("École A2", region=region_a)
        own_tenant_id = _make_tenant("École du Directeur Régional", region=region_a)
        _make_tenant("École B1", region=region_b)
        _make_tenant("École B2", region=region_b)
        _make_tenant("École B3", region=region_b)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["REGIONAL_DIRECTOR"], "tenant_id": own_tenant_id})
        resp = client.get(OVERVIEW_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert set(data["by_region"].keys()) == {region_a}
        assert data["by_region"][region_a] == 3
        assert data["total_establishments"] == 3

    def test_regional_director_export_is_also_region_scoped(self):
        region_a = f"region-export-a-{uuid.uuid4().hex[:8]}"
        region_b = f"region-export-b-{uuid.uuid4().hex[:8]}"
        own_tenant_id = _make_tenant("École Export Régionale", region=region_a)
        _make_tenant("École Autre Région", region=region_b)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["REGIONAL_DIRECTOR"], "tenant_id": own_tenant_id})
        resp = client.get(f"/api/v1/ministry/overview/export/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert region_b not in resp.text
        assert f"region,{region_a},1" in resp.text

    def test_super_admin_still_sees_national_view_regardless_of_role_mix(self):
        """A user with BOTH roles (e.g. impersonation edge case) must never
        be narrowed — platform-level access always wins."""
        region = f"region-mixed-{uuid.uuid4().hex[:8]}"
        tenant_id = _make_tenant("École Mixte", region=region)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["REGIONAL_DIRECTOR", "SUPER_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(OVERVIEW_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        # Not asserting an exact count (shared DB across tests) — only that
        # it is NOT narrowed to the single-tenant region-only view.
        assert resp.json()["total_establishments"] >= 1


class TestPrefectureAndCommuneScoping:
    """National audit Phase 5 (préfecture/commune roadmap) — PREFECTURE_ADMIN
    and COMMUNE_ADMIN follow the exact same narrowing pattern already proven
    for REGIONAL_DIRECTOR, one level narrower each."""

    def test_prefecture_admin_only_sees_own_prefecture(self):
        pref_a = f"pref-a-{uuid.uuid4().hex[:8]}"
        pref_b = f"pref-b-{uuid.uuid4().hex[:8]}"
        _make_tenant("École Préf A1", region="r", prefecture=pref_a)
        own_tenant_id = _make_tenant("École du Préfet", region="r", prefecture=pref_a)
        _make_tenant("École Préf B1", region="r", prefecture=pref_b)
        _make_tenant("École Préf B2", region="r", prefecture=pref_b)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["PREFECTURE_ADMIN"], "tenant_id": own_tenant_id})
        resp = client.get(OVERVIEW_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert set(data["by_prefecture"].keys()) == {pref_a}
        assert data["by_prefecture"][pref_a] == 2
        assert data["total_establishments"] == 2

    def test_commune_admin_only_sees_own_commune(self):
        commune_a = f"commune-a-{uuid.uuid4().hex[:8]}"
        commune_b = f"commune-b-{uuid.uuid4().hex[:8]}"
        own_tenant_id = _make_tenant("École de la Mairie", region="r", commune=commune_a)
        _make_tenant("École Autre Commune 1", region="r", commune=commune_b)
        _make_tenant("École Autre Commune 2", region="r", commune=commune_b)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["COMMUNE_ADMIN"], "tenant_id": own_tenant_id})
        resp = client.get(OVERVIEW_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert set(data["by_commune"].keys()) == {commune_a}
        assert data["by_commune"][commune_a] == 1
        assert data["total_establishments"] == 1

    def test_scoped_role_with_unset_field_sees_nothing_not_everything(self):
        """Absolute rule: a PREFECTURE_ADMIN whose own tenant has no
        prefecture set must see zero establishments, never fall back to
        the national view."""
        _make_tenant("École Avec Préfecture", region="r", prefecture=f"pref-{uuid.uuid4().hex[:8]}")
        own_tenant_id = _make_tenant("École Sans Préfecture", region="r", prefecture=None)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["PREFECTURE_ADMIN"], "tenant_id": own_tenant_id})
        resp = client.get(OVERVIEW_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total_establishments"] == 0

    def test_super_admin_beats_commune_admin_role_mix(self):
        commune = f"commune-mixed-{uuid.uuid4().hex[:8]}"
        tenant_id = _make_tenant("École Mixte Commune", region="r", commune=commune)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["COMMUNE_ADMIN", "SUPER_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(OVERVIEW_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["total_establishments"] >= 1


class TestMinistryOverviewExport:
    EXPORT_URL = "/api/v1/ministry/overview/export/"

    def test_export_requires_ministry_read(self):
        resp = client.get(self.EXPORT_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": str(uuid.uuid4())}))
        assert resp.status_code == 403, resp.text

    def test_export_returns_csv_with_expected_rows(self):
        region = f"region-{uuid.uuid4().hex[:8]}"
        _make_tenant("École Export Test", region=region, ttype="primary", active=True)

        resp = client.get(self.EXPORT_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["MINISTRY_ADMIN"], "tenant_id": None}))
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/csv")
        assert "attachment" in resp.headers.get("content-disposition", "")

        body = resp.text
        assert "categorie,cle,valeur" in body
        assert f"region,{region},1" in body

    def test_export_never_leaks_individual_tenant_fields(self):
        unique_name = f"École Export Secrète {uuid.uuid4().hex[:8]}"
        _make_tenant(unique_name, region="test-region-export")

        resp = client.get(self.EXPORT_URL, headers=_as({"id": str(uuid.uuid4()), "roles": ["MINISTRY_ADMIN"], "tenant_id": None}))
        assert resp.status_code == 200, resp.text
        assert unique_name not in resp.text
