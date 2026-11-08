"""Individual HTML/PDF bulletin access for teachers is classroom-scoped."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.operational import school_life as api


def _ids():
    return [str(uuid4()) for _ in range(4)]


def test_teacher_cannot_read_bulletin_of_unassigned_class():
    uid, tenant, student, classroom = _ids()
    db = MagicMock()
    with patch.object(api, "teacher_teaches_class", return_value=False) as teaches:
        with pytest.raises(HTTPException) as denied:
            api._authorize_report_card_access(
                {"id": uid, "roles": ["TEACHER"]},
                db, tenant, student, classroom,
            )
    assert denied.value.status_code == 403
    teaches.assert_called_once_with(
        db, tenant_id=tenant, user_id=uid, class_id=classroom,
    )


def test_teacher_assigned_to_class_can_access_report_for_valid_enrollment():
    uid, tenant, student, classroom = _ids()
    db = MagicMock()
    with patch.object(api, "teacher_teaches_class", return_value=True):
        api._authorize_report_card_access(
            {"id": uid, "roles": ["TEACHER"]},
            db, tenant, student, classroom,
        )
    # The separately shared HTML/PDF builder validates the student's
    # enrollment in the requested class/year/term before loading grades.
    db.query.assert_not_called()


def test_teacher_without_classroom_cannot_use_bulletin_specific_guard():
    uid, tenant, student, classroom = _ids()
    db = MagicMock()
    with patch.object(api, "teacher_teaches_class", return_value=False):
        with pytest.raises(HTTPException):
            api._authorize_report_card_access(
                {"id": uid, "roles": ["TEACHER"]},
                db, tenant, student, classroom,
            )


def test_director_keeps_existing_unrestricted_bulletin_authorization():
    uid, tenant, student, classroom = _ids()
    db = MagicMock()
    with patch.object(api, "teacher_teaches_class") as teaches:
        api._authorize_report_card_access(
            {"id": uid, "roles": ["DIRECTOR"]},
            db, tenant, student, classroom,
        )
    teaches.assert_not_called()


def test_certificate_caller_keeps_legacy_ownership_check_without_classroom_id():
    uid, tenant, student, _ = _ids()
    db = MagicMock()
    with patch.object(api, "teacher_teaches_class") as teaches:
        api._authorize_report_card_access(
            {"id": uid, "roles": ["TEACHER"]}, db, tenant, student,
        )
    teaches.assert_not_called()
