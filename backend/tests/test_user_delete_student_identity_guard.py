"""Hard delete must preserve academic records linked to student accounts."""
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
def test_linked_student_prevents_hard_delete_even_for_platform_admin(actor_role):
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    linked = MagicMock(fetchone=MagicMock(return_value=(1,)))
    if actor_role == "TENANT_ADMIN":
        db.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value=None)),
            linked,
        ]
    else:
        db.execute.side_effect = [linked]

    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), pytest.raises(HTTPException) as err:
        users.delete_user(
            user_id=target, request=_request(), db=db,
            current_user={"id": admin, "tenant_id": tenant, "roles": [actor_role]},
        )
    assert err.value.status_code == 409
    assert "deactivate" in err.value.detail
    assert db.execute.call_args.args[1] == {
        "user_id": target, "tenant_id": tenant,
    }
    db.commit.assert_not_called()


def test_unlinked_student_guard_only_scopes_to_authorized_tenant():
    admin, target, tenant = str(uuid4()), str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(fetchone=MagicMock(return_value=None)),
        MagicMock(rowcount=0),
    ]
    with patch(
        "app.core.tenant_resolution.resolve_current_tenant_id",
        return_value=tenant,
    ), pytest.raises(HTTPException) as err:
        users.delete_user(
            user_id=target, request=_request(), db=db,
            current_user={"id": admin, "tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
    assert err.value.status_code == 404
    assert db.execute.call_count == 4
    assert "tenant_id = :tenant_id" in str(db.execute.call_args_list[1].args[0])
    db.commit.assert_not_called()


@pytest.fixture(autouse=True)
def _catalog_covered_by_integration_tests(monkeypatch):
    monkeypatch.setattr("app.crud.academic._is_referenced", lambda *args, **kwargs: False)
