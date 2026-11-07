"""Profile PATCH must not bypass the toggle-status self-deactivation guard."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "PATCH", "path": "/users/example/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


@pytest.mark.parametrize("value", [False])
def test_generic_patch_cannot_deactivate_the_current_admin(value):
    admin_id, tenant = str(uuid4()), str(uuid4())
    db = MagicMock()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), pytest.raises(HTTPException) as exc:
        users.update_user(
            user_id=admin_id,
            body=users.UserUpdate(is_active=value),
            request=_request(),
            db=db,
            current_user={"id":admin_id, "tenant_id":tenant, "roles":["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 400
    db.execute.assert_not_called()
    db.commit.assert_not_called()


def test_generic_patch_can_update_own_profile_without_status_change():
    admin_id, tenant = str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.return_value.rowcount = 1
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), patch.object(users, "log_audit"):
        response = users.update_user(
            user_id=admin_id,
            body=users.UserUpdate(first_name="Aissatou"),
            request=_request(),
            db=db,
            current_user={"id":admin_id, "tenant_id":tenant, "roles":["TENANT_ADMIN"]},
        )
    assert response["message"] == "User updated successfully"
    db.commit.assert_called_once()


def test_generic_patch_can_deactivate_another_account():
    admin_id, target_id, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.return_value.rowcount = 1
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), patch.object(users, "log_audit"):
        response = users.update_user(
            user_id=target_id,
            body=users.UserUpdate(is_active=False),
            request=_request(),
            db=db,
            current_user={"id":admin_id, "tenant_id":tenant, "roles":["TENANT_ADMIN"]},
        )
    assert response["message"] == "User updated successfully"
    params = db.execute.call_args.args[1]
    assert params["tenant_id"] == tenant
    assert params["is_active"] is False
    db.commit.assert_called_once()
