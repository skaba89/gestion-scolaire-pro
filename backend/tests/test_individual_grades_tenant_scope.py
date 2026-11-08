"""Individual report-card grades must not join records belonging to other tenants."""
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_individual_grade_query_enforces_tenant_and_academic_period():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    student, term, tenant = (str(uuid4()) for _ in range(3))
    assert api._fetch_grades_for_term(db, student, term, tenant) == []
    stmt, params = db.execute.call_args.args
    sql = str(stmt)
    assert "a.tenant_id = g.tenant_id" in sql
    assert "t.tenant_id = a.tenant_id" in sql
    assert "a.academic_year_id = t.academic_year_id" in sql
    assert "s.tenant_id = g.tenant_id" in sql
    assert "subj.tenant_id = a.tenant_id" in sql
    assert "a.term_id       = :term_id" in sql
    assert params == {"sid": student, "term_id": term, "tid": tenant, "cid": None}


def test_individual_grade_query_preserves_subject_and_weight():
    db = MagicMock()
    grade = {
        "subject_id": uuid4(), "subject_name": "Physique",
        "coefficient": 2.5, "score": 13.0,
        "max_score": 20.0, "comments": "Progrès",
    }
    db.execute.return_value.mappings.return_value.all.return_value = [grade]
    result = api._fetch_grades_for_term(
        db, str(uuid4()), str(uuid4()), str(uuid4()),
    )
    assert result == [grade]
