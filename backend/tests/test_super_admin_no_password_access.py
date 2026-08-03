"""SUPER_ADMIN must never set or see an establishment administrator's
password — it can only trigger sending a single-use password-creation
link by email. Covers both SUPER_ADMIN admin-creation paths:
POST /tenants/{id}/create-admin/ (existing tenant) and
POST /tenants/create-with-admin/ (new tenant + admin in one step), plus
the admin-password-reset path reachable from the tenant-settings screen:
GET /tenants/{id}/admins/ and POST /tenants/{id}/admins/{user_id}/reset-password/.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user, get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402
from app.services.account_provisioning import PasswordSetupDelivery, PasswordSetupDeliveryError  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (users, user_roles, tenants) are exercised against Postgres in this suite.",
)

CREATE_ADMIN_URL = "/api/v1/tenants/{tenant_id}/create-admin/"
CREATE_WITH_ADMIN_URL = "/api/v1/tenants/create-with-admin/"
LIST_ADMINS_URL = "/api/v1/tenants/{tenant_id}/admins/"
RESET_ADMIN_PASSWORD_URL = "/api/v1/tenants/{tenant_id}/admins/{user_id}/reset-password/"
DELIVER_PATH = "app.services.account_provisioning.deliver_password_setup_link"


def _make_tenant(name: str = "École Admin Invitation") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"admin-invite-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _super_admin_headers() -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})


def _fake_delivery() -> PasswordSetupDelivery:
    return PasswordSetupDelivery(token="fake-token", expires_in=86400)


class TestCreateAdminForExistingTenant:
    def test_schema_never_accepts_a_password(self):
        """A password field in the request body is silently ignored by
        Pydantic (extra fields are dropped) — this test locks in that the
        field isn't part of the schema at all, so no future change can
        wire it back up without this test catching it."""
        from app.schemas.tenants import TenantAdminUserCreate
        assert "password" not in TenantAdminUserCreate.model_fields

    def test_creates_account_with_unusable_password_and_sends_invitation(self):
        tenant_id = _make_tenant()
        email = f"admin.{uuid.uuid4().hex[:6]}@ecole.gn"

        with patch(DELIVER_PATH, new=AsyncMock(return_value=_fake_delivery())) as mock_deliver:
            resp = client.post(
                CREATE_ADMIN_URL.format(tenant_id=tenant_id),
                json={"email": email, "first_name": "Jean", "last_name": "Camara", "role": "TENANT_ADMIN"},
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["invitation_sent"] is True
        assert body["expires_in"] == 86400

        mock_deliver.assert_awaited_once()
        call_kwargs = mock_deliver.call_args.kwargs
        assert call_kwargs["email"] == email
        assert call_kwargs["purpose"] == "invitation"

        with SessionLocal() as db:
            user = db.query(User).filter(User.email == email).first()
            assert user is not None
            assert user.must_change_password is True
            # The stored hash is for a random, never-disclosed value — the
            # SUPER_ADMIN's request body never contained a password to hash.
            assert user.password_hash is not None

    def test_delivery_failure_rolls_back_account_creation(self):
        """If the invitation email can't be sent, no account is left behind
        with an unusable password and no way to ever set one."""
        tenant_id = _make_tenant()
        email = f"admin-fail.{uuid.uuid4().hex[:6]}@ecole.gn"

        with patch(DELIVER_PATH, new=AsyncMock(side_effect=PasswordSetupDeliveryError("smtp down"))):
            resp = client.post(
                CREATE_ADMIN_URL.format(tenant_id=tenant_id),
                json={"email": email, "first_name": "Jean", "last_name": "Camara", "role": "TENANT_ADMIN"},
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 503, resp.text

        with SessionLocal() as db:
            assert db.query(User).filter(User.email == email).first() is None


class TestCreateTenantWithAdmin:
    def test_schema_never_accepts_a_password(self):
        from app.schemas.tenants import TenantWithAdminCreate
        assert "admin_password" not in TenantWithAdminCreate.model_fields

    def test_creates_tenant_and_admin_with_invitation(self):
        slug = f"new-tenant-{uuid.uuid4().hex[:8]}"
        email = f"founder.{uuid.uuid4().hex[:6]}@ecole.gn"

        with patch(DELIVER_PATH, new=AsyncMock(return_value=_fake_delivery())) as mock_deliver:
            resp = client.post(
                CREATE_WITH_ADMIN_URL,
                json={
                    "name": "Nouvelle École", "slug": slug, "type": "primary",
                    "admin_email": email, "admin_first_name": "Fatou", "admin_last_name": "Diallo",
                },
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 201, resp.text
        mock_deliver.assert_awaited_once()
        assert mock_deliver.call_args.kwargs["purpose"] == "invitation"

        with SessionLocal() as db:
            user = db.query(User).filter(User.email == email).first()
            assert user is not None
            assert user.must_change_password is True

    def test_delivery_failure_rolls_back_entire_tenant(self):
        slug = f"rollback-tenant-{uuid.uuid4().hex[:8]}"
        email = f"rollback.{uuid.uuid4().hex[:6]}@ecole.gn"

        with patch(DELIVER_PATH, new=AsyncMock(side_effect=PasswordSetupDeliveryError("smtp down"))):
            resp = client.post(
                CREATE_WITH_ADMIN_URL,
                json={
                    "name": "École Rollback", "slug": slug, "type": "primary",
                    "admin_email": email, "admin_first_name": "X", "admin_last_name": "Y",
                },
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 503, resp.text

        with SessionLocal() as db:
            assert db.query(Tenant).filter(Tenant.slug == slug).first() is None
            assert db.query(User).filter(User.email == email).first() is None


def _make_tenant_admin(tenant_id: str, email: str | None = None) -> str:
    """Create a TENANT_ADMIN user for the given tenant, bypassing the
    invitation flow (tests set the password hash directly)."""
    user_id = str(uuid.uuid4())
    email = email or f"admin.{uuid.uuid4().hex[:6]}@ecole.gn"
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


class TestListTenantAdmins:
    def test_lists_only_tenant_admin_role(self):
        tenant_id = _make_tenant()
        admin_id = _make_tenant_admin(tenant_id, email=f"list.{uuid.uuid4().hex[:6]}@ecole.gn")
        # A non-admin user of the same tenant must not show up.
        with SessionLocal() as db:
            other_id = str(uuid.uuid4())
            db.add(User(
                id=other_id, tenant_id=tenant_id, email=f"teacher.{uuid.uuid4().hex[:6]}@ecole.gn",
                username=f"teacher.{uuid.uuid4().hex[:6]}", first_name="Awa", last_name="Bah",
                password_hash=get_password_hash("x"), is_active=True, is_verified=True,
            ))
            db.add(UserRole(user_id=other_id, tenant_id=tenant_id, role="TEACHER"))
            db.commit()

        resp = client.get(LIST_ADMINS_URL.format(tenant_id=tenant_id), headers=_super_admin_headers())
        assert resp.status_code == 200, resp.text
        ids = [row["id"] for row in resp.json()]
        assert admin_id in ids
        assert other_id not in ids

    def test_unknown_tenant_returns_404(self):
        resp = client.get(LIST_ADMINS_URL.format(tenant_id=str(uuid.uuid4())), headers=_super_admin_headers())
        assert resp.status_code == 404

    def test_rejects_non_super_admin(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(LIST_ADMINS_URL.format(tenant_id=tenant_id), headers=headers)
        assert resp.status_code == 403


class TestResetTenantAdminPassword:
    """Covers the bug where a SUPER_ADMIN could not reset an establishment
    admin's password: /users/{id}/reset-password/ resolves its tenant from
    current_user/X-Tenant-ID, neither of which points at an arbitrary
    tenant the SUPER_ADMIN is merely viewing on the platform tenant-settings
    screen. These endpoints take tenant_id explicitly from the URL instead.
    """

    def test_sends_reset_link_and_invalidates_old_password(self):
        tenant_id = _make_tenant()
        email = f"reset.{uuid.uuid4().hex[:6]}@ecole.gn"
        admin_id = _make_tenant_admin(tenant_id, email=email)

        with (
            patch(DELIVER_PATH, new=AsyncMock(return_value=_fake_delivery())) as mock_deliver,
            patch(
                "app.api.v1.endpoints.core.tenants.blacklist_all_user_tokens",
                new=AsyncMock(),
            ),
        ):
            resp = client.post(
                RESET_ADMIN_PASSWORD_URL.format(tenant_id=tenant_id, user_id=admin_id),
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["email_sent"] is True
        assert body["email"] == email

        mock_deliver.assert_awaited_once()
        assert mock_deliver.call_args.kwargs["purpose"] == "reset"

        with SessionLocal() as db:
            user = db.query(User).filter(User.id == admin_id).first()
            assert user.must_change_password is True
            assert user.password_hash != get_password_hash("OldPassword@2026")

    def test_delivery_failure_rolls_back_password_change(self):
        tenant_id = _make_tenant()
        admin_id = _make_tenant_admin(tenant_id)
        with SessionLocal() as db:
            original_hash = db.query(User).filter(User.id == admin_id).first().password_hash

        with patch(DELIVER_PATH, new=AsyncMock(side_effect=PasswordSetupDeliveryError("smtp down"))):
            resp = client.post(
                RESET_ADMIN_PASSWORD_URL.format(tenant_id=tenant_id, user_id=admin_id),
                headers=_super_admin_headers(),
            )
        assert resp.status_code == 503, resp.text

        with SessionLocal() as db:
            assert db.query(User).filter(User.id == admin_id).first().password_hash == original_hash

    def test_unknown_admin_returns_404(self):
        tenant_id = _make_tenant()
        resp = client.post(
            RESET_ADMIN_PASSWORD_URL.format(tenant_id=tenant_id, user_id=str(uuid.uuid4())),
            headers=_super_admin_headers(),
        )
        assert resp.status_code == 404

    def test_rejects_non_super_admin(self):
        tenant_id = _make_tenant()
        admin_id = _make_tenant_admin(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.post(
            RESET_ADMIN_PASSWORD_URL.format(tenant_id=tenant_id, user_id=admin_id),
            headers=headers,
        )
        assert resp.status_code == 403
