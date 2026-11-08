"""Financial overview must use tenant-scoped, role-scoped SQL, never list pages."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

from starlette.requests import Request

from app.api.v1.endpoints.finance import payments as api


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/payments/overview/",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("testserver", 80), "client": ("127.0.0.1", 12345),
    })


def _result(row):
    obj = MagicMock()
    obj.mappings.return_value.one.return_value = row
    return obj


def test_financial_overview_uses_full_tenant_scope_without_pagination():
    tid = str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        _result({"total_invoices": 31, "paid_invoices": 7,
                 "overdue_invoices": 4, "outstanding_amount": 1200}),
        _result({"completed_payments": 44, "received_amount": 5300}),
    ]
    actor = {"id": str(uuid4()), "roles": ["DIRECTOR"]}
    with patch.object(api, "_get_tenant_id", return_value=tid):
        summary = api.finance_overview(_request(), db=db, current_user=actor)
    assert summary == {
        "total_invoices": 31, "paid_invoices": 7, "overdue_invoices": 4,
        "outstanding_amount": 1200.0, "completed_payments": 44,
        "received_amount": 5300.0,
    }
    assert db.execute.call_count == 2
    sql_inv, params_inv = db.execute.call_args_list[0].args
    sql_pay, params_pay = db.execute.call_args_list[1].args
    assert "i.tenant_id = :tenant_id" in str(sql_inv)
    assert "p.tenant_id = :tenant_id" in str(sql_pay)
    assert params_inv["tenant_id"] == params_pay["tenant_id"] == tid
    assert "LIMIT" not in str(sql_inv).upper()
    assert "LIMIT" not in str(sql_pay).upper()
    assert "p.status = 'COMPLETED'" in str(sql_pay)
    assert "CANCELLED" in str(sql_inv)


def test_financial_overview_preserves_parent_child_restrictions():
    tid, child = str(uuid4()), str(uuid4())
    db = MagicMock()
    db.execute.side_effect = [
        _result({"total_invoices": 1, "paid_invoices": 1,
                 "overdue_invoices": 0, "outstanding_amount": 0}),
        _result({"completed_payments": 1, "received_amount": 35}),
    ]
    actor = {"id": str(uuid4()), "roles": ["PARENT"]}
    with patch.object(api, "_get_tenant_id", return_value=tid), patch.object(
        api, "parent_student_filter",
        side_effect=lambda db, *, tenant_id, user, column, requested_student_id:
            (f" AND {column} = ANY(CAST(:parent_children AS uuid[]))",
             {"parent_children": [child]}),
    ) as restrict:
        result = api.finance_overview(_request(), db=db, current_user=actor)
    assert result["received_amount"] == 35.0
    assert restrict.call_count == 2
    for call in db.execute.call_args_list:
        sql, params = call.args
        assert "parent_children" in str(sql)
        assert params["parent_children"] == [child]
        assert params["tenant_id"] == tid


def test_financial_overview_empty_school_returns_actual_zeros():
    db = MagicMock()
    db.execute.side_effect = [
        _result({"total_invoices": 0, "paid_invoices": 0,
                 "overdue_invoices": 0, "outstanding_amount": 0}),
        _result({"completed_payments": 0, "received_amount": 0}),
    ]
    with patch.object(api, "_get_tenant_id", return_value=str(uuid4())):
        result = api.finance_overview(
            _request(), db=db,
            current_user={"id": str(uuid4()), "roles": ["DIRECTOR"]},
        )
    assert all(value == 0 for value in result.values())
