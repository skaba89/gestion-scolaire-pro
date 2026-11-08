"""Regression: a teacher must never edit/delete another class's grade."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.academic import grades as api
from app.schemas.grade import GradeUpdate


def _request():
    return Request({"type": "http", "method": "PUT", "path": "/grades/",
                    "headers": [], "query_string": b"",
                    "scheme": "http", "server": ("testserver", 80),
                    "client": ("127.0.0.1", 12345)})


def _grade():
    return MagicMock(student_id=uuid4(), assessment_id=uuid4(), subject_id=uuid4())


def _actor(role="TEACHER"):
    return {"id": str(uuid4()), "roles": [role]}


def test_teacher_update_checks_existing_grade_before_write():
    grade = _grade()
    db = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch.object(api.crud_grade, "get_grade", return_value=grade), \
         patch.object(api, "_validate_grade_fks"), \
         patch.object(api, "_require_teacher_grade_write_scope",
                      side_effect=HTTPException(status_code=403)) as scope, \
         patch.object(api.crud_grade, "update_grade") as save:
        with pytest.raises(HTTPException) as err:
            api.update_grade(_request(), uuid4(), GradeUpdate(score=12), db, _actor())
    assert err.value.status_code == 403
    scope.assert_called_once()
    save.assert_not_called()


def test_teacher_update_validates_destination_before_write():
    grade = _grade()
    db = MagicMock()
    next_student = uuid4()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch.object(api.crud_grade, "get_grade", return_value=grade), \
         patch.object(api, "_validate_grade_fks"), \
         patch.object(api, "_require_teacher_grade_write_scope",
                      side_effect=[None, HTTPException(status_code=403)]) as scope, \
         patch.object(api.crud_grade, "update_grade") as save:
        with pytest.raises(HTTPException) as err:
            api.update_grade(
                _request(), uuid4(), GradeUpdate(student_id=next_student),
                db, _actor(),
            )
    assert err.value.status_code == 403
    assert scope.call_count == 2
    assert scope.call_args.kwargs["student_id"] == next_student
    save.assert_not_called()


def test_teacher_cannot_change_grade_subject():
    grade = _grade()
    db = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch.object(api.crud_grade, "get_grade", return_value=grade), \
         patch.object(api, "_validate_grade_fks"), \
         patch.object(api, "_require_teacher_grade_write_scope"), \
         patch.object(api.crud_grade, "update_grade") as save:
        with pytest.raises(HTTPException) as err:
            api.update_grade(
                _request(), uuid4(), GradeUpdate(subject_id=uuid4()),
                db, _actor(),
            )
    assert err.value.status_code == 403
    save.assert_not_called()


def test_teacher_delete_refuses_out_of_scope_grade():
    db = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch.object(api.crud_grade, "get_grade", return_value=_grade()), \
         patch.object(api, "_require_teacher_grade_write_scope",
                      side_effect=HTTPException(status_code=403)), \
         patch.object(api.crud_grade, "delete_grade") as remove:
        with pytest.raises(HTTPException) as err:
            api.delete_grade(_request(), uuid4(), db, _actor())
    assert err.value.status_code == 403
    remove.assert_not_called()


def test_teacher_update_and_delete_nonexistent_grade_return_404():
    db = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch.object(api.crud_grade, "get_grade", return_value=None), \
         patch.object(api, "_validate_grade_fks"), \
         patch.object(api.crud_grade, "update_grade") as save, \
         patch.object(api.crud_grade, "delete_grade") as remove:
        for fn in (
            lambda: api.update_grade(_request(), uuid4(), GradeUpdate(score=14), db, _actor()),
            lambda: api.delete_grade(_request(), uuid4(), db, _actor()),
        ):
            with pytest.raises(HTTPException) as err:
                fn()
            assert err.value.status_code == 404
    save.assert_not_called()
    remove.assert_not_called()


def test_director_update_keeps_administrative_path():
    db = MagicMock()
    result = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch.object(api, "_validate_grade_fks"), \
         patch.object(api.crud_grade, "get_grade") as read, \
         patch.object(api.crud_grade, "update_grade", return_value=result) as save:
        assert api.update_grade(_request(), uuid4(), GradeUpdate(score=14), db, _actor("DIRECTOR")) is result
    read.assert_not_called()
    save.assert_called_once()
