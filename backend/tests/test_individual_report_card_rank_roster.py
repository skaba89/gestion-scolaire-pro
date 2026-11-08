"""Individual report-card ranks use the same academic-year roster as batch reports."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_individual_rank_filters_students_by_class_year_and_tenant():
    student = str(uuid4())
    classroom, term, tenant = (str(uuid4()) for _ in range(3))
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": student},
    ]
    with patch.object(api, "_fetch_grades_for_term_batch", return_value={}) as grades:
        result = api._compute_class_rank(db, classroom, term, tenant, student)
    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "c.id = e.class_id AND c.tenant_id = e.tenant_id" in sql
    assert "s.id = e.student_id AND s.tenant_id = e.tenant_id" in sql
    assert "e.academic_year_id = c.academic_year_id" in sql
    assert "e.status = 'ACTIVE'" in sql
    assert params == {"cid": classroom, "tid": tenant}
    assert result == (0, 1)
    grades.assert_called_once_with(db, classroom, term, tenant)


def test_individual_rank_retains_competition_ties_and_ungraded_zero():
    a, b, ungraded = (str(uuid4()) for _ in range(3))
    grade = lambda score: [{
        "subject_id": str(uuid4()), "subject_name": "Mathématiques",
        "coefficient": 1, "score": score, "max_score": 20,
    }]
    ranks = api._rank_batch_from_bulletin_grades(
        [a, b, ungraded], {a: grade(15), b: grade(15)},
    )
    assert ranks[a] == (1, 3)
    assert ranks[b] == (1, 3)
    assert ranks[ungraded] == (0, 3)
