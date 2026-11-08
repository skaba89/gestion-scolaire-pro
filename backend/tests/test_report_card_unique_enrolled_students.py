"""Report-card ranking and export counts must use unique enrolled pupils."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_individual_class_rank_queries_distinct_students():
    student, classroom, term, tenant = (str(uuid4()) for _ in range(4))
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": student},
    ]
    with patch.object(api, "_fetch_grades_for_term_batch", return_value={}):
        assert api._compute_class_rank(db, classroom, term, tenant, student) == (0, 1)
    stmt, params = db.execute.call_args.args
    assert "SELECT DISTINCT e.student_id" in str(stmt)
    assert "e.academic_year_id = c.academic_year_id" in str(stmt)
    assert params == {"cid": classroom, "tid": tenant}


def test_batch_bulletin_roster_selects_distinct_students_before_count():
    db = MagicMock()
    ctx = {
        "tenant_id": str(uuid4()), "classroom_id": str(uuid4()),
        "term_id": str(uuid4()),
    }
    # The first DB statement after validation fetches the roster. With no
    # students, generation stops before creating any document.
    db.execute.return_value.mappings.return_value.all.return_value = []
    with patch.object(api, "_validate_batch_report_card_period"):
        try:
            api._generate_batch_report_cards(
                db, ctx["tenant_id"],
                classroom_id=ctx["classroom_id"], term_id=ctx["term_id"],
            )
        except Exception as exc:
            from fastapi import HTTPException
            assert isinstance(exc, HTTPException)
            assert exc.status_code == 404
        else:
            raise AssertionError("Empty roster should be rejected")
    stmt, params = db.execute.call_args.args
    assert "SELECT DISTINCT e.student_id" in str(stmt)
    assert "s.tenant_id = e.tenant_id" in str(stmt)
    assert "e.academic_year_id = c.academic_year_id" in str(stmt)
    assert params == {"cid": ctx["classroom_id"], "tid": ctx["tenant_id"]}
