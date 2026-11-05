"""LMD semester progression must agree with transcript credit validation."""
from unittest.mock import MagicMock, patch

from app.services.progression import compute_earned_ects_for_semester


def _row(sid, name, score, ects=6):
    return {
        "subject_id": sid,
        "subject_name": name,
        "ects": ects,
        "score": score,
        "max_score": 20,
        "coefficient": 1,
    }


def _compute(grades, threshold=10):
    with patch(
        "app.services.progression._fetch_grades_for_semester",
        return_value=grades,
    ), patch(
        "app.services.progression.effective_rules",
        return_value={"passing_grade": threshold},
    ):
        return compute_earned_ects_for_semester(
            MagicMock(),
            tenant_id="tenant-1",
            student_id="student-1",
            semester_id="semester-1",
        )


def test_same_name_different_ues_are_counted_independently():
    # Previous grouping by name collapsed these distinct 6- and 4-ECTS
    # units, potentially marking both as acquired from one passing mark.
    grades = [
        _row("ue-a", "Projet", 15, 6),
        _row("ue-b", "Projet", 5, 4),
    ]
    assert _compute(grades) == (6.0, 10.0)


def test_configured_passing_threshold_is_enforced():
    assert _compute([_row("ue-a", "Maths", 11)], threshold=12) == (0.0, 6.0)
    assert _compute([_row("ue-a", "Maths", 12)], threshold=12) == (6.0, 6.0)


def test_rounding_never_earns_credits_below_threshold():
    assert _compute([_row("ue-a", "Maths", 9.996)]) == (0.0, 6.0)


def test_multiple_marks_same_ue_count_credits_once():
    grades = [_row("ue-a", "Maths", 18), _row("ue-a", "Maths", 2)]
    assert _compute(grades) == (6.0, 6.0)


def test_ungraded_ue_does_not_earn_credits():
    assert _compute([_row("ue-a", "Maths", None)]) == (0.0, 6.0)


def test_no_grades_returns_no_credits():
    assert _compute([]) == (0.0, 0.0)
