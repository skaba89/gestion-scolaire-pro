"""GET /users/ — establishment user management must never surface the
platform SUPER_ADMIN account, for any viewer (including another
SUPER_ADMIN browsing a tenant's admin panel).

The WHERE clause already excludes SUPER_ADMIN structurally (its
tenant_id is always NULL, so `u.tenant_id = :tenant_id` never matches
for a real tenant), but an explicit NOT EXISTS guard was added as
defense-in-depth — this test locks that invariant in directly rather
than relying on the tenant_id coincidence, by inserting a User row that
deliberately violates that invariant (tenant_id set + SUPER_ADMIN role)
to prove the guard, not just the coincidence, is what excludes it.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (users, user_roles) are exercised against Postgres in this suite.",
)

USERS_URL = "/api/v1/users/"


def _make_tenant(name: str = "École Users List") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"users-list-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, *, role: str, email: str | None = None) -> str:
    user_id = str(uuid.uuid4())
    email = email or f"user-{uuid.uuid4().hex[:8]}@ecole.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Test", last_name=role.title(), is_active=True,
        ))
        db.add(UserRole(user_id=user_id, tenant_id=tenant_id, role=role))
        db.commit()
    return user_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


class TestListUsersExcludesSuperAdmin:
    def test_normal_tenant_users_are_listed(self):
        tenant_id = _make_tenant()
        _make_user(tenant_id, role="TEACHER", email=f"teacher.{uuid.uuid4().hex[:6]}@ecole.gn")

        resp = client.get(USERS_URL, headers=_admin_headers(tenant_id))
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 1

    def test_super_admin_with_real_tenant_id_is_still_excluded(self):
        """Defensive scenario: even if a SUPER_ADMIN row were ever
        associated with a real tenant_id (a data anomaly the model
        shouldn't produce, but the guard must not depend on that), it
        must still never appear in that tenant's user list."""
        tenant_id = _make_tenant()
        _make_user(tenant_id, role="TEACHER", email=f"real.{uuid.uuid4().hex[:6]}@ecole.gn")
        rogue_super_admin_id = _make_user(tenant_id, role="SUPER_ADMIN", email=f"rogue-sa.{uuid.uuid4().hex[:6]}@ecole.gn")

        resp = client.get(USERS_URL, headers=_admin_headers(tenant_id))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1  # only the TEACHER, never the rogue SUPER_ADMIN
        returned_ids = {u["id"] for u in body["items"]}
        assert rogue_super_admin_id not in returned_ids
