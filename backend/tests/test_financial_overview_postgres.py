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
    yield {"a": a, "b": b, "student_a": student_a, "student_b": student_b}
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


def test_real_pg_parent_sees_only_linked_child_within_same_school(finance_schools):
    """A parent's totals must exclude other families in the same tenant."""
    s = finance_schools
    parent, unrelated_student, extra_invoice, extra_payment, link_id = (
        _uuid() for _ in range(5)
    )
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO users
                (id, tenant_id, email, username, is_active,
                 first_name, last_name, created_at, updated_at)
            VALUES (:id, :tid, :email, :username, true,
                    'Parent', 'Test', now(), now())
        """), {
            "id": parent, "tid": s["a"],
            "email": "fin-parent-" + parent[:8] + "@example.test",
            "username": "fin-parent-" + parent[:8],
        })
        conn.execute(text("""
            INSERT INTO parent_students
                (id, tenant_id, parent_id, student_id, is_primary,
                 relation_type, created_at, updated_at)
            VALUES (:id, :tid, :pid, :sid, true, 'MOTHER', now(), now())
        """), {
            "id": link_id, "tid": s["a"], "pid": parent,
            "sid": s["student_a"],
        })
        # Second family shares tenant A, but has no relationship to this parent.
        conn.execute(text("""
            INSERT INTO students
                (id, tenant_id, registration_number, first_name, last_name,
                 date_of_birth, gender, created_at, updated_at)
            VALUES (:sid, :tid, :reg, 'Autre', 'Famille',
                    :birth, 'FEMALE', now(), now())
        """), {
            "sid": unrelated_student, "tid": s["a"],
            "reg": "FO-" + unrelated_student[:8],
            "birth": date(2011, 4, 3),
        })
        conn.execute(text("""
            INSERT INTO invoices
                (id, tenant_id, student_id, invoice_number, issue_date,
                 due_date, subtotal, total_amount, paid_amount,
                 status, items, created_at, updated_at)
            VALUES (:id, :tid, :sid, :num, :today,
                    :today, 30000, 30000, 0, 'OVERDUE', '[]', now(), now())
        """), {
            "id": extra_invoice, "tid": s["a"], "sid": unrelated_student,
            "num": "FIN-" + extra_invoice[:12], "today": date.today(),
        })
        conn.execute(text("""
            INSERT INTO payments
                (id, tenant_id, student_id, amount, currency,
                 payment_date, payment_method, status, reference,
                 created_at, updated_at)
            VALUES (:id, :tid, :sid, 40000, 'GNF',
                    :today, 'CASH', 'COMPLETED', :ref, now(), now())
        """), {
            "id": extra_payment, "tid": s["a"], "sid": unrelated_student,
            "today": date.today(), "ref": "FIN-REAL-" + extra_payment[:16],
        })
    try:
        with SessionLocal() as db, patch.object(
            api, "_get_tenant_id", return_value=s["a"]
        ):
            parent_overview = api.finance_overview(
                _request(), db=db,
                current_user={"id": parent, "roles": ["PARENT"]},
            )
            # School A has an extra invoice/payment for another family,
            # but this parent sees only the previously seeded child A.
            assert parent_overview == {
                "total_invoices": 13,
                "paid_invoices": 10,
                "overdue_invoices": 1,
                "outstanding_amount": 180.0,
                "completed_payments": 2,
                "received_amount": 300.0,
            }

            with_no_links = api.finance_overview(
                _request(), db=db,
                current_user={"id": _uuid(), "roles": ["PARENT"]},
            )
            assert set(with_no_links.values()) == {0}

            school_manager = api.finance_overview(
                _request(), db=db,
                current_user={"id": parent, "roles": ["DIRECTOR"]},
            )
            assert school_manager == {
                "total_invoices": 14,
                "paid_invoices": 10,
                "overdue_invoices": 2,
                "outstanding_amount": 30180.0,
                "completed_payments": 3,
                "received_amount": 40300.0,
            }
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM payments WHERE id = :id"),
                         {"id": extra_payment})
            conn.execute(text("DELETE FROM invoices WHERE id = :id"),
                         {"id": extra_invoice})
            conn.execute(text("DELETE FROM parent_students WHERE id = :id"),
                         {"id": link_id})
            conn.execute(text("DELETE FROM users WHERE id = :id"),
                         {"id": parent})
            conn.execute(text("DELETE FROM students WHERE id = :id"),
                         {"id": unrelated_student})


def test_real_pg_parent_from_other_school_cannot_see_financial_totals(finance_schools):
    """Same parent role on tenant B must not inherit a tenant-A link."""
    s = finance_schools
    parent, link_id = _uuid(), _uuid()
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO users
                (id, tenant_id, email, username, is_active,
                 first_name, last_name, created_at, updated_at)
            VALUES (:id, :tid, :email, :username, true,
                    'Parent', 'Autre', now(), now())
        """), {
            "id": parent, "tid": s["a"],
            "email": "fin-parent-" + parent[:8] + "@example.test",
            "username": "fin-parent-" + parent[:8],
        })
        conn.execute(text("""
            INSERT INTO parent_students
                (id, tenant_id, parent_id, student_id, created_at, updated_at)
            VALUES (:id, :tid, :pid, :sid, now(), now())
        """), {"id": link_id, "tid": s["a"], "pid": parent,
               "sid": s["student_a"]})
    try:
        with SessionLocal() as db:
            with patch.object(api, "_get_tenant_id", return_value=s["a"]):
                own = api.finance_overview(
                    _request(), db=db,
                    current_user={"id": parent, "roles": ["PARENT"]},
                )
            with patch.object(api, "_get_tenant_id", return_value=s["b"]):
                other = api.finance_overview(
                    _request(), db=db,
                    current_user={"id": parent, "roles": ["PARENT"]},
                )
            assert own["total_invoices"] == 13
            assert set(other.values()) == {0}
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM parent_students WHERE id = :id"),
                         {"id": link_id})
            conn.execute(text("DELETE FROM users WHERE id = :id"),
                         {"id": parent})


