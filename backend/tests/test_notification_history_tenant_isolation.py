"""Notification history and mutations must be confined to the active tenant.

A user may have access to multiple establishments. A user_id-only filter
must never expose, mark or delete records from a different tenant.
"""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.core.notifications import (
    read_notifications, update_notification, mark_all_as_read,
    delete_notification, clear_read_notifications,
)
from app.schemas.notification import NotificationUpdate


@pytest.fixture
def identity():
    return {"tenant_id": str(uuid4()), "user_id": str(uuid4())}


def _scope(db, identity):
    return patch(
        "app.api.v1.endpoints.core.notifications.resolve_current_tenant_id",
        return_value=identity["tenant_id"],
    )


def _filters(db):
    return " ".join(
        str(predicate) for predicate in db.query.return_value.filter.call_args.args
    )


def test_history_sql_filters_both_user_and_tenant(identity):
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    with _scope(db, identity):
        result = read_notifications(
            request=MagicMock(), db=db, current_user={"id": identity["user_id"]},
            limit=50, unread_only=True,
        )
    assert result == []
    stmt, params = db.execute.call_args.args
    sql = str(stmt)
    assert "user_id = :user_id AND tenant_id = :tenant_id" in sql
    assert "is_read = FALSE" in sql
    assert params["tenant_id"] == identity["tenant_id"]
    assert params["user_id"] == identity["user_id"]


def test_history_db_failure_is_visible_not_falsely_empty(identity):
    db = MagicMock()
    db.execute.side_effect = RuntimeError("database unavailable")
    with _scope(db, identity), pytest.raises(HTTPException) as exc:
        read_notifications(
            request=MagicMock(), db=db, current_user={"id": identity["user_id"]},
            limit=50, unread_only=False,
        )
    assert exc.value.status_code == 500


def test_mark_all_read_scoped_to_current_tenant(identity):
    db = MagicMock()
    with _scope(db, identity):
        mark_all_as_read(request=MagicMock(), db=db,
                         current_user={"id": identity["user_id"]})
    assert "notifications.user_id" in _filters(db)
    assert "notifications.tenant_id" in _filters(db)
    assert "notifications.is_read" in _filters(db)
    db.commit.assert_called_once()


def test_clear_read_scoped_to_current_tenant(identity):
    db = MagicMock()
    with _scope(db, identity):
        clear_read_notifications(request=MagicMock(), db=db,
                                 current_user={"id": identity["user_id"]})
    assert "notifications.user_id" in _filters(db)
    assert "notifications.tenant_id" in _filters(db)
    assert "notifications.is_read" in _filters(db)
    db.commit.assert_called_once()


def test_delete_one_notification_scoped_to_current_tenant(identity):
    db = MagicMock()
    with _scope(db, identity):
        delete_notification(request=MagicMock(), notification_id=uuid4(),
                            db=db, current_user={"id": identity["user_id"]})
    assert "notifications.id" in _filters(db)
    assert "notifications.user_id" in _filters(db)
    assert "notifications.tenant_id" in _filters(db)
    db.commit.assert_called_once()


def test_update_one_notification_scoped_to_current_tenant(identity):
    db = MagicMock()
    notification = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = notification
    with _scope(db, identity):
        update_notification(
            request=MagicMock(), notification_id=uuid4(),
            update_in=NotificationUpdate(is_read=True), db=db,
            current_user={"id": identity["user_id"]},
        )
    assert "notifications.id" in _filters(db)
    assert "notifications.user_id" in _filters(db)
    assert "notifications.tenant_id" in _filters(db)
    assert notification.is_read is True
    db.commit.assert_called_once()
