"""Batch bulletins must reconcile SQLite hex UUIDs and PostgreSQL UUID objects."""
from uuid import UUID, uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_batch_grades_normalize_hex_student_keys_and_preserve_rows():
    student_id = uuid4()
    grade = {
        "subject_id": uuid4(), "subject_name": "Mathématiques",
        "coefficient": 2.0, "score": 15, "max_score": 20,
    }
    result = api._normalize_batch_grade_keys({student_id.hex: [grade]})
    assert result == {str(student_id): [grade]}
    assert api._rank_batch_from_bulletin_grades(
        [str(student_id)], result
    ) == {str(student_id): (1, 1)}


def test_batch_grades_normalize_postgres_uuid_objects():
    student_id = uuid4()
    assert api._normalize_batch_grade_keys({student_id: [{"score": 0, "max_score": 20}]}) == {
        str(student_id): [{"score": 0, "max_score": 20}]
    }


def test_batch_grades_preserve_two_distinct_student_ids():
    first, second = uuid4(), uuid4()
    rows = api._normalize_batch_grade_keys({
        first.hex: [{"score": 12, "max_score": 20, "subject_name": "Français"}],
        str(second): [{"score": 18, "max_score": 20, "subject_name": "Français"}],
    })
    assert set(rows) == {str(first), str(second)}
    ranks = api._rank_batch_from_bulletin_grades([str(first), str(second)], rows)
    assert ranks[str(first)] == (2, 2)
    assert ranks[str(second)] == (1, 2)
