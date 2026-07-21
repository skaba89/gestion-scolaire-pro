"""Regression tests: saas_enterprise.py must stay wired into the API router.

The module existed as unreachable code for a while — written, reviewed-looking,
but never passed to api_router.include_router() in router.py. Every route it
defines 404'd even with a valid token. These tests exercise the routes
end-to-end so a future refactor of router.py can't silently drop them again.
"""
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id,
            name=name,
            slug=f"saas-ent-{tenant_id[:8]}",
            type="SCHOOL",
            country="GN",
            is_active=True,
            settings={},
        ))
        db.commit()
    return tenant_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def test_domains_endpoint_is_actually_routed():
    tenant_id = _make_tenant("Ecole SaaS Enterprise")
    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}

    try:
        resp = _as(admin).get("/api/v1/platform/domains/me/", headers=HEADERS)
        # A 404 here would mean the router got unmounted again.
        assert resp.status_code == 200, resp.text
        assert resp.json() == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_create_and_list_custom_domain():
    tenant_id = _make_tenant("Ecole SaaS Enterprise 2")
    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}

    try:
        create_resp = _as(admin).post(
            "/api/v1/platform/domains/me/",
            json={"domain": "portal.example-school.com", "domain_type": "custom", "is_primary": True},
            headers=HEADERS,
        )
        assert create_resp.status_code == 201, create_resp.text
        body = create_resp.json()
        assert body["domain"] == "portal.example-school.com"
        assert body["verification_token"].startswith("schoolflow-verify-")

        list_resp = _as(admin).get("/api/v1/platform/domains/me/", headers=HEADERS)
        assert list_resp.status_code == 200, list_resp.text
        domains = list_resp.json()
        assert len(domains) == 1
        assert domains[0]["domain"] == "portal.example-school.com"
        assert domains[0]["is_verified"] is False
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_plans_endpoint_is_routed():
    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": _make_tenant("Ecole SaaS Enterprise 3")}
    try:
        resp = _as(admin).get("/api/v1/platform/plans/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
