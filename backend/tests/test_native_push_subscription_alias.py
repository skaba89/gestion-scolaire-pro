"""Regression coverage for the authenticated native push subscription alias.

The ORM has non-nullable auth/p256dh. Previously the alias ignored the
native client's credentials and attempted an INSERT without these columns.
"""
from unittest.mock import MagicMock, patch
import inspect
from fastapi import HTTPException
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints.aliases import (
    PushSubscriptionUpsert,
    upsert_push_subscription,
    delete_push_subscription,
)
from app.models.push_subscription import PushSubscription


def _call_upsert(db, *, user_id, tenant_id, endpoint="device-token", platform="android"):
    with patch("app.api.v1.endpoints.aliases.resolve_current_tenant_id", return_value=tenant_id):
        return upsert_push_subscription(
            request=MagicMock(),
            subscription_in=PushSubscriptionUpsert(
                endpoint=endpoint, auth="fcm", p256dh="device-token", platform=platform,
            ),
            db=db,
            current_user={"id": user_id},
        )


def test_native_upsert_populates_not_null_orm_columns():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    tenant_id, user_id = str(uuid4()), str(uuid4())
    created = _call_upsert(db, user_id=user_id, tenant_id=tenant_id)
    assert isinstance(created, PushSubscription)
    assert created.auth == "fcm"
    assert created.p256dh == "device-token"
    assert created.platform == "android"
    assert str(created.tenant_id) == tenant_id
    assert str(created.user_id) == user_id
    db.add.assert_called_once_with(created)
    db.commit.assert_called_once()


def test_existing_subscription_is_updated_and_reactivated():
    db = MagicMock()
    existing = PushSubscription(
        user_id=uuid4(), tenant_id=uuid4(), endpoint="device-token",
        auth="old", p256dh="old", platform="web", is_active=False,
    )
    db.query.return_value.filter.return_value.first.return_value = existing
    result = _call_upsert(db, user_id=str(existing.user_id), tenant_id=str(existing.tenant_id))
    assert result is existing
    assert (existing.auth, existing.p256dh, existing.platform, existing.is_active) == (
        "fcm", "device-token", "android", True,
    )
    db.add.assert_not_called()
    db.commit.assert_called_once()


def test_credentials_are_required_in_the_request_contract():
    with pytest.raises(ValidationError):
        PushSubscriptionUpsert(endpoint="device-token")
    with pytest.raises(ValidationError):
        PushSubscriptionUpsert(endpoint="device-token", auth="fcm")


def test_upsert_lookup_is_scoped_to_tenant_user_and_endpoint():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    tenant_id, user_id = str(uuid4()), str(uuid4())
    _call_upsert(db, user_id=user_id, tenant_id=tenant_id)
    criteria = db.query.return_value.filter.call_args.args
    expressions = " ".join(str(c) for c in criteria)
    assert "push_subscriptions.tenant_id" in expressions
    assert "push_subscriptions.user_id" in expressions
    assert "push_subscriptions.endpoint" in expressions


def test_deletion_is_limited_to_authenticated_tenant():
    db = MagicMock()
    tenant_id, user_id = str(uuid4()), str(uuid4())
    with patch("app.api.v1.endpoints.aliases.resolve_current_tenant_id", return_value=tenant_id):
        delete_push_subscription(
            request=MagicMock(), endpoint="device-token", db=db,
            current_user={"id": user_id},
        )
    criteria = db.query.return_value.filter.call_args.args
    expressions = " ".join(str(c) for c in criteria)
    assert "push_subscriptions.tenant_id" in expressions
    assert "push_subscriptions.user_id" in expressions
    assert "push_subscriptions.endpoint" in expressions
    db.query.return_value.filter.return_value.delete.assert_called_once()
    db.commit.assert_called_once()


def test_delete_route_requires_device_endpoint_query_parameter():
    from fastapi.params import Query
    param = inspect.signature(delete_push_subscription).parameters["endpoint"]
    assert isinstance(param.default, Query)
    assert param.default.is_required()


@pytest.mark.parametrize("endpoint", ["", "  "])
def test_delete_rejects_blank_endpoint_without_db_write(endpoint):
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        delete_push_subscription(
            request=MagicMock(), endpoint=endpoint, db=db,
            current_user={"id": str(uuid4())},
        )
    assert exc.value.status_code == 422
    db.query.assert_not_called()
    db.commit.assert_not_called()
