"""ECTS must be validated on unrounded grades, not display precision.

This protects against gaining credits at 9.996/20 when the legal
or institution-configured passing threshold is 10.0/20.
"""
from app.api.v1.endpoints.academic.transcripts import _summarize_subject_grades


def _row(score):
    return {
        "subject_id": "subject-1",
        "subject_name": "Statistiques",
        "coefficient": 2,
        "ects": 5,
        "score": score,
        "max_score": 20,
    }


def test_below_threshold_does_not_earn_ects_after_display_rounding():
    result = _summarize_subject_grades([_row(9.996)])
    assert len(result) == 1
    assert result[0]["average"] == 10.0
    assert result[0]["passed"] is False
    assert sum(item["ects"] for item in result if item["passed"]) == 0


def test_exact_threshold_is_passing():
    result = _summarize_subject_grades([_row(10.0)])
    assert result[0]["average"] == 10.0
    assert result[0]["passed"] is True


def test_configured_threshold_uses_raw_average():
    result = _summarize_subject_grades([_row(11.996)], pass_threshold=12.0)
    assert result[0]["average"] == 12.0
    assert result[0]["passed"] is False


def test_multiple_assessments_use_unrounded_mean_for_pass_status():
    rows = [_row(9.99), _row(10.0)]
    result = _summarize_subject_grades(rows)
    assert result[0]["average"] == 10.0
    assert result[0]["passed"] is False


def test_missing_grades_never_award_credits():
    result = _summarize_subject_grades([_row(None)])
    assert result[0]["average"] is None
    assert result[0]["passed"] is False
