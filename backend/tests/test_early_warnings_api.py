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
        result = api.list_early_warnings(request=request(), db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]})
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
            api.create_early_warning(payload, request(), db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]})
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
                request(), db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
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
                request(), db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
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
                request(), db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
            )
    assert err.value.status_code == 422
    db.commit.assert_not_called()


def test_rejects_client_supplied_actor_and_dates():
    with pytest.raises(ValueError):
        api.EarlyWarningUpdate(
            status="acknowledged", acknowledged_by=str(uuid4()),
            acknowledged_at="2026-11-08T00:00:00Z",
        )


@pytest.mark.parametrize("roles", [["STUDENT"], ["PARENT"], ["ACCOUNTANT"], ["TEACHER"], []])
def test_non_management_roles_cannot_read_nominative_early_warnings(roles):
    db = MagicMock()
    with pytest.raises(HTTPException) as err:
        api.list_early_warnings(request=request(), db=db,
                                current_user={"id": str(uuid4()), "roles": roles})
    assert err.value.status_code == 403
    db.execute.assert_not_called()


def _warning_row(tenant_id, student_id, warning_id, **extra):
    return {
        "id": warning_id, "tenant_id": tenant_id, "student_id": student_id,
        "alert_type": "academic", "severity": "high",
        "status": "new", "title": "Risque scolaire",
        "description": "Un suivi est nécessaire",
        "recommended_actions": ["Contacter la famille"],
        "first_name": "Aminata", "last_name": "Diallo",
        "registration_number": "MAT-123",
        "acknowledged_by": None, "resolved_by": None,
        **extra,
    }


def test_successful_creation_persists_audits_and_returns_tenant_student():
    tenant_id, student_id, user_id = str(uuid4()), uuid4(), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(first=lambda: (1,)),
        MagicMock(),
        MagicMock(mappings=lambda: MagicMock(
            first=lambda: _warning_row(tenant_id, str(student_id), str(uuid4()))
        )),
    ]
    payload = api.EarlyWarningCreate(
        student_id=student_id, alert_type="academic", severity="high",
        title="Risque scolaire", description="Un suivi est nécessaire",
        recommended_actions=["Contacter la famille"],
    )
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant_id), \
         patch.object(api, "log_audit") as audit:
        result = api.create_early_warning(payload, request(), db=db,
                                          current_user={"id": user_id, "roles": ["DIRECTOR"]})
    assert result["student"]["first_name"] == "Aminata"
    assert result["status"] == "new"
    assert result["acknowledged_user"] is None
    assert db.execute.call_count == 3
    assert "tenant_id = :tid" in str(db.execute.call_args_list[0].args[0])
    insert_sql, insert_params = db.execute.call_args_list[1].args
    assert "INSERT INTO early_warnings" in str(insert_sql)
    assert insert_params["tid"] == tenant_id
    assert insert_params["sid"] == str(student_id)
    assert insert_params["actions"] == '["Contacter la famille"]'
    audit.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.parametrize("initial,target,notes", [
    ("new", "acknowledged", None),
    ("acknowledged", "in_progress", None),
    ("acknowledged", "resolved", "Famille contactée"),
    ("in_progress", "resolved", "Rendez-vous réalisé"),
    ("new", "dismissed", None),
])
def test_allowed_workflow_transitions_commit_and_audit(initial, target, notes):
    tenant_id, actor_id, warning_id = str(uuid4()), str(uuid4()), uuid4()
    db = MagicMock()
    row = _warning_row(tenant_id, str(uuid4()), str(warning_id), status=target)
    db.execute.side_effect = [
        MagicMock(first=lambda: (initial,)),
        MagicMock(),
        MagicMock(mappings=lambda: MagicMock(first=lambda: row)),
    ]
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant_id), \
         patch.object(api, "log_audit") as audit:
        result = api.update_early_warning(
            warning_id,
            api.EarlyWarningUpdate(status=target, resolution_notes=notes),
            request(), db=db, current_user={"id": actor_id, "roles": ["DIRECTOR"]},
        )
    assert result["status"] == target
    assert db.execute.call_count == 3
    lock_sql, lock_args = db.execute.call_args_list[0].args
    assert "FOR UPDATE" in str(lock_sql)
    assert lock_args == {"id": str(warning_id), "tid": tenant_id}
    update_sql, update_args = db.execute.call_args_list[1].args
    assert "UPDATE early_warnings" in str(update_sql)
    assert "tenant_id = :tid" in str(update_sql)
    assert update_args["uid"] == actor_id
    assert update_args["tid"] == tenant_id
    assert update_args["notes"] == notes
    audit.assert_called_once()
    db.commit.assert_called_once()


