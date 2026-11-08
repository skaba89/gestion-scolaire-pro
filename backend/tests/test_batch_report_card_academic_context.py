"""Full-class report cards only use a coherent class, term and tenant."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.operational import school_life as api


def _ctx():
    return {
        "tenant_id": str(uuid4()),
        "classroom_id": str(uuid4()),
        "term_id": str(uuid4()),
    }


def test_batch_period_rejects_mismatched_class_and_term():
    db = MagicMock()
    db.execute.return_value.first.return_value = None
    with pytest.raises(HTTPException) as denied:
        api._validate_batch_report_card_period(db, **_ctx())
    assert denied.value.status_code == 404


def test_batch_period_checks_academic_year_and_tenant():
    db = MagicMock()
    db.execute.return_value.first.return_value = (1,)
    args = _ctx()
    api._validate_batch_report_card_period(db, **args)
    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "ay.id = c.academic_year_id" in sql
    assert "ay.tenant_id = c.tenant_id" in sql
    assert "t.academic_year_id = ay.id" in sql
    assert "t.tenant_id = c.tenant_id" in sql
    assert "c.tenant_id = :tid" in sql
    assert "t.id = :term_id" in sql
    assert params == {
        "cid": args["classroom_id"], "tid": args["tenant_id"],
        "term_id": args["term_id"],
    }


def test_batch_generation_rejects_bad_period_before_reading_student_roster():
    db = MagicMock()
    ctx = _ctx()
    with patch.object(api, "_validate_batch_report_card_period",
                      side_effect=HTTPException(status_code=404)) as check:
        with pytest.raises(HTTPException) as denied:
            api._generate_batch_report_cards(db, ctx["tenant_id"],
                classroom_id=ctx["classroom_id"], term_id=ctx["term_id"])
    assert denied.value.status_code == 404
    check.assert_called_once_with(db, **ctx)
    db.execute.assert_not_called()
