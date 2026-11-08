"""Batch bulletin grades must follow the same class-year and tenant boundaries as the roster."""
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_batch_grades_query_constrains_year_and_tenant():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    classroom_id, term_id, tenant_id = [str(uuid4()) for _ in range(3)]

    assert api._fetch_grades_for_term_batch(db, classroom_id, term_id, tenant_id) == {}

    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "c.id = e.class_id AND c.tenant_id = e.tenant_id" in sql
    assert "e.academic_year_id = c.academic_year_id" in sql
    assert "a.tenant_id = e.tenant_id" in sql
    assert "subj.tenant_id = e.tenant_id" in sql
    assert "e.status     = 'ACTIVE'" in sql
    assert "a.term_id    = :term_id" in sql
    assert params == {"cid": classroom_id, "term_id": term_id, "tid": tenant_id}


def test_batch_grades_preserve_weighted_grade_data_shape():
    db = MagicMock()
    sid = uuid4()
    grade = {
        "student_id": sid, "subject_id": uuid4(),
        "subject_name": "Mathématiques", "coefficient": 3.0,
        "score": 12.0, "max_score": 20.0, "comments": None,
    }
    db.execute.return_value.mappings.return_value.all.return_value = [grade]
    result = api._fetch_grades_for_term_batch(
        db, str(uuid4()), str(uuid4()), str(uuid4())
    )
    assert result[str(sid)][0]["subject_name"] == "Mathématiques"
    assert result[str(sid)][0]["coefficient"] == 3.0
    assert result[str(sid)][0]["score"] == 12.0