def test_processing_list_displays_server_acknowledger_from_same_tenant_join():
    tenant_id, user_id = str(uuid4()), str(uuid4())
    row = _warning_row(
        tenant_id, str(uuid4()), str(uuid4()),
        status="acknowledged", acknowledged_by=user_id,
        acknowledged_first_name="Fanta", acknowledged_last_name="Camara",
    )
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [row]
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant_id):
        result = api.list_early_warnings(
            request=request(), db=db,
            current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
        )
    assert result[0]["acknowledged_user"] == {"first_name": "Fanta", "last_name": "Camara"}
    sql, params = db.execute.call_args.args
    assert "ack.tenant_id = w.tenant_id" in str(sql)
    assert params["tid"] == tenant_id
    assert "acknowledged_first_name" not in result[0]


def test_paginated_listing_bounds_results_and_scopes_both_queries_to_tenant():
    tenant_id = str(uuid4())
    row = _warning_row(tenant_id, str(uuid4()), str(uuid4()), status="resolved")
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(scalar_one=lambda: 45),
        MagicMock(mappings=lambda: MagicMock(all=lambda: [row])),
    ]
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant_id):
        result = api.list_early_warnings_paginated(
            request=request(), page=2, page_size=20, status="resolved",
            db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
        )
    assert result["total"] == 45
    assert result["total_pages"] == 3
    assert result["page"] == 2
    assert result["page_size"] == 20
    assert len(result["items"]) == 1
    assert result["items"][0]["status"] == "resolved"
    count_sql, count_params = db.execute.call_args_list[0].args
    rows_sql, rows_params = db.execute.call_args_list[1].args
    assert "w.tenant_id = :tid" in str(count_sql)
    assert "w.status = :status" in str(count_sql)
    assert "w.tenant_id = :tid" in str(rows_sql)
    assert "w.status = :status" in str(rows_sql)
    assert "LIMIT :limit OFFSET :offset" in str(rows_sql)
    assert count_params == {"tid": tenant_id, "status": "resolved"}
    assert rows_params == {
        "tid": tenant_id, "status": "resolved", "limit": 20, "offset": 20,
    }
    db.commit.assert_not_called()


def test_paginated_listing_rejects_non_management_before_database_access():
    db = MagicMock()
    with pytest.raises(HTTPException) as err:
        api.list_early_warnings_paginated(
            request=request(), page=1, page_size=20, status=None,
            db=db, current_user={"id": str(uuid4()), "roles": ["TEACHER"]},
        )
    assert err.value.status_code == 403
    db.execute.assert_not_called()


def test_paginated_listing_empty_page_preserves_true_total():
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(scalar_one=lambda: 2),
        MagicMock(mappings=lambda: MagicMock(all=lambda: [])),
    ]
    with patch.object(api, "resolve_current_tenant_id", return_value=uuid4()):
        result = api.list_early_warnings_paginated(
            request=request(), page=4, page_size=1, status=None,
            db=db, current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
        )
    assert result["items"] == []
    assert result["total"] == 2
    assert result["total_pages"] == 2
    sql, params = db.execute.call_args_list[1].args
    assert "w.status = :status" not in str(sql)
    assert params["offset"] == 3
