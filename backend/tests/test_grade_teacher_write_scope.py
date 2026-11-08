"""Teacher grade writes require assignment and active class enrollment."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.academic.grades import _require_teacher_grade_write_scope


def _request(role="TEACHER"):
    return {"id": str(uuid4()), "roles": [role]}


def _db(assigned=True):
    db = MagicMock()
    db.execute.return_value.mappings.return_value.first.return_value = (
        {"class_id": uuid4(), "subject_id": uuid4()} if assigned else None
    )
    return db


def test_teacher_can_grade_only_assigned_class_and_enrolled_student():
    actor = _request()
    db = _db()
    with patch(
        "app.api.v1.endpoints.academic.grades.teacher_teaches_class",
        return_value=True,
    ) as assigned:
        _require_teacher_grade_write_scope(
            db, tenant_id=str(uuid4()), current_user=actor,
            student_id=uuid4(), assessment_id=uuid4(),
        )
    assigned.assert_called_once()
    sql = str(db.execute.call_args.args[0])
    assert "e.tenant_id = a.tenant_id" in sql
    assert "e.student_id = :student_id" in sql
    assert "UPPER(e.status) = 'ACTIVE'" in sql
    assert "a.tenant_id = :tenant_id" in sql


def test_teacher_cannot_grade_student_not_enrolled_in_assessment_class():
    db = _db(assigned=False)
    with pytest.raises(HTTPException) as err:
        _require_teacher_grade_write_scope(
            db, tenant_id=str(uuid4()), current_user=_request(),
            student_id=uuid4(), assessment_id=uuid4(),
        )
    assert err.value.status_code == 403


def test_teacher_cannot_grade_unassigned_class_even_when_student_enrolled():
    db = _db()
    with patch(
        "app.api.v1.endpoints.academic.grades.teacher_teaches_class",
        return_value=False,
    ):
        with pytest.raises(HTTPException) as err:
            _require_teacher_grade_write_scope(
                db, tenant_id=str(uuid4()), current_user=_request(),
                student_id=uuid4(), assessment_id=uuid4(),
            )
    assert err.value.status_code == 403


def test_teacher_cannot_create_unscoped_grade_without_assessment():
    db = _db()
    with pytest.raises(HTTPException) as err:
        _require_teacher_grade_write_scope(
            db, tenant_id=str(uuid4()), current_user=_request(),
            student_id=uuid4(), assessment_id=None,
        )
    assert err.value.status_code == 403
    db.execute.assert_not_called()


def test_director_retains_existing_administrative_grade_entry():
    db = _db()
    _require_teacher_grade_write_scope(
        db, tenant_id=str(uuid4()), current_user=_request("DIRECTOR"),
        student_id=uuid4(), assessment_id=None,
    )
    db.execute.assert_not_called()
