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

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

OVERVIEW_URL = "/api/v1/ministry/overview/"


def _make_tenant(name: str, *, region: str | None, ttype: str = "primary", active: bool = True) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id,
            name=name,
            slug=f"ministry-{tenant_id[:8]}",
            type=ttype,
            country="GN",
            region=region,
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


def teardown_function():
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
            "inactive_establishments", "by_region", "by_type",
        }
        assert set(resp.json().keys()) == expected_keys


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
