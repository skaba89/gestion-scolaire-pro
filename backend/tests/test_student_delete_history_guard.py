"""Deleting a student must not cascade academic or financial history."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.academic import students
from app.crud import student as crud
from app.models.attendance import Attendance
from app.models.enrollment import Enrollment
from app.models.grade import Grade
from app.models.payment import Payment


@pytest.mark.parametrize("dependent_model", [Grade, Enrollment, Attendance, Payment])
def test_delete_student_with_history_never_deletes(dependent_model):
    student_id, tenant_id = uuid4(), uuid4()
    db = MagicMock()
    student = MagicMock()
    def query(model):
        result = MagicMock()
        if model is crud.Student:
            result.filter.return_value.with_for_update.return_value.first.return_value = student
        else:
            result.filter.return_value.first.return_value = (
                (student_id,) if model is dependent_model.id else None
            )
        return result
    db.query.side_effect = query

    with pytest.raises(crud.StudentHasProtectedHistory):
        crud.delete_student(db, student_id, tenant_id)
    db.delete.assert_not_called()
    db.commit.assert_not_called()


def test_delete_student_without_protected_history():
    student_id, tenant_id = uuid4(), uuid4()
    student = MagicMock()
    db = MagicMock()
    def query(model):
        result = MagicMock()
        if model is crud.Student:
            result.filter.return_value.with_for_update.return_value.first.return_value = student
        else:
            result.filter.return_value.first.return_value = None
        return result
    db.query.side_effect = query
    assert crud.delete_student(db, student_id, tenant_id) is True
    db.delete.assert_called_once_with(student)
    db.commit.assert_called_once()


def test_delete_student_outside_tenant_returns_false():
    db = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = None
    assert crud.delete_student(db, uuid4(), uuid4()) is False
    db.delete.assert_not_called()
    db.commit.assert_not_called()
    assert db.query.call_count == 1


def test_delete_student_endpoint_returns_conflict_for_protected_history():
    db, student_id, tenant_id = MagicMock(), uuid4(), uuid4()
    request = Request({
        "type": "http", "method": "DELETE", "path": "/students/x/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345), "server": ("testserver", 80),
    })
    with patch.object(students, "resolve_current_tenant_id", return_value=tenant_id), patch.object(
        students.crud_student, "delete_student",
        side_effect=crud.StudentHasProtectedHistory("protected"),
    ), pytest.raises(HTTPException) as exc:
        students.delete_student(
            student_id=student_id, request=request, db=db,
            current_user={"id": str(uuid4()), "tenant_id": str(tenant_id), "roles": ["TENANT_ADMIN"]},
        )
    assert exc.value.status_code == 409
    assert "archive" in exc.value.detail
