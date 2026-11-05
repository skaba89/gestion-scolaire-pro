"""Regression: report-card batch must never hide a grade-query error.

A failed grade lookup is NOT the same as a student having no grades.
Otherwise the bulk PDF/HTML run can distribute blank or misleading results.
"""
from unittest.mock import MagicMock

import pytest

from app.api.v1.endpoints.operational.school_life import (
    _fetch_grades_for_term_batch,
)


def test_batch_grade_query_failure_is_propagated():
    db = MagicMock()
    db.execute.side_effect = RuntimeError("database temporarily unavailable")

    with pytest.raises(RuntimeError, match="database temporarily unavailable"):
        _fetch_grades_for_term_batch(
            db,
            classroom_id="c4ce5c7b-5179-4824-80dd-f9839877034e",
            term_id="87216995-0274-49a0-a608-1715e76056af",
            tenant_id="163a49e7-86df-43f6-94a8-66fb85e974dd",
        )
    db.execute.assert_called_once()


def test_successful_empty_grade_query_remains_valid():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    assert _fetch_grades_for_term_batch(
        db,
        classroom_id="c4ce5c7b-5179-4824-80dd-f9839877034e",
        term_id="87216995-0274-49a0-a608-1715e76056af",
        tenant_id="163a49e7-86df-43f6-94a8-66fb85e974dd",
    ) == {}


def test_grade_query_success_keeps_student_records_separate():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": "student-a", "subject_name": "Mathématiques", "score": 17, "max_score": 20},
        {"student_id": "student-b", "subject_name": "Français", "score": 11, "max_score": 20},
    ]
    result = _fetch_grades_for_term_batch(
        db,
        classroom_id="c4ce5c7b-5179-4824-80dd-f9839877034e",
        term_id="87216995-0274-49a0-a608-1715e76056af",
        tenant_id="163a49e7-86df-43f6-94a8-66fb85e974dd",
    )
    assert len(result["student-a"]) == 1
    assert result["student-a"][0]["score"] == 17
    assert result["student-b"][0]["score"] == 11
