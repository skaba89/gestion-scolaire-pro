"""log_audit() only db.flush()es — see app/utils/audit.py. Every caller
must db.commit() afterward or the row is silently lost when the request's
session closes. Several routes in tenants.py (and a couple elsewhere) were
found committing the *business* change and then calling log_audit() with
no commit afterward, or calling log_audit() before an already-happened
commit — either way the audit row never reached the database. Fixed by
moving log_audit() before the transaction's commit (or adding a second
commit when the business commit was already deliberate, e.g. so it lands
even if a later step like Redis session revocation raises).

These tests exercise the real HTTP routes and then check for the audit
row using a *fresh* SessionLocal() — this is deliberate: querying through
the same session/request wouldn't prove anything was actually committed,
since flush() alone is already visible within that same session.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (tenants, users, user_roles, audit_logs) are exercised against Postgres in this suite.",
)


def _make_tenant(name: str = "École Audit Persistence") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"audit-persist-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_tenant_admin(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    email = f"admin.{uuid.uuid4().hex[:6]}@ecole.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Fatou", last_name="Diallo",
            password_hash=get_password_hash("OldPassword@2026"),
            is_active=True, is_verified=True,
        ))
        db.add(UserRole(user_id=user_id, tenant_id=tenant_id, role="TENANT_ADMIN"))
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


def _super_admin_headers() -> dict:
    user_id = str(uuid.uuid4())
    # create_tenant() (tenants.py) creates a User row for the caller if one
    # doesn't exist yet, using current_user's email/username — a mock
    # current_user without an email hits users.email's NOT NULL constraint
    # on Postgres (SQLite is more lenient, which is why this only surfaced
    # once these tests actually ran against Postgres).
    return _as({
        "id": user_id, "roles": ["SUPER_ADMIN"], "tenant_id": None,
        "email": f"super.{user_id[:8]}@schoolflow.local",
    })


def _tenant_admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


def _assert_audit_row_persisted(*, tenant_id: str, action: str) -> None:
    """Query through a brand-new session — proves a real commit happened,
    not just a flush visible within the request's own (still-open) session."""
    with SessionLocal() as fresh_db:
        row = (
            fresh_db.query(AuditLog)
            .filter(AuditLog.tenant_id == tenant_id, AuditLog.action == action)
            .order_by(AuditLog.created_at.desc())
            .first()
        )
    assert row is not None, f"No persisted AuditLog row found for action={action!r} tenant_id={tenant_id}"


class TestCreateTenantAuditPersisted:
    def test_create_tenant_audit_persisted(self):
        slug = f"new-audit-tenant-{uuid.uuid4().hex[:8]}"
        resp = client.post(
            "/api/v1/tenants/",
            json={"name": "Nouvelle École Audit", "slug": slug, "type": "primary"},
            headers=_super_admin_headers(),
        )
        assert resp.status_code == 201, resp.text
        tenant_id = resp.json()["id"]
        _assert_audit_row_persisted(tenant_id=tenant_id, action="CREATE_TENANT")


class TestUpdateTenantSettingsAuditPersisted:
    def test_update_tenant_settings_audit_persisted(self):
        tenant_id = _make_tenant()
        resp = client.patch(
            "/api/v1/tenants/settings/",
            json={"tagline": "Excellence et rigueur"},
            headers=_tenant_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        _assert_audit_row_persisted(tenant_id=tenant_id, action="UPDATE_SETTINGS")


class TestUpdateSecuritySettingsAuditPersisted:
    def test_update_security_settings_audit_persisted(self):
        tenant_id = _make_tenant()
        resp = client.patch(
            "/api/v1/tenants/security-settings/",
            json={"require_mfa_for_admins": True},
            headers=_tenant_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        _assert_audit_row_persisted(tenant_id=tenant_id, action="UPDATE_SECURITY_SETTINGS")


class TestCreateTenantAdminAuditPersisted:
    def test_create_tenant_admin_audit_persisted(self):
        from unittest.mock import AsyncMock, patch
        from app.services.account_provisioning import PasswordSetupDelivery

        tenant_id = _make_tenant()
        email = f"newadmin.{uuid.uuid4().hex[:6]}@ecole.gn"

        with patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=AsyncMock(return_value=PasswordSetupDelivery(token="fake-token", expires_in=86400)),
        ):
            resp = client.post(
                f"/api/v1/tenants/{tenant_id}/create-admin/",
                json={"email": email, "first_name": "Jean", "last_name": "Camara", "role": "TENANT_ADMIN"},
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 201, resp.text
        _assert_audit_row_persisted(tenant_id=tenant_id, action="CREATE_TENANT_ADMIN")


class TestResetTenantAdminPasswordAuditPersisted:
    def test_reset_tenant_admin_password_audit_persisted(self):
        from unittest.mock import AsyncMock, patch
        from app.services.account_provisioning import PasswordSetupDelivery

        tenant_id = _make_tenant()
        admin_id = _make_tenant_admin(tenant_id)

        with (
            patch(
                "app.services.account_provisioning.deliver_password_setup_link",
                new=AsyncMock(return_value=PasswordSetupDelivery(token="fake-token", expires_in=900)),
            ),
            # tenants.py imports this INSIDE the function body (deferred
            # import, to avoid a circular import with auth.py) — it's
            # never a module-level attribute of tenants.py to patch, only
            # of auth.py where it's actually defined.
            patch("app.api.v1.endpoints.core.auth.blacklist_all_user_tokens", new=AsyncMock()),
        ):
            resp = client.post(
                f"/api/v1/tenants/{tenant_id}/admins/{admin_id}/reset-password/",
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 200, resp.text
        _assert_audit_row_persisted(tenant_id=tenant_id, action="RESET_PASSWORD")
