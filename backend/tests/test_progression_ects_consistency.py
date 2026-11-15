"""Progression delegates to the central LMD validation result."""
from unittest.mock import MagicMock, patch

from app.services.progression import compute_earned_ects_for_semester


def _compute(result):
    db = MagicMock()
    with patch("app.services.progression.build_semester_validation", return_value=result) as central:
        return compute_earned_ects_for_semester(
            db,
            tenant_id="tenant-1",
            student_id="student-1",
            semester_id="semester-1",
        ), central, db


def test_progression_uses_central_earned_and_possible_credits():
    result, central, db = _compute({"ects_earned": 9, "ects_possible": 12})
    assert result == (9.0, 12.0)
    central.assert_called_once_with(
        db, tenant_id="tenant-1", student_id="student-1", semester_id="semester-1",
    )


def test_missing_validation_context_is_safe():
    assert _compute(None)[0] == (0.0, 0.0)
