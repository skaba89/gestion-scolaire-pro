"""Official report-card grades must use assessments for the chosen class."""
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_individual_grade_class_filter_is_applied_when_class_is_known():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    student, term, tenant, classroom = (str(uuid4()) for _ in range(4))
    assert api._fetch_grades_for_term(db, student, term, tenant, classroom) == []
    statement, params = db.execute.call_args.args
    assert "a.class_id IS NULL OR a.class_id = :cid" in str(statement)
    assert params == {"sid": student, "term_id": term, "tid": tenant, "cid": classroom}


def test_batch_grade_query_excludes_assessments_assigned_to_another_class():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    classroom, term, tenant = (str(uuid4()) for _ in range(3))
    assert api._fetch_grades_for_term_batch(db, classroom, term, tenant) == {}
    statement, params = db.execute.call_args.args
    assert "a.class_id IS NULL OR a.class_id = e.class_id" in str(statement)
    assert params == {"cid": classroom, "term_id": term, "tid": tenant}
