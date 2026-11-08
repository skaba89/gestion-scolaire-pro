"""Official grades must not silently normalize invalid coefficients or ECTS."""
import pytest

from app.services.grading import compute_ects_weighted_average, compute_weighted_average
from app.api.v1.endpoints.operational.school_life import _build_bulletin_v2


def _row(**values):
    result = {
        "subject_id": "math", "subject_name": "Mathématiques",
        "score": 12, "max_score": 20, "coefficient": 1, "ects": 6,
    }
    result.update(values)
    return result


@pytest.mark.parametrize("value", [0, -2, float("nan"), float("inf"), -float("inf")])
def test_invalid_coefficient_is_rejected(value):
    with pytest.raises(ValueError):
        compute_weighted_average([_row(coefficient=value)])
    with pytest.raises(ValueError):
        _build_bulletin_v2(
            school_name="École témoin", student_name="Aminata Bah",
            grades=[_row(coefficient=value)], general_average=12,
        )


def test_missing_coefficient_keeps_legacy_weight_one():
    assert compute_weighted_average([_row(coefficient=None)]) == 12


def test_positive_fractional_coefficient_is_supported():
    assert compute_weighted_average([
        _row(subject_id="math", coefficient=0.5, score=10),
        _row(subject_id="science", subject_name="Sciences", coefficient=1.5, score=18),
    ]) == 16


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), -float("inf")])
def test_invalid_ects_is_rejected(value):
    with pytest.raises(ValueError):
        compute_ects_weighted_average([_row(ects=value)])


def test_zero_and_missing_ects_still_exclude_uncredited_subjects():
    assert compute_ects_weighted_average([_row(ects=0)]) is None
    assert compute_ects_weighted_average([_row(ects=None)]) is None
