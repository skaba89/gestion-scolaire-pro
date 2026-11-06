"""Regression: the bulk notifications endpoint must not bypass per-recipient authorization."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.core.notifications import create_bulk_notifications
from app.schemas.notification import NotificationBulkCreate, NotificationCreate


def _make_batch(*targets):
    return NotificationBulkCreate(notifications=[
        NotificationCreate(user_id=target, title="Test notification")
        for target in targets
    ])


def _send(db, batch, current_user, tenant_id):
    with patch(
        "app.api.v1.endpoints.core.notifications.resolve_current_tenant_id",
        return_value=tenant_id,
    ):
        return create_bulk_notifications(
            request=MagicMock(), bulk_in=batch, db=db, current_user=current_user,
        )


def test_non_admin_cannot_notify_other_users_in_bulk():
    user_id, victim_id, tenant_id = uuid4(), uuid4(), uuid4()
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        _send(db, _make_batch(victim_id), {
            "id": str(user_id), "roles": ["TEACHER"],
        }, str(tenant_id))
    assert exc.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_mixed_non_admin_batch_is_atomic_when_later_recipient_is_forbidden():
    user_id, victim_id, tenant_id = uuid4(), uuid4(), uuid4()
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        _send(db, _make_batch(user_id, victim_id), {
            "id": str(user_id), "roles": ["TEACHER"],
        }, str(tenant_id))
    assert exc.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_non_admin_can_notify_self_in_bulk():
    user_id, tenant_id = uuid4(), uuid4()
    db = MagicMock()
    response = _send(db, _make_batch(user_id), {
        "id": str(user_id), "roles": ["TEACHER"],
    }, str(tenant_id))
    assert response == {"status": "ok", "count": 1}
    db.add.assert_called_once()
    created = db.add.call_args.args[0]
    assert str(created.user_id) == str(user_id)
    assert str(created.tenant_id) == str(tenant_id)
    db.commit.assert_called_once()


def test_admin_cannot_target_another_establishments_user():
    user_id, target_id, tenant_id, other_tenant_id = (
        uuid4(), uuid4(), uuid4(), uuid4(),
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(
        tenant_id=other_tenant_id,
    )
    with pytest.raises(HTTPException) as exc:
        _send(db, _make_batch(target_id), {
            "id": str(user_id), "roles": ["ADMIN"],
        }, str(tenant_id))
    assert exc.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_admin_cannot_target_unknown_user():
    user_id, target_id, tenant_id = uuid4(), uuid4(), uuid4()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(HTTPException) as exc:
        _send(db, _make_batch(target_id), {
            "id": str(user_id), "roles": ["ADMIN"],
        }, str(tenant_id))
    assert exc.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_admin_can_notify_user_from_same_establishment():
    user_id, target_id, tenant_id = uuid4(), uuid4(), uuid4()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(
        tenant_id=tenant_id,
    )
    result = _send(db, _make_batch(target_id), {
        "id": str(user_id), "roles": ["ADMIN"],
    }, str(tenant_id))
    assert result == {"status": "ok", "count": 1}
    db.add.assert_called_once()
    db.commit.assert_called_once()
