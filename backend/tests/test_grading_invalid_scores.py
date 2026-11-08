"""Corrupted grade scales must not create mathematically false official results."""
import math

import pytest

from app.services.grading import (
    compute_weighted_average,
    compute_ects_weighted_average,
)
from app.api.v1.endpoints.operational.school_life import _build_bulletin_v2


def _grade(score, maximum):
    return {
        "subject_id": "math", "subject_name": "Mathématiques",
        "score": score, "max_score": maximum,
        "coefficient": 2, "ects": 6,
    }


@pytest.mark.parametrize("invalid", [0, -5, float("nan"), float("inf")])
def test_invalid_max_score_is_rejected_by_both_grade_algorithms(invalid):
    for calculator in (compute_weighted_average, compute_ects_weighted_average):
        with pytest.raises(ValueError):
            calculator([_grade(10, invalid)])


@pytest.mark.parametrize("invalid", [-1, 21, float("nan"), float("inf")])
def test_out_of_range_score_is_rejected(invalid):
    for calculator in (compute_weighted_average, compute_ects_weighted_average):
        with pytest.raises(ValueError):
            calculator([_grade(invalid, 20)])


def test_missing_max_score_remains_legacy_out_of_twenty():
    assert compute_weighted_average([_grade(12, None)]) == 12.0
    assert compute_ects_weighted_average([_grade(12, None)]) == 12.0


def test_zero_is_a_real_score_not_missing_grade():
    assert compute_weighted_average([_grade(0, 20)]) == 0.0


def test_invalid_barreme_never_appears_in_printed_bulletin():
    with pytest.raises(ValueError):
        _build_bulletin_v2(
            school_name="École test", student_name="Aminata",
            grades=[_grade(12, 0)], general_average=12,
        )
