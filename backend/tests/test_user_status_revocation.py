"""Account-status changes must invalidate tokens through the dedicated API."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "PATCH",
        "path": "/users/example/toggle-status/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


@pytest.mark.asyncio
async def test_dedicated_status_endpoint_revokes_tokens_on_deactivation():
    tenant, admin_id, target_id = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.return_value.rowcount = 1
    revoke = AsyncMock(return_value=1)
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), patch.object(users, "log_audit"), patch(
        "app.api.v1.endpoints.core.auth.blacklist_all_user_tokens", revoke,
    ):
        response = await users.toggle_user_status(
            user_id=target_id,
            body=users.ToggleStatusRequest(is_active=False),
            request=_request(), db=db,
            current_user={"id": admin_id, "tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    assert "deactivated" in response["message"]
    db.commit.assert_called_once()
    revoke.assert_awaited_once_with(target_id)


@pytest.mark.asyncio
async def test_dedicated_activation_does_not_revoke_sessions():
    tenant, admin_id, target_id = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.return_value.rowcount = 1
    revoke = AsyncMock(return_value=1)
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), patch.object(users, "log_audit"), patch(
        "app.api.v1.endpoints.core.auth.blacklist_all_user_tokens", revoke,
    ):
        response = await users.toggle_user_status(
            user_id=target_id,
            body=users.ToggleStatusRequest(is_active=True),
            request=_request(), db=db,
            current_user={"id": admin_id, "tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    assert "activated" in response["message"]
    db.commit.assert_called_once()
    revoke.assert_not_awaited()
