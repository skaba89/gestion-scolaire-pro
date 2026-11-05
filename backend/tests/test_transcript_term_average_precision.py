"""Official semester averages must use unrounded subject means."""
from app.api.v1.endpoints.academic.transcripts import (
    _compute_term_average_from_grades,
    _summarize_subject_grades,
)


def _row(sid, score, coefficient=1, name="UE", max_score=20):
    return {
        "subject_id": sid,
        "subject_name": name,
        "score": score,
        "max_score": max_score,
        "coefficient": coefficient,
        "ects": 3,
    }


def test_round_only_after_semester_weighting():
    rows = [_row("a", 9.991), _row("b", 9.996)]
    assert [s["average"] for s in _summarize_subject_grades(rows)] == [9.99, 10.0]
    # Average of displayed rounded subjects: 10.00, raw actual: 9.9935 -> 9.99.
    assert _compute_term_average_from_grades(rows) == 9.99


def test_multiple_marks_same_subject_are_averaged_before_coefficient():
    rows = [
        _row("math", 20, 3, "Maths"),
        _row("math", 0, 3, "Maths"),
        _row("french", 15, 1, "Français"),
    ]
    assert _compute_term_average_from_grades(rows) == 11.25


def test_distinct_ues_with_same_name_remain_distinct():
    rows = [_row("ue-a", 20, 3, "Projet"), _row("ue-b", 0, 1, "Projet")]
    assert _compute_term_average_from_grades(rows) == 15.0


def test_missing_scores_are_ignored_not_treated_as_zero():
    assert _compute_term_average_from_grades([
        _row("a", None), _row("b", 12),
    ]) == 12.0
    assert _compute_term_average_from_grades([_row("a", None)]) is None


def test_different_mark_scales_normalized_to_twenty():
    assert _compute_term_average_from_grades([
        _row("a", 8, max_score=10), _row("b", 12, max_score=20),
    ]) == 14.0
