"""User-detail role serialization must preserve role names on both DB engines."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/users/123/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12445),
        "server": ("testserver", 80),
    })


@pytest.mark.parametrize(
    ("is_sqlite", "stored_roles", "expected"),
    [
        (True, "TENANT_ADMIN,TEACHER", ["TENANT_ADMIN", "TEACHER"]),
        (True, "", []),
        (False, ["TENANT_ADMIN", "TEACHER"], ["TENANT_ADMIN", "TEACHER"]),
        (False, [], []),
    ],
)
def test_get_user_preserves_complete_role_names(is_sqlite, stored_roles, expected):
    db = MagicMock()
    db.execute.return_value.fetchone.return_value = SimpleNamespace(
        id=str(uuid4()), email="teacher@example.gn", first_name="A",
        last_name="B", is_active=True, avatar_url=None,
        created_at=None, roles=stored_roles,
    )
    tenant_id = str(uuid4())
    with patch.object(users, "settings", SimpleNamespace(is_sqlite=is_sqlite)), patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant_id,
    ):
        response = users.get_user(
            user_id=str(uuid4()), request=_request(), db=db,
            current_user={"tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]},
        )
    assert response["roles"] == expected
    assert db.execute.call_args.args[1]["tenant_id"] == tenant_id


def test_get_user_cross_tenant_target_still_returns_404():
    db = MagicMock()
    db.execute.return_value.fetchone.return_value = None
    with patch.object(users, "settings", SimpleNamespace(is_sqlite=True)), patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), pytest.raises(HTTPException) as err:
        users.get_user(
            user_id=str(uuid4()), request=_request(), db=db,
            current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert err.value.status_code == 404
