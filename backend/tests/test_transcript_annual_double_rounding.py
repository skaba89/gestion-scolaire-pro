"""Annual classic averages must use raw term values, not rounded displays."""
from app.api.v1.endpoints.academic.transcripts import _compute_term_average_from_grades


def _grade(score):
    return {
        "subject_id": "math-1",
        "subject_name": "Mathématiques",
        "coefficient": 1,
        "score": score,
        "max_score": 20,
    }


def test_raw_term_average_retains_precision_while_display_is_rounded():
    grades = [_grade(9.991)]
    assert _compute_term_average_from_grades(grades) == 9.99
    assert _compute_term_average_from_grades(grades, round_result=False) == 9.991


def test_annual_uses_raw_term_averages_not_two_rounded_terms():
    # Rounded term results (9.99, 10.00) would give 10.00 annually,
    # while the raw annual average 9.9935 correctly rounds to 9.99.
    first = _compute_term_average_from_grades([_grade(9.991)], round_result=False)
    second = _compute_term_average_from_grades([_grade(9.996)], round_result=False)
    assert round((first + second) / 2, 2) == 9.99
    assert round((round(first, 2) + round(second, 2)) / 2, 2) == 10.0


def test_no_computable_marks_returns_none_for_both_modes():
    assert _compute_term_average_from_grades([_grade(None)]) is None
    assert _compute_term_average_from_grades(
        [_grade(None)], round_result=False,
    ) is None


def test_default_display_contract_remains_two_decimal_places():
    grades = [_grade(11.23456)]
    assert _compute_term_average_from_grades(grades) == 11.23
    assert _compute_term_average_from_grades(grades, round_result=False) == 11.23456
