"""Regression: missing user email must never authorize every unlinked student."""
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.operational.school_life import _authorize_report_card_access


def _db(email=None, student_ids=()):
    db = MagicMock()
    user_query, student_query = MagicMock(), MagicMock()
    db.query.side_effect = [user_query, student_query]
    user_query.filter.return_value.scalar.return_value = email
    student_query.filter.return_value.all.return_value = [(sid,) for sid in student_ids]
    return db, student_query


def test_missing_student_email_is_not_equal_to_every_null_student_email():
    uid, tid, target = str(uuid4()), str(uuid4()), str(uuid4())
    db, students = _db(email=None, student_ids=())
    with pytest.raises(HTTPException) as denied:
        _authorize_report_card_access(
            {"id": uid, "roles": ["STUDENT"]}, db, tid, target,
        )
    assert denied.value.status_code == 403
    filter_expressions = students.filter.call_args.args
    assert len(filter_expressions) == 2
    compiled = str(filter_expressions[1])
    assert "students.user_id" in compiled
    assert "students.email" not in compiled


def test_student_account_with_own_profile_can_still_read_bulletin():
    uid, tid, target = str(uuid4()), str(uuid4()), str(uuid4())
    db, _ = _db(email=None, student_ids=[target])
    _authorize_report_card_access(
        {"id": uid, "roles": ["STUDENT"]}, db, tid, target,
    )


def test_existing_legacy_email_link_remains_available_when_email_present():
    uid, tid, target = str(uuid4()), str(uuid4()), str(uuid4())
    db, students = _db(email="student@example.test", student_ids=[target])
    _authorize_report_card_access(
        {"id": uid, "roles": ["STUDENT"]}, db, tid, target,
    )
    condition = str(students.filter.call_args.args[1])
    assert "students.user_id" in condition
    assert "students.email" in condition


def test_unlinked_student_with_email_cannot_read_another_students_report():
    uid, tid, target = str(uuid4()), str(uuid4()), str(uuid4())
    db, _ = _db(email="student@example.test", student_ids=[])
    with pytest.raises(HTTPException) as denied:
        _authorize_report_card_access(
            {"id": uid, "roles": ["STUDENT"]}, db, tid, target,
        )
    assert denied.value.status_code == 403
