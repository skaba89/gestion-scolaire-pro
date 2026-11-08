"""ALUMNI are allowed to read only their own historical report cards."""
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.operational.school_life import _authorize_report_card_access


def _student_db(*, own_ids=(), email="alumni@example.test"):
    db = MagicMock()
    user_query, student_query = MagicMock(), MagicMock()
    db.query.side_effect = [user_query, student_query]
    user_query.filter.return_value.scalar.return_value = email
    student_query.filter.return_value.all.return_value = [
        (identifier,) for identifier in own_ids
    ]
    return db


def test_alumni_cannot_read_other_students_bulletins():
    user_id, tenant_id, own_id, other_id = (uuid4() for _ in range(4))
    db = _student_db(own_ids=[own_id])
    with pytest.raises(HTTPException) as exc:
        _authorize_report_card_access(
            {"id": str(user_id), "roles": ["ALUMNI"]},
            db, str(tenant_id), str(other_id),
        )
    assert exc.value.status_code == 403


def test_alumni_can_read_own_historical_report_even_with_sqlite_hex_uuid():
    user_id, tenant_id, own_id = (uuid4() for _ in range(3))
    db = _student_db(own_ids=[own_id.hex])
    _authorize_report_card_access(
        {"id": str(user_id), "roles": ["ALUMNI"]},
        db, str(tenant_id), str(own_id),
    )


def test_unlinked_alumni_must_not_read_arbitrary_bulletin():
    user_id, tenant_id, requested_id = (uuid4() for _ in range(3))
    db = _student_db(own_ids=(), email=None)
    with pytest.raises(HTTPException) as exc:
        _authorize_report_card_access(
            {"id": str(user_id), "roles": ["ALUMNI"]},
            db, str(tenant_id), str(requested_id),
        )
    assert exc.value.status_code == 403


def test_unknown_grade_read_role_is_not_automatically_privileged():
    user_id, tenant_id, requested_id = (uuid4() for _ in range(3))
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        _authorize_report_card_access(
            {"id": str(user_id), "roles": ["UNRECOGNIZED_ROLE"]},
            db, str(tenant_id), str(requested_id),
        )
    assert exc.value.status_code == 403
    db.query.assert_not_called()
