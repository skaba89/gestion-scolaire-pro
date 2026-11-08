"""Individual and batch bulletins must report identical classroom ranks.

Covers real shared grade/weight calculation while mocking only the roster SQL
and the batch data fetch, including mixed SQLite/PostgreSQL UUID formats.
"""
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def _grade(subject, score, coefficient=1.0):
    return {
        "subject_id": str(subject),
        "subject_name": "Matière",
        "coefficient": coefficient,
        "score": score,
        "max_score": 20,
        "comments": None,
    }


def test_individual_and_batch_ranks_agree_for_weighted_grades_and_ties():
    students = [uuid4() for _ in range(4)]
    classroom, term, tenant = (str(uuid4()) for _ in range(3))
    math, french = uuid4(), uuid4()
    grades = {
        students[0].hex: [_grade(math, 18, 3), _grade(french, 10, 1)],
        students[1]: [_grade(math, 15, 3), _grade(french, 19, 1)],
        str(students[2]): [_grade(math, 10, 3), _grade(french, 10, 1)],
        # Fourth pupil has no grades; must retain rank 0 and count in total.
    }
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": s.hex} for s in students
    ]
    normalized = api._normalize_batch_grade_keys(grades)
    expected = api._rank_batch_from_bulletin_grades(
        [str(s) for s in students], normalized
    )
    # Weighted means: (18*3+10)/4 == (15*3+19)/4 == 16.
    assert expected[str(students[0])] == (1, 4)
    assert expected[str(students[1])] == (1, 4)
    assert expected[str(students[2])] == (3, 4)
    assert expected[str(students[3])] == (0, 4)

    with patch.object(api, "_fetch_grades_for_term_batch", return_value=grades):
        for student in students:
            rank = api._compute_class_rank(
                db, classroom, term, tenant, student.hex
            )
            assert rank == expected[str(student)]


def test_individual_rank_for_student_outside_active_class_is_zero():
    pupil_in_roster, outsider = uuid4(), uuid4()
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": pupil_in_roster}
    ]
    with patch.object(api, "_fetch_grades_for_term_batch") as fetch:
        result = api._compute_class_rank(
            db, str(uuid4()), str(uuid4()), str(uuid4()), str(outsider)
        )
    assert result == (0, 1)
    fetch.assert_not_called()
