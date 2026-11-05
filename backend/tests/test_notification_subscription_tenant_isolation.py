"""Regular notification subscription endpoints must honor tenant and device scope."""
import inspect
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.params import Query

from app.api.v1.endpoints.core.notifications import (
    create_subscription, delete_subscription, read_subscriptions,
)
from app.models.push_subscription import PushSubscription
from app.schemas.push_subscription import PushSubscriptionCreate


@pytest.fixture
def identities():
    return str(uuid4()), str(uuid4())


def _tenant(tenant):
    return patch(
        "app.api.v1.endpoints.core.notifications.resolve_current_tenant_id",
        return_value=tenant,
    )


def _criteria(db):
    return " ".join(str(expr) for expr in db.query.return_value.filter.call_args.args)


def _subscription():
    return PushSubscriptionCreate(
        endpoint="device-a", auth="fcm", p256dh="device-a", platform="android",
    )


def test_list_only_returns_current_tenant_devices(identities):
    tenant_id, user_id = identities
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    with _tenant(tenant_id):
        assert read_subscriptions(request=MagicMock(), db=db, current_user={"id": user_id}) == []
    assert "push_subscriptions.user_id" in _criteria(db)
    assert "push_subscriptions.tenant_id" in _criteria(db)


def test_create_looks_up_device_by_user_tenant_and_endpoint(identities):
    tenant_id, user_id = identities
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with _tenant(tenant_id):
        result = create_subscription(
            request=MagicMock(), subscription_in=_subscription(),
            db=db, current_user={"id": user_id},
        )
    assert isinstance(result, PushSubscription)
    assert str(result.tenant_id) == tenant_id
    assert str(result.user_id) == user_id
    assert "push_subscriptions.tenant_id" in _criteria(db)
    assert "push_subscriptions.user_id" in _criteria(db)
    assert "push_subscriptions.endpoint" in _criteria(db)
    db.add.assert_called_once_with(result)
    db.commit.assert_called_once()


def test_existing_device_is_updated_only_inside_tenant(identities):
    tenant_id, user_id = identities
    db = MagicMock()
    existing = PushSubscription(
        user_id=uuid4(), tenant_id=uuid4(), endpoint="device-a",
        auth="old", p256dh="old", platform="web",
    )
    db.query.return_value.filter.return_value.first.return_value = existing
    with _tenant(tenant_id):
        assert create_subscription(
            request=MagicMock(), subscription_in=_subscription(),
            db=db, current_user={"id": user_id},
        ) is existing
    assert (existing.auth, existing.p256dh, existing.platform) == ("fcm", "device-a", "android")
    assert "push_subscriptions.tenant_id" in _criteria(db)
    db.add.assert_not_called()


def test_delete_is_scoped_to_user_tenant_and_device(identities):
    tenant_id, user_id = identities
    db = MagicMock()
    with _tenant(tenant_id):
        delete_subscription(
            request=MagicMock(), endpoint="device-a", db=db, current_user={"id": user_id},
        )
    for column in ("user_id", "tenant_id", "endpoint"):
        assert f"push_subscriptions.{column}" in _criteria(db)
    db.query.return_value.filter.return_value.delete.assert_called_once()
    db.commit.assert_called_once()


def test_delete_endpoint_is_required():
    param = inspect.signature(delete_subscription).parameters["endpoint"].default
    assert isinstance(param, Query)
    assert param.is_required()


@pytest.mark.parametrize("endpoint", ["", "  "])
def test_blank_endpoint_cannot_delete_all_devices(endpoint):
    db = MagicMock()
    with pytest.raises(HTTPException) as err:
        delete_subscription(
            request=MagicMock(), endpoint=endpoint, db=db,
            current_user={"id": str(uuid4())},
        )
    assert err.value.status_code == 422
    db.query.assert_not_called()
    db.commit.assert_not_called()
