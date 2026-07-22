"""SUPER_ADMIN manual subscription plan change (PATCH /platform/tenants/{id}/subscription/).

The requirement: super admin can change a tenant's plan, but "free" must
never be an accepted value — only starter/pro/enterprise exist.
"""
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id,
            name="Ecole Subscription Test",
            slug=f"sub-test-{tenant_id[:8]}",
            type="SCHOOL",
            country="GN",
            is_active=True,
            subscription_plan="starter",
            settings={},
        ))
        db.commit()
    return tenant_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def test_super_admin_can_change_plan():
    tenant_id = _make_tenant()
    try:
        resp = _as(SUPER_ADMIN).patch(
            f"/api/v1/platform/tenants/{tenant_id}/subscription/",
            json={"plan": "enterprise"},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["subscription_plan"] == "enterprise"
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert tenant.subscription_plan == "enterprise"


def test_free_plan_is_always_rejected():
    tenant_id = _make_tenant()
    try:
        resp = _as(SUPER_ADMIN).patch(
            f"/api/v1/platform/tenants/{tenant_id}/subscription/",
            json={"plan": "free"},
            headers=HEADERS,
        )
        assert resp.status_code == 422, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert tenant.subscription_plan == "starter"  # unchanged


def test_non_super_admin_cannot_change_plan():
    tenant_id = _make_tenant()
    tenant_admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    try:
        resp = _as(tenant_admin).patch(
            f"/api/v1/platform/tenants/{tenant_id}/subscription/",
            json={"plan": "enterprise"},
            headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
