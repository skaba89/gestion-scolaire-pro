"""Regression: removing privileged roles requires platform authorization.

Covers both the single-role DELETE and replace-all PUT routes; the alternative
POST/DELETE /users/roles endpoints have separate checks.
"""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "PUT", "path": "/users/roles/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


@pytest.mark.parametrize("role", ["SUPER_ADMIN", "TENANT_ADMIN"])
def test_tenant_admin_cannot_delete_privileged_role(role):
    db = MagicMock()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), pytest.raises(HTTPException) as exc:
        users.remove_role(
            user_id=str(uuid4()), role=role, request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 403
    db.execute.assert_not_called()
    db.commit.assert_not_called()


def test_tenant_admin_can_delete_regular_role():
    db = MagicMock()
    db.execute.return_value.rowcount = 1
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch.object(users, "log_audit"):
        result = users.remove_role(
            user_id=str(uuid4()), role="TEACHER", request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert result["role"] == "TEACHER"
    db.commit.assert_called_once()


def test_replacement_cannot_strip_existing_privileged_role():
    db = MagicMock()
    # First execute: target-user SELECT, second: privileged-role SELECT.
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=(str(uuid4()),))),
        MagicMock(fetchall=MagicMock(return_value=[("TENANT_ADMIN",)])),
    ]
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), pytest.raises(HTTPException) as exc:
        users.update_user_roles(
            user_id=str(uuid4()),
            body=users.RoleUpdateRequest(roles=["TEACHER"]),
            request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 403
    assert db.execute.call_count == 2
    db.commit.assert_not_called()


def test_replacement_of_regular_roles_remains_available():
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=(str(uuid4()),))),
        MagicMock(fetchall=MagicMock(return_value=[])),
        MagicMock(), MagicMock(),
    ]
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch.object(users, "log_audit"):
        result = users.update_user_roles(
            user_id=str(uuid4()),
            body=users.RoleUpdateRequest(roles=["TEACHER"]),
            request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert result["roles"] == ["TEACHER"]
    assert db.execute.call_count == 4
    db.commit.assert_called_once()


def test_super_admin_can_replace_privileged_roles():
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=(str(uuid4()),))),
        MagicMock(), MagicMock(),
    ]
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch.object(users, "log_audit"):
        result = users.update_user_roles(
            user_id=str(uuid4()),
            body=users.RoleUpdateRequest(roles=["TENANT_ADMIN"]),
            request=_request(), db=db,
            current_user={"roles": ["SUPER_ADMIN"]},
        )
    assert result["roles"] == ["TENANT_ADMIN"]
    db.commit.assert_called_once()
