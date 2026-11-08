"""Teacher-issued certificates must be limited to their own student roster."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.operational import school_life as api


def _ids():
    return [str(uuid4()) for _ in range(3)]


def test_teacher_can_issue_certificate_for_assigned_class_student():
    teacher, tenant, student = _ids()
    classroom = uuid4()
    db = MagicMock()
    db.query.return_value.join.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = [(classroom,)]
    with patch.object(api, "teacher_teaches_class", return_value=True) as assigned:
        api._authorize_certificate_teacher_scope(
            {"id": teacher, "roles": ["TEACHER"]}, db, tenant, student,
        )
    assigned.assert_called_once_with(db, tenant_id=tenant, user_id=teacher, class_id=str(classroom))


def test_teacher_denied_certificate_for_student_in_unassigned_class():
    teacher, tenant, student = _ids()
    db = MagicMock()
    db.query.return_value.join.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = [(uuid4(),)]
    with patch.object(api, "teacher_teaches_class", return_value=False):
        with pytest.raises(HTTPException) as denied:
            api._authorize_certificate_teacher_scope(
                {"id": teacher, "roles": ["TEACHER"]}, db, tenant, student,
            )
    assert denied.value.status_code == 403


def test_teacher_denied_certificate_for_student_without_enrollment():
    teacher, tenant, student = _ids()
    db = MagicMock()
    db.query.return_value.join.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = []
    with patch.object(api, "teacher_teaches_class") as assignment:
        with pytest.raises(HTTPException) as denied:
            api._authorize_certificate_teacher_scope(
                {"id": teacher, "roles": ["TEACHER"]}, db, tenant, student,
            )
    assert denied.value.status_code == 403
    assignment.assert_not_called()


@pytest.mark.parametrize("role", ["DIRECTOR", "TENANT_ADMIN", "SECRETARY", "PARENT"])
def test_non_scoped_roles_preserve_existing_certificate_authorization(role):
    actor, tenant, student = _ids()
    db = MagicMock()
    api._authorize_certificate_teacher_scope(
        {"id": actor, "roles": [role]}, db, tenant, student,
    )
    db.query.assert_not_called()


def test_teacher_certificate_requires_active_enrollment_in_current_academic_year():
    """Historical and withdrawn rosters must not authorize current documents."""
    teacher, tenant, student = _ids()
    db = MagicMock()
    db.query.return_value.join.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = []
    with patch.object(api, "teacher_teaches_class") as assigned:
        with pytest.raises(HTTPException) as denied:
            api._authorize_certificate_teacher_scope(
                {"id": teacher, "roles": ["TEACHER"]}, db, tenant, student,
            )
    assert denied.value.status_code == 403
    assigned.assert_not_called()
    query = db.query.return_value
    assert query.join.call_count == 1
    assert query.join.return_value.join.call_count == 1
    clauses = query.join.return_value.join.return_value.filter.call_args.args
    sql = " ".join(str(clause) for clause in clauses)
    assert "enrollments.status" in sql
    assert "academic_years.is_current" in sql
    assert "enrollments.tenant_id" in sql
    assert "enrollments.student_id" in sql
