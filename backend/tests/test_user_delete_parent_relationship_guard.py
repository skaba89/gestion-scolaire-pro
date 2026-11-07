"""Parent-to-student links are not disposable when deleting a parent account."""
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


@pytest.mark.parametrize("actor_role", ["TENANT_ADMIN", "SUPER_ADMIN"])
def test_hard_delete_refused_for_linked_parent(actor_role):
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = (
        [MagicMock(fetchone=MagicMock(return_value=None))] if actor_role == "TENANT_ADMIN" else []
    ) + [
        MagicMock(fetchone=MagicMock(return_value=None)),  # student link
        MagicMock(fetchone=MagicMock(return_value=(1,))),  # parent link
    ]
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), pytest.raises(HTTPException) as exc:
        users.delete_user(
            user_id=target, request=_request(), db=db,
            current_user={"id": admin, "tenant_id": tenant, "roles": [actor_role]},
        )
    assert exc.value.status_code == 409
    assert "parent-student" in str(exc.value.detail)
    assert db.execute.call_args.args[1] == {"user_id": target, "tenant_id": tenant}
    assert "parent_students" in str(db.execute.call_args.args[0])
    db.commit.assert_not_called()


def test_unlinked_account_remains_deletable():
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=None)),  # privileged role
        MagicMock(fetchone=MagicMock(return_value=None)),  # student
        MagicMock(fetchone=MagicMock(return_value=None)),  # guardian
        MagicMock(rowcount=1),  # user DELETE
    ]
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), patch.object(users, "log_audit"):
        result = users.delete_user(
            user_id=target, request=_request(), db=db,
            current_user={"id": admin, "tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    assert result is None
    assert db.execute.call_count == 4
    db.commit.assert_called_once()
