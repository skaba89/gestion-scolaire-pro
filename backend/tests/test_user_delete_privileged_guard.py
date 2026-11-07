"""Deleting an account must respect privileged-role ownership."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "DELETE", "path": "/users/target/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


def _call(db, admin, target, tenant, roles):
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), patch.object(users, "log_audit"):
        return users.delete_user(
            user_id=target, request=_request(), db=db,
            current_user={"id": admin, "tenant_id": tenant, "roles": roles},
        )


def test_tenant_admin_cannot_delete_privileged_account():
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.return_value.fetchone.return_value = (1,)
    with pytest.raises(HTTPException) as exc:
        _call(db, admin, target, tenant, ["TENANT_ADMIN"])
    assert exc.value.status_code == 403
    assert db.execute.call_count == 1
    assert db.execute.call_args.args[1]["tenant_id"] == tenant
    assert db.commit.call_count == 0


def test_tenant_admin_can_delete_ordinary_account():
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(rowcount=1),
    ]
    assert _call(db, admin, target, tenant, ["TENANT_ADMIN"]) is None
    assert db.execute.call_count == 4
    assert db.execute.call_args.args[1] == {
        "user_id": target, "tenant_id": tenant,
    }
    db.commit.assert_called_once()


def test_super_admin_can_delete_tenant_account_without_role_probe():
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(rowcount=1),
    ]
    assert _call(db, admin, target, tenant, ["SUPER_ADMIN"]) is None
    assert db.execute.call_count == 3
    db.commit.assert_called_once()


def test_self_delete_is_rejected_before_any_database_change():
    admin, tenant = str(uuid4()), str(uuid4())
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        _call(db, admin, admin, tenant, ["TENANT_ADMIN"])
    assert exc.value.status_code == 400
    db.execute.assert_not_called()
    db.commit.assert_not_called()


def test_cross_tenant_target_cannot_be_deleted():
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(rowcount=0),
    ]
    with pytest.raises(HTTPException) as exc:
        _call(db, admin, target, tenant, ["TENANT_ADMIN"])
    assert exc.value.status_code == 404
    db.commit.assert_not_called()
