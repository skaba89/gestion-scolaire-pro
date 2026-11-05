"""Single-student and classroom bulletins must share ranking semantics."""
from unittest.mock import MagicMock, patch
from uuid import UUID

from app.api.v1.endpoints.operational.school_life import _compute_class_rank


A = "2ce4db88-2d1d-4b2b-9fbd-2478e6832a7d"
B = "4bd8d0ae-0dc6-4fc9-8259-91d8eb65b633"
C = "da349361-e495-42ba-8d45-e5c76f2225bb"
CID = "a68d5aca-e92c-4e5d-9832-d29fa9c4eefe"
TERM = "0c5c6c7d-c61f-440b-8fbd-0fb569f26fa0"
TENANT = "bcb346a4-37e8-442f-982f-a17ea19d72e3"


def _grade(subject, score, coeff=1):
    return {"subject_name": subject, "score": score,
            "max_score": 20, "coefficient": coeff}


def _db(ids):
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": UUID(sid)} for sid in ids
    ]
    return db


def _rank(db, sid):
    return _compute_class_rank(db, CID, TERM, TENANT, sid)


def test_individual_rank_matches_subject_weighted_average():
    db = _db([A, B])
    grades = {
        A: [_grade("Maths", 20, 3), _grade("Maths", 0, 3),
            _grade("French", 15)],
        B: [_grade("Maths", 12, 3), _grade("French", 12)],
    }
    with patch(
        "app.api.v1.endpoints.operational.school_life._fetch_grades_for_term_batch",
        return_value=grades,
    ) as fetch:
        assert _rank(db, A) == (2, 2)
        assert _rank(db, B) == (1, 2)
    assert fetch.call_count == 2


def test_equal_averages_share_first_rank():
    db = _db([A, B, C])
    grades = {
        A: [_grade("Maths", 18)],
        B: [_grade("French", 18)],
        C: [_grade("Maths", 8)],
    }
    with patch(
        "app.api.v1.endpoints.operational.school_life._fetch_grades_for_term_batch",
        return_value=grades,
    ):
        assert _rank(db, A) == (1, 3)
        assert _rank(db, B) == (1, 3)
        assert _rank(db, C) == (3, 3)


def test_student_without_grades_has_no_rank():
    db = _db([A, B])
    with patch(
        "app.api.v1.endpoints.operational.school_life._fetch_grades_for_term_batch",
        return_value={A: [_grade("Maths", 13)]},
    ):
        assert _rank(db, B) == (0, 2)


def test_student_not_enrolled_cannot_receive_class_rank():
    db = _db([A, B])
    with patch(
        "app.api.v1.endpoints.operational.school_life._fetch_grades_for_term_batch",
    ) as fetch:
        assert _rank(db, C) == (0, 2)
        fetch.assert_not_called()


def test_sql_grade_failure_is_not_silently_reported_as_rank_zero():
    db = _db([A, B])
    with patch(
        "app.api.v1.endpoints.operational.school_life._fetch_grades_for_term_batch",
        side_effect=RuntimeError("grades query failed"),
    ):
        import pytest
        with pytest.raises(RuntimeError, match="grades query failed"):
            _rank(db, A)
