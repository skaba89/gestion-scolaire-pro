"""Real PostgreSQL regression: finance totals must not depend on pagination or leak tenants."""
from datetime import date
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import text
from starlette.requests import Request

from app.api.v1.endpoints.finance import payments as api
from app.core.database import SessionLocal, engine

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql", reason="Requires real PostgreSQL tables"
)


def _uuid():
    return str(uuid4())


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/payments/overview/",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("testserver", 80), "client": ("127.0.0.1", 12345),
    })


@pytest.fixture
def finance_schools():
    """Two disposable schools, independent student and financial histories."""
    a, b, student_a, student_b = (_uuid() for _ in range(4))
    invoices = []
    with engine.begin() as conn:
        for tid in (a, b):
            conn.execute(text("""
                INSERT INTO tenants
                    (id, name, slug, type, country, is_active, settings, created_at, updated_at)
                VALUES (:tid, 'Finance real-PG test', :slug, 'primary', 'GN',
                        true, '{}', now(), now())
            """), {"tid": tid, "slug": "finance-overview-" + tid[:8]})
        for sid, tid in ((student_a, a), (student_b, b)):
            conn.execute(text("""
                INSERT INTO students
                    (id, tenant_id, registration_number, first_name, last_name,
                     date_of_birth, gender, created_at, updated_at)
                VALUES (:sid, :tid, :reg, 'Mariama', 'Camara',
                        :birth, 'FEMALE', now(), now())
            """), {"sid": sid, "tid": tid, "reg": "FO-" + sid[:8],
                   "birth": date(2012, 5, 1)})

        # 13 invoices for school A: summary must count all, not page_size=10.
        statuses = ["PAID"] * 10 + ["OVERDUE", "PENDING", "CANCELLED"]
        for school, tid, sid, values in (
            ("a", a, student_a, statuses),
            ("b", b, student_b, ["PAID", "OVERDUE"]),
        ):
            for index, state in enumerate(values):
                invoice_id = _uuid()
                invoices.append(invoice_id)
                conn.execute(text("""
                    INSERT INTO invoices
                        (id, tenant_id, student_id, invoice_number, issue_date,
                         due_date, subtotal, total_amount, paid_amount,
                         status, items, created_at, updated_at)
                    VALUES (:id, :tid, :sid, :number, :today,
                            :today, 100, 100, :paid, :state, '[]', now(), now())
                """), {
                    "id": invoice_id, "tid": tid, "sid": sid,
                    "number": "FIN-" + invoice_id[:12], "today": date.today(),
                    "paid": 100 if state == "PAID" else (20 if state == "OVERDUE" else 0),
                    "state": state,
                })

        for tid, sid, rows in (
            (a, student_a, [("COMPLETED", 100), ("COMPLETED", 200),
                            ("REVERSED", 9999), ("PENDING", 9000)]),
            (b, student_b, [("COMPLETED", 5000)]),
        ):
            for state, amount in rows:
                pid = _uuid()
                conn.execute(text("""
                    INSERT INTO payments
                        (id, tenant_id, student_id, amount, currency,
                         payment_date, payment_method, status, reference,
                         created_at, updated_at)
                    VALUES (:id, :tid, :sid, :amount, 'GNF',
                            :today, 'CASH', :state, :ref, now(), now())
                """), {"id": pid, "tid": tid, "sid": sid, "amount": amount,
                       "state": state, "today": date.today(),
                       "ref": "FIN-REAL-" + pid[:16]})
    yield {"a": a, "b": b}
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM payments WHERE tenant_id IN (:a, :b)"),
                     {"a": a, "b": b})
        conn.execute(text("DELETE FROM invoices WHERE tenant_id IN (:a, :b)"),
                     {"a": a, "b": b})
        conn.execute(text("DELETE FROM students WHERE id IN (:a, :b)"),
                     {"a": student_a, "b": student_b})
        conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"),
                     {"a": a, "b": b})


def test_financial_overview_all_rows_and_strict_tenant_isolation(finance_schools):
    schools = finance_schools
    actor = {"id": _uuid(), "roles": ["DIRECTOR"]}
    with SessionLocal() as db:
        for tenant, expected in (
            (schools["a"], {
                "total_invoices": 13, "paid_invoices": 10,
                "overdue_invoices": 1, "outstanding_amount": 180.0,
                "completed_payments": 2, "received_amount": 300.0,
            }),
            (schools["b"], {
                "total_invoices": 2, "paid_invoices": 1,
                "overdue_invoices": 1, "outstanding_amount": 80.0,
                "completed_payments": 1, "received_amount": 5000.0,
            }),
        ):
            with patch.object(api, "_get_tenant_id", return_value=tenant):
                actual = api.finance_overview(_request(), db=db, current_user=actor)
            assert actual == expected


def test_financial_overview_empty_school_returns_zeros_despite_other_school(finance_schools):
    """An empty third school must never inherit another tenant's revenue."""
    tid = _uuid()
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO tenants
                (id, name, slug, type, country, is_active, settings, created_at, updated_at)
            VALUES (:id, 'Empty finance school', :slug, 'primary', 'GN',
                    true, '{}', now(), now())
        """), {"id": tid, "slug": "finance-empty-" + tid[:8]})
    try:
        with SessionLocal() as db, patch.object(api, "_get_tenant_id", return_value=tid):
            actual = api.finance_overview(
                _request(), db=db, current_user={"id": _uuid(), "roles": ["DIRECTOR"]},
            )
        assert set(actual.values()) == {0}
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
