"""PATCH /students/{id}/ reuses PUT's tenant-scoped partial-update controls."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.academic import students


def _request():
    return Request({
        "type": "http", "method": "PATCH", "path": "/students/target/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


def test_patch_route_registered_with_existing_put_contract():
    routes = [
        route for route in students.router.routes
        if getattr(route, "path", None) == "/{student_id}/"
    ]
    assert any("PATCH" in route.methods for route in routes)
    assert any("PUT" in route.methods for route in routes)
    assert all(
        route.endpoint is students.update_student
        for route in routes if "PATCH" in route.methods or "PUT" in route.methods
    )


def test_partial_update_respects_tenant_and_changes_only_provided_fields():
    tenant, student_id = uuid4(), uuid4()
    payload = students.StudentUpdate(first_name="Fatou")
    assert payload.model_dump(exclude_unset=True) == {"first_name": "Fatou"}
    db = MagicMock()
    updated = MagicMock()
    with patch.object(students, "resolve_current_tenant_id", return_value=tenant), patch.object(
        students.crud_student, "update_student", return_value=updated,
    ) as update:
        response = students.update_student(
            student_id=student_id, student_update=payload,
            request=_request(), db=db, current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert response is updated
    update.assert_called_once_with(db, student_id, payload, tenant)


def test_partial_update_returns_not_found_for_other_tenant():
    db = MagicMock()
    tenant, student_id = uuid4(), uuid4()
    with patch.object(students, "resolve_current_tenant_id", return_value=tenant), patch.object(
        students.crud_student, "update_student", return_value=None,
    ) as update, pytest.raises(HTTPException) as exc:
        students.update_student(
            student_id=student_id, student_update=students.StudentUpdate(last_name="Diallo"),
            request=_request(), db=db, current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 404
    update.assert_called_once()
    assert update.call_args.args[3] == tenant


def test_partial_update_rejects_duplicate_card_uid_before_edit():
    db = MagicMock()
    tenant, student_id = uuid4(), uuid4()
    conflicting = MagicMock(id=uuid4())
    with patch.object(students, "resolve_current_tenant_id", return_value=tenant), patch.object(
        students.crud_student, "get_student_by_card_uid", return_value=conflicting,
    ), patch.object(students.crud_student, "update_student") as update, pytest.raises(HTTPException) as exc:
        students.update_student(
            student_id=student_id, student_update=students.StudentUpdate(card_uid="RFID-0123"),
            request=_request(), db=db, current_user={"roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 409
    update.assert_not_called()
