"""Audit P0-2: the database is the single source of truth for a user's
roles. `get_current_user` used to union the token's own `roles` claim with
the DB roles, which let a role REVOKED in the DB keep granting access until
the token expired. These tests pin the fixed behaviour:

  * a role present in the token but NOT in the DB is dropped (revocation is
    effective on the very next request),
  * a role present in the DB but absent from the token is still granted
    (adding a role stays instant),

exercising the REAL `get_current_user` against the test database. No Redis
is required: the token carries no `jti` (blacklist check skipped) and
`tv=0` (token-version check is a no-op / fails open to 0).
"""
import uuid
from unittest.mock import MagicMock

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.security import get_current_user  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Roles SoT", slug=f"roles-sot-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, db_roles: list[str]) -> str:
    user_id = str(uuid.uuid4())
    email = f"user.{uuid.uuid4().hex[:6]}@ecole.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Mariama", last_name="Baldé",
            password_hash=get_password_hash("Password@2026"),
            is_active=True, is_verified=True,
        ))
        for role in db_roles:
            db.add(UserRole(user_id=user_id, tenant_id=tenant_id, role=role))
        db.commit()
    return user_id


def _request() -> MagicMock:
    request = MagicMock()
    request.headers.get.return_value = None
    return request


@pytest.mark.asyncio
async def test_role_revoked_in_db_is_not_granted_via_stale_token():
    tenant_id = _make_tenant()
    user_id = _make_user(tenant_id, ["TEACHER"])  # DB: TEACHER only
    # The token still carries a since-revoked TENANT_ADMIN alongside TEACHER.
    token = {"sub": user_id, "tenant_id": tenant_id,
             "roles": ["TENANT_ADMIN", "TEACHER"], "tv": 0}

    result = await get_current_user(request=_request(), token=token)

    assert set(result["roles"]) == {"TEACHER"}
    assert "TENANT_ADMIN" not in result["roles"]  # revocation is effective


@pytest.mark.asyncio
async def test_role_added_in_db_is_granted_even_if_absent_from_token():
    tenant_id = _make_tenant()
    user_id = _make_user(tenant_id, ["TEACHER", "DIRECTOR"])  # DB: two roles
    # The token was issued before DIRECTOR was granted (carries only TEACHER).
    token = {"sub": user_id, "tenant_id": tenant_id, "roles": ["TEACHER"], "tv": 0}

    result = await get_current_user(request=_request(), token=token)

    assert set(result["roles"]) == {"TEACHER", "DIRECTOR"}


@pytest.mark.asyncio
async def test_user_with_no_db_roles_gets_no_roles_even_if_token_claims_some():
    tenant_id = _make_tenant()
    user_id = _make_user(tenant_id, [])  # DB: no roles at all
    token = {"sub": user_id, "tenant_id": tenant_id,
             "roles": ["SUPER_ADMIN"], "tv": 0}  # forged/stale elevated claim

    result = await get_current_user(request=_request(), token=token)

    assert result["roles"] == []  # token claim alone grants nothing
