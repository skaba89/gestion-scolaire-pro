"""Both invoice URLs must serialize deletion with concurrent payment inserts."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from queue import Queue
from time import monotonic, sleep
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from starlette.requests import Request

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Student, Tenant  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentStatus  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture
def school():
    tenant, other, student, invoice = (uuid4() for _ in range(4))
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Invoice retention", slug=f"invoice-lock-{tid}", type="primary"))
        db.flush()
        db.add(Student(id=student, tenant_id=tenant, registration_number=str(student),
                       first_name="Aminata", last_name="Camara", date_of_birth=date(2012, 1, 1), gender="FEMALE"))
        db.flush()
        db.add(Invoice(id=invoice, tenant_id=tenant, student_id=student, invoice_number=str(invoice),
                       issue_date=date(2026, 11, 1), due_date=date(2026, 12, 1),
                       subtotal=100000, total_amount=100000, paid_amount=0, status=InvoiceStatus.DRAFT))
        db.commit()
    actor = {"id": str(uuid4()), "tenant_id": str(tenant), "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: actor
    yield dict(tenant=tenant, other=other, student=student, invoice=invoice, actor=actor)
    app.dependency_overrides.pop(get_current_user, None)


def _payment(s, status=PaymentStatus.COMPLETED):
    return Payment(id=uuid4(), tenant_id=s["tenant"], student_id=s["student"], invoice_id=s["invoice"],
                   amount=50000, currency="GNF", payment_date=date(2026, 11, 14),
                   payment_method=PaymentMethod.CASH, status=status, reference=str(uuid4()))


def _endpoint(route):
    if route == "payments/invoices":
        from app.api.v1.endpoints.finance.payments import delete_invoice_endpoint
        return delete_invoice_endpoint
    from app.api.v1.endpoints.aliases import delete_invoice_alias
    return delete_invoice_alias


@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
@pytest.mark.parametrize("status", [PaymentStatus.COMPLETED, PaymentStatus.REVERSED, PaymentStatus.PENDING])
def test_any_payment_status_preserves_invoice_and_history(school, route, status):
    row = _payment(school, status)
    with SessionLocal() as db:
        db.add(row)
        db.commit()
        payment_id = row.id
    response = client.delete(f"/api/v1/{route}/{school['invoice']}/", headers=HEADERS)
    assert response.status_code == 400, response.text
    with SessionLocal() as db:
        assert db.get(Invoice, school["invoice"]) is not None
        assert db.get(Payment, payment_id).invoice_id == school["invoice"]


@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
def test_unused_invoice_can_be_deleted(school, route):
    response = client.delete(f"/api/v1/{route}/{school['invoice']}/", headers=HEADERS)
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.get(Invoice, school["invoice"]) is None


@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
def test_foreign_invoice_is_not_found(school, route):
    school["actor"]["tenant_id"] = str(school["other"])
    assert client.delete(f"/api/v1/{route}/{school['invoice']}/", headers=HEADERS).status_code == 404
    with SessionLocal() as db:
        assert db.get(Invoice, school["invoice"]) is not None


@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
@pytest.mark.parametrize("role", ["TEACHER", "PARENT", "STUDENT"])
def test_unprivileged_role_cannot_delete_invoice(school, route, role):
    school["actor"]["roles"] = [role]
    assert client.delete(f"/api/v1/{route}/{school['invoice']}/", headers=HEADERS).status_code == 403


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL row locks")
@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
def test_payment_inserted_first_makes_concurrent_deletion_fail_without_orphan(school, route):
    pids = Queue()
    endpoint = _endpoint(route)
    request = Request({"type": "http", "headers": []})
    def remove():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout='15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            try:
                endpoint(request=request, invoice_id=str(school["invoice"]), db=db, current_user=school["actor"])
            except HTTPException as exc:
                return exc.status_code
            return 204
    with SessionLocal() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        payment = _payment(school)
        writer.add(payment)
        writer.flush()  # FK holds KEY SHARE until commit.
        payment_id = payment.id
        future = pool.submit(remove)
        try:
            pid = pids.get(timeout=10)
            deadline = monotonic() + 10
            blocked = False
            while monotonic() < deadline:
                blocked = bool(writer.execute(text("SELECT pg_blocking_pids(:pid)"), {"pid": pid}).scalar_one())
                if blocked or future.done():
                    break
                sleep(0.02)
            assert blocked
        finally:
            writer.commit()
        assert future.result(timeout=15) == 400
    with SessionLocal() as db:
        assert db.get(Invoice, school["invoice"]) is not None
        assert db.get(Payment, payment_id).invoice_id == school["invoice"]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FK row locks")
@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
def test_deletion_first_rejects_late_payment_instead_of_leaving_an_orphan(school, route, monkeypatch):
    from threading import Event
    from sqlalchemy.exc import IntegrityError
    from app.api.v1.endpoints.finance import payments
    deleted, release = Event(), Event()
    pids = Queue()
    original_audit = payments.log_audit
    def hold_delete(*args, **kwargs):
        original_audit(*args, **kwargs)
        deleted.set()
        assert release.wait(timeout=10)
    monkeypatch.setattr(payments, "log_audit", hold_delete)
    payment = _payment(school)
    payment_id = payment.id
    def remove():
        with SessionLocal() as db:
            _endpoint(route)(request=Request({"type": "http", "headers": []}),
                             invoice_id=str(school["invoice"]), db=db, current_user=school["actor"])
    def pay():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout='15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            db.add(payment)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return "foreign_key_rejected"
            return "inserted"
    with ThreadPoolExecutor(max_workers=2) as pool:
        removal = pool.submit(remove)
        try:
            assert deleted.wait(timeout=10)
            payment_future = pool.submit(pay)
            pid = pids.get(timeout=10)
            with SessionLocal() as observer:
                deadline = monotonic() + 10
                blocked = False
                while monotonic() < deadline:
                    blocked = bool(observer.execute(text("SELECT pg_blocking_pids(:pid)"), {"pid": pid}).scalar_one())
                    if blocked or payment_future.done():
                        break
                    sleep(0.02)
                assert blocked
        finally:
            release.set()
        removal.result(timeout=15)
        assert payment_future.result(timeout=15) == "foreign_key_rejected"
    with SessionLocal() as db:
        assert db.get(Invoice, school["invoice"]) is None
        assert db.get(Payment, payment_id) is None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires real PostgreSQL RLS")
@pytest.mark.parametrize("route", ["payments/invoices", "invoices"])
@pytest.mark.parametrize("foreign", [False, True])
def test_delete_under_non_bypass_rls_role(school, route, foreign):
    from app.core.database import switch_tenant_context
    with SessionLocal() as db:
        db.add(_payment(school, PaymentStatus.REVERSED))
        db.commit()
    role = "invoice_retention_" + uuid4().hex
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
    try:
        with SessionLocal() as db:
            db.execute(text(f'SET LOCAL ROLE "{role}"'))
            assert db.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).one() == (False, False)
            assert db.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='payments'::regclass")).scalar_one()
            tid = school["other"] if foreign else school["tenant"]
            switch_tenant_context(db, str(tid))
            with pytest.raises(HTTPException) as exc:
                _endpoint(route)(request=Request({"type": "http", "headers": []}),
                                 invoice_id=str(school["invoice"]), db=db,
                                 current_user=dict(school["actor"], tenant_id=str(tid)))
            assert exc.value.status_code == (404 if foreign else 400)
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))
