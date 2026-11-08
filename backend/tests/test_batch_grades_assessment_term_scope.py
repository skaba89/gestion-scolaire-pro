"""Batch report-card grades respect student, assessment and term boundaries."""
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_batch_grade_query_requires_tenant_and_matching_year_for_term():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    classroom, term, tenant = (str(uuid4()) for _ in range(3))
    assert api._fetch_grades_for_term_batch(db, classroom, term, tenant) == {}
    stmt, params = db.execute.call_args.args
    sql = str(stmt)
    assert "s.tenant_id = e.tenant_id" in sql
    assert "a.tenant_id = e.tenant_id" in sql
    assert "t.tenant_id = e.tenant_id" in sql
    assert "t.academic_year_id = e.academic_year_id" in sql
    assert "a.academic_year_id = t.academic_year_id" in sql
    assert "e.academic_year_id = c.academic_year_id" in sql
    assert "e.status     = 'ACTIVE'" in sql
    assert params == {"cid": classroom, "term_id": term, "tid": tenant}


def test_batch_grade_rows_preserve_student_mapping_and_coefficients():
    db = MagicMock()
    student_id, subject_id = uuid4(), uuid4()
    row = {
        "student_id": student_id, "subject_id": subject_id,
        "subject_name": "Mathématiques", "coefficient": 2.5,
        "score": 18, "max_score": 20, "comments": None,
    }
    db.execute.return_value.mappings.return_value.all.return_value = [row]
    rows = api._fetch_grades_for_term_batch(
        db, str(uuid4()), str(uuid4()), str(uuid4())
    )
    assert rows == {str(student_id): [row]}
