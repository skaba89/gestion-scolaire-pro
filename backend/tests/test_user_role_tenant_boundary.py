"""Tenant and privilege boundaries on /users/roles and /users/profiles.

Request-supplied tenant IDs must never select the scope of an operation.
"""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/users/roles/",
        "scheme": "http", "root_path": "", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12445),
        "server": ("testserver", 80),
    })


def _db():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    return db


@pytest.mark.parametrize("endpoint", [users.list_user_roles, users.list_user_profiles])
def test_read_scope_ignores_untrusted_query_tenant(endpoint):
    tenant = str(uuid4())
    attacker_supplied = str(uuid4())
    db = _db()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id", return_value=tenant,
    ) as resolver:
        response = endpoint(
            request=_request(), tenant_id=attacker_supplied,
            db=db, current_user={"tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    resolver.assert_called_once()
    assert response == []
    assert db.execute.call_args.args[1]["tid"] == tenant
    assert db.execute.call_args.args[1]["tid"] != attacker_supplied


def test_assign_role_validates_target_ownership_before_insert():
    tenant = str(uuid4())
    other_tenant = str(uuid4())
    target = str(uuid4())
    db = _db()
    body = users.AssignRoleDirectRequest(
        user_id=target, role="TEACHER", tenant_id=other_tenant,
    )
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id", return_value=tenant,
    ), patch.object(users, "_require_user_in_tenant") as ownership:
        response = users.assign_role_direct(
            body=body, request=_request(), db=db,
            current_user={"tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    ownership.assert_called_once_with(db, target, tenant)
    assert response["tenant_id"] == tenant
    params = db.execute.call_args.args[1]
    assert params["tenant_id"] == tenant
    assert params["user_id"] == target
    assert params["role"] == "TEACHER"
    db.commit.assert_called_once()


def test_assign_role_cross_tenant_target_fails_without_insertion():
    tenant, target = str(uuid4()), str(uuid4())
    db = _db()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id", return_value=tenant,
    ), patch.object(
        users, "_require_user_in_tenant",
        side_effect=HTTPException(status_code=404, detail="User not found"),
    ), pytest.raises(HTTPException) as exc:
        users.assign_role_direct(
            body=users.AssignRoleDirectRequest(user_id=target, role="TEACHER"),
            request=_request(), db=db,
            current_user={"tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 404
    db.execute.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.parametrize("role,expected_status", [
    ("SUPER_ADMIN", 403),
    ("TENANT_ADMIN", 403),
    ("UNKNOWN_ROLE_2026", 422),
])
def test_assign_role_rejects_privilege_escalation(role, expected_status):
    db = _db()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), pytest.raises(HTTPException) as exc:
        users.assign_role_direct(
            body=users.AssignRoleDirectRequest(user_id=str(uuid4()), role=role),
            request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == expected_status
    db.execute.assert_not_called()
    db.commit.assert_not_called()


def test_remove_role_checks_tenant_and_ownership():
    db = _db()
    tenant, target = str(uuid4()), str(uuid4())
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id", return_value=tenant,
    ), patch.object(users, "_require_user_in_tenant") as ownership:
        users.remove_role_direct(
            role_id=target + ":TEACHER", request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"], "tenant_id": tenant},
        )
    ownership.assert_called_once_with(db, target, tenant)
    params = db.execute.call_args.args[1]
    assert params == {"user_id": target, "role": "TEACHER", "tid": tenant}
    db.commit.assert_called_once()


def test_remove_role_cross_tenant_user_fails_closed():
    db = _db()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch.object(
        users, "_require_user_in_tenant",
        side_effect=HTTPException(status_code=404, detail="User not found"),
    ), pytest.raises(HTTPException) as exc:
        users.remove_role_direct(
            role_id=str(uuid4()) + ":TEACHER",
            request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 404
    db.execute.assert_not_called()
    db.commit.assert_not_called()


def test_non_super_admin_cannot_remove_privileged_role():
    db = _db()
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch.object(users, "_require_user_in_tenant"), pytest.raises(HTTPException) as exc:
        users.remove_role_direct(
            role_id=str(uuid4()) + ":TENANT_ADMIN",
            request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 403
    db.execute.assert_not_called()
    db.commit.assert_not_called()