def test_finance_overview_under_non_bypassrls_role_and_parent_scope(finance_schools):
    """Actual restricted SQL role + parent link, not just mocked tenant filters."""
    from sqlalchemy.orm import Session

    s = finance_schools
    parent, link_id = _uuid(), _uuid()
    role = "test_finance_rls_" + uuid4().hex[:12]
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO users
                (id, tenant_id, email, username, is_active,
                 first_name, last_name, created_at, updated_at)
            VALUES (:id, :tid, :email, :username, true,
                    'Parent', 'RLS', now(), now())
        """), {"id": parent, "tid": s["a"],
               "email": "fin-rls-" + parent[:8] + "@example.test",
               "username": "fin-rls-" + parent[:8]})
        conn.execute(text("""
            INSERT INTO parent_students
                (id, tenant_id, parent_id, student_id,
                 created_at, updated_at)
            VALUES (:id, :tid, :pid, :sid, now(), now())
        """), {"id": link_id, "tid": s["a"], "pid": parent,
               "sid": s["student_a"]})
        # NOLOGIN is enough for SET ROLE testing; all queries run as a
        # restricted, non-superuser role that cannot bypass row-level security.
        conn.execute(text(f'CREATE ROLE "{role}" NOLOGIN NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(
            f'GRANT SELECT ON invoices, payments, parent_students TO "{role}"'
        ))

    try:
        for tenant, expected in (
            (s["a"], {"total_invoices": 13, "paid_invoices": 10,
                      "overdue_invoices": 1, "outstanding_amount": 180.0,
                      "completed_payments": 2, "received_amount": 300.0}),
            (s["b"], {"total_invoices": 0, "paid_invoices": 0,
                      "overdue_invoices": 0, "outstanding_amount": 0.0,
                      "completed_payments": 0, "received_amount": 0.0}),
        ):
            with engine.begin() as conn:
                with Session(bind=conn) as db:
                    # Initialize SQLAlchemy's transaction listener before
                    # setting context: it defaults to no tenant otherwise.
                    db.execute(text(f'SET LOCAL ROLE "{role}"'))
                    db.execute(
                        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                        {"tid": tenant},
                    )
                    assert db.execute(text("SELECT current_user")).scalar() == role
                    with patch.object(api, "_get_tenant_id", return_value=tenant):
                        result = api.finance_overview(
                            _request(), db=db,
                            current_user={"id": parent, "roles": ["PARENT"]},
                        )
                    assert result == expected

        # No tenant context is fail-closed even for valid parent IDs.
        with engine.begin() as conn:
            with Session(bind=conn) as db:
                db.execute(text(f'SET LOCAL ROLE "{role}"'))
                db.execute(text("SELECT set_config('app.current_tenant_id', '', true)"))
                assert db.execute(text("SELECT count(*) FROM invoices")).scalar() == 0
                assert db.execute(text("SELECT count(*) FROM payments")).scalar() == 0
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'REVOKE ALL ON invoices, payments, parent_students FROM "{role}"'))
            conn.execute(text(f'REVOKE USAGE ON SCHEMA public FROM "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))
            conn.execute(text("DELETE FROM parent_students WHERE id = :id"),
                         {"id": link_id})
            conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": parent})
