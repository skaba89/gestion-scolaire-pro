"""Early warning API contract: tenant isolation and authoritative state changes."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.operational import early_warnings as api


def request():
    return Request({
        "type": "http", "method": "GET", "path": "/school-life/early-warnings/",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("testserver", 80), "client": ("127.0.0.1", 12345),
    })


def test_listing_is_scoped_to_tenant():
    tenant_id = uuid4()
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant_id):
        result = api.list_early_warnings(request=request(), db=db, current_user={"id": str(uuid4())})
    assert result == []
    sql, params = db.execute.call_args.args
    assert "w.tenant_id = :tid" in str(sql)
    assert "s.tenant_id = w.tenant_id" in str(sql)
    assert params["tid"] == str(tenant_id)


def test_cannot_create_warning_for_student_from_another_tenant():
    tenant_id = uuid4()
    db = MagicMock()
    db.execute.return_value.first.return_value = None
    payload = api.EarlyWarningCreate(
        student_id=uuid4(), alert_type="academic", severity="high",
        title="Suivi scolaire", description="Suivi nécessaire",
    )
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant_id):
        with pytest.raises(HTTPException) as err:
            api.create_early_warning(payload, request(), db=db, current_user={"id": str(uuid4())})
    assert err.value.status_code == 404
    sql, params = db.execute.call_args.args
    assert "tenant_id = :tid" in str(sql)
    assert params["tid"] == str(tenant_id)
    db.commit.assert_not_called()


def test_cross_tenant_update_does_not_modify_alert():
    db = MagicMock()
    db.execute.return_value.first.return_value = None
    with patch.object(api, "resolve_current_tenant_id", return_value=uuid4()):
        with pytest.raises(HTTPException) as err:
            api.update_early_warning(
                uuid4(), api.EarlyWarningUpdate(status="acknowledged"),
                request(), db=db, current_user={"id": str(uuid4())},
            )
    assert err.value.status_code == 404
    sql, _ = db.execute.call_args.args
    assert "tenant_id = :tid" in str(sql)
    db.commit.assert_not_called()


@pytest.mark.parametrize("initial,desired", [
    ("new", "resolved"), ("resolved", "acknowledged"), ("dismissed", "resolved"),
])
def test_invalid_transitions_do_not_mutate(initial, desired):
    db = MagicMock()
    db.execute.return_value.first.return_value = (initial,)
    with patch.object(api, "resolve_current_tenant_id", return_value=uuid4()):
        with pytest.raises(HTTPException) as err:
            api.update_early_warning(
                uuid4(), api.EarlyWarningUpdate(status=desired, resolution_notes="Réalisé"),
                request(), db=db, current_user={"id": str(uuid4())},
            )
    assert err.value.status_code == 409
    assert db.execute.call_count == 1
    db.commit.assert_not_called()


def test_resolution_requires_human_explanation():
    db = MagicMock()
    db.execute.return_value.first.return_value = ("acknowledged",)
    with patch.object(api, "resolve_current_tenant_id", return_value=uuid4()):
        with pytest.raises(HTTPException) as err:
            api.update_early_warning(
                uuid4(), api.EarlyWarningUpdate(status="resolved", resolution_notes="  "),
                request(), db=db, current_user={"id": str(uuid4())},
            )
    assert err.value.status_code == 422
    db.commit.assert_not_called()


def test_rejects_client_supplied_actor_and_dates():
    with pytest.raises(ValueError):
        api.EarlyWarningUpdate(
            status="acknowledged", acknowledged_by=str(uuid4()),
            acknowledged_at="2026-11-08T00:00:00Z",
        )
