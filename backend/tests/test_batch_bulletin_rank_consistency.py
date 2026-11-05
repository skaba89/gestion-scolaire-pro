"""Regression: batch bulletin ranks must match the actual bulletin averages."""
from app.api.v1.endpoints.operational.school_life import (
    _rank_batch_from_bulletin_grades,
    _compute_average,
)


def _grade(subject, score, coeff=1, maximum=20):
    return {"subject_name": subject, "score": score,
            "coefficient": coeff, "max_score": maximum}


def test_rank_uses_subject_averages_not_weighted_individual_grades():
    # Alice: Maths (20 + 0)/2 = 10, French 15 -> (10*3+15)/4 = 11.25.
    # Bob: Maths 12, French 12 -> (12*3+12)/4 = 12.
    # A flawed per-grade weighted SQL expression ranks Alice ahead instead.
    grades = {
        "alice": [_grade("Maths", 20, 3), _grade("Maths", 0, 3),
                  _grade("Français", 15)],
        "bob": [_grade("Maths", 12, 3), _grade("Français", 12)],
    }
    assert _compute_average(grades["alice"]) == 11.25
    assert _compute_average(grades["bob"]) == 12
    assert _rank_batch_from_bulletin_grades(["alice", "bob"], grades) == {
        "alice": (2, 2), "bob": (1, 2),
    }


def test_equal_averages_share_rank_and_next_rank_skips():
    grades = {
        "a": [_grade("Maths", 18)],
        "b": [_grade("Maths", 18)],
        "c": [_grade("Maths", 10)],
    }
    assert _rank_batch_from_bulletin_grades(["a", "b", "c"], grades) == {
        "a": (1, 3), "b": (1, 3), "c": (3, 3),
    }


def test_missing_grades_do_not_get_false_last_rank():
    grades = {"a": [_grade("Maths", 13)]}
    assert _rank_batch_from_bulletin_grades(["a", "ungraded"], grades) == {
        "a": (1, 2), "ungraded": (0, 2),
    }


def test_real_zero_score_has_a_rank_but_empty_score_does_not():
    grades = {
        "zero": [_grade("Maths", 0)],
        "empty": [_grade("Maths", None)],
    }
    assert _rank_batch_from_bulletin_grades(["zero", "empty"], grades) == {
        "zero": (1, 2), "empty": (0, 2),
    }


def test_scaled_scores_are_consistent_with_bulletin_average():
    grades = {
        "a": [_grade("Maths", 10, maximum=10)],
        "b": [_grade("Maths", 15, maximum=20)],
    }
    assert _rank_batch_from_bulletin_grades(["a", "b"], grades) == {
        "a": (1, 2), "b": (2, 2),
    }
