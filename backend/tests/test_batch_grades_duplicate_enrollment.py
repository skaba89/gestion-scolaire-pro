"""Duplicate active enrollment rows must not multiply report-card grade rows."""
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_grades_query_deduplicates_enrollment_before_grade_join():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    classroom, term, tenant = (str(uuid4()) for _ in range(3))

    assert api._fetch_grades_for_term_batch(db, classroom, term, tenant) == {}

    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "SELECT DISTINCT student_id, tenant_id, class_id, academic_year_id, status" in sql
    assert "FROM enrollments" in sql
    assert "WHERE class_id = :cid AND tenant_id = :tid AND status = 'ACTIVE'" in sql
    assert ") e\n            JOIN classes c" in sql
    assert "e.academic_year_id = c.academic_year_id" in sql
    assert "t.academic_year_id = e.academic_year_id" in sql
    assert params == {"cid": classroom, "term_id": term, "tid": tenant}


def test_deduplicated_query_retains_multiple_real_assessments():
    db = MagicMock()
    student = uuid4()
    scores = [
        {"student_id": student, "subject_id": uuid4(), "subject_name": "Mathématiques",
         "coefficient": 2, "score": score, "max_score": 20, "comments": None}
        for score in (12, 16)
    ]
    db.execute.return_value.mappings.return_value.all.return_value = scores
    rows = api._fetch_grades_for_term_batch(db, str(uuid4()), str(uuid4()), str(uuid4()))
    assert len(rows[str(student)]) == 2
    assert [x["score"] for x in rows[str(student)]] == [12, 16]
