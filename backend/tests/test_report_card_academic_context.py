"""A report card must match a real enrollment and its academic period."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.operational import school_life as api


def _ids():
    return {key: str(uuid4()) for key in (
        "tenant_id", "student_id", "classroom_id", "term_id"
    )}


def test_report_card_academic_context_accepts_matching_enrollment():
    ids = _ids()
    db = MagicMock()
    db.execute.return_value.first.return_value = (1,)
    api._validate_report_card_academic_context(db, **ids)
    stmt, bound = db.execute.call_args.args
    sql = str(stmt)
    assert "e.student_id = :student_id" in sql
    assert "e.class_id = :classroom_id" in sql
    assert "e.tenant_id = :tenant_id" in sql
    assert "c.tenant_id = e.tenant_id" in sql
    assert "t.tenant_id = e.tenant_id" in sql
    assert "t.academic_year_id = e.academic_year_id" in sql
    assert "c.academic_year_id = e.academic_year_id" in sql
    assert "UPPER(e.status)" not in sql  # historic bulletins stay accessible
    assert bound == ids


@pytest.mark.parametrize("invalid", ["other_student", "other_class", "other_term", "missing_enrollment"])
def test_report_card_rejects_unmatched_student_class_term(invalid):
    db = MagicMock()
    db.execute.return_value.first.return_value = None
    ids = _ids()
    with pytest.raises(HTTPException) as denied:
        api._validate_report_card_academic_context(db, **ids)
    assert denied.value.status_code == 404


def test_html_builder_rejects_invalid_context_before_reading_student_grades():
    db = MagicMock()
    body = api.SmartReportCardRequest(
        student_id=str(uuid4()), classroom_id=str(uuid4()), term_id=str(uuid4()),
    )
    with patch.object(api, "_validate_report_card_academic_context",
                      side_effect=HTTPException(status_code=404)) as validate, \
         patch.object(api, "_fetch_student_data") as fetch:
        with pytest.raises(HTTPException) as denied:
            api._build_report_card_html(db, body, str(uuid4()))
    assert denied.value.status_code == 404
    validate.assert_called_once()
    fetch.assert_not_called()
