"""Défauts finance préexistants relevés pendant le lot B2d (2026-11-18), corrigés le 2026-11-23.

- FIN-IDOR-01 : POST /payments/invoices/ et POST /invoices/ acceptaient un ``student_id`` d'un
  autre établissement (la clé étrangère l'accepte : la RLS ne s'applique pas à son contrôle).
- FIN-PUT-01 : PUT d'une facture sans ``due_date`` / ``invoice_number`` écrivait NULL dans des
  colonnes NOT NULL (500) ; ces champs omis gardent désormais leur valeur.
- FIN-REMIND-01 : les relances lisaient ``parent_students`` sans filtre d'établissement et
  avalaient l'échec d'une notification (``except Exception: pass``) dans la transaction.
- FIN-EMAIL-01 : « envoyer la facture par e-mail » n'envoyait rien mais répondait « envoyée »,
  avec ``payments:read`` (parent compris) : désormais ``payments:write`` et 501 honnête.
- FIN-KPI-01 : ``outstandingByClass`` comptait une facture dans chaque classe déjà fréquentée,
  au montant total, factures annulées comprises.

PostgreSQL uniquement : ces routes comparent des UUID en texte dans du SQL brut (même limite
que ``test_invoice_alias_business_rules.py``).
"""
import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from conftest import get_test_client
from sqlalchemy import text
from sqlalchemy.orm import Session

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="SQL brut sur UUID en texte : PostgreSQL uniquement",
)

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _no_rate_limit():
    from app.api.v1.endpoints.finance.payments import limiter
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


def _as(tenant_id: str, role: str = "TENANT_ADMIN") -> dict:
    user = {"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id, "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Finance Défauts", slug=f"fin-def-{tenant_id[:8]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
    return tenant_id


def _student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(id=student_id, tenant_id=tenant_id, registration_number=f"REG-{student_id[:8]}",
                       first_name="Aïssatou", last_name="Barry", date_of_birth=date(2012, 3, 4),
                       gender=Gender.FEMALE, status=StudentStatus.ACTIVE))
        db.commit()
    return student_id


def _invoice(tenant_id: str, student_id: str, *, total=100000.0, paid=0.0,
             status=InvoiceStatus.PENDING, due=None) -> str:
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Invoice(id=invoice_id, tenant_id=tenant_id, student_id=student_id,
                       invoice_number=f"INV-{uuid.uuid4().hex[:10]}",
                       issue_date=date.today() - timedelta(days=40),
                       due_date=due or (date.today() - timedelta(days=10)),
                       subtotal=total, total_amount=total, paid_amount=paid, status=status))
        db.commit()
    return invoice_id


def _scalar(sql: str, **params):
    with SessionLocal() as db:
        return db.execute(text(sql), params).scalar()


def _invoice_count(tenant_id: str) -> int:
    return _scalar("SELECT COUNT(*) FROM invoices WHERE tenant_id = :t", t=tenant_id)


# --- FIN-IDOR-01 -----------------------------------------------------------------------------

@pytest.mark.parametrize("url", ["/api/v1/payments/invoices/", "/api/v1/invoices/"])
def test_invoice_create_refuses_a_student_of_another_school_without_effect(url):
    tenant_a, tenant_b = _tenant(), _tenant()
    foreign_student = _student(tenant_b)
    headers = _as(tenant_a)

    resp = client.post(url, json={"student_id": foreign_student, "total_amount": 50000,
                                  "due_date": "2026-12-31"}, headers=headers)

    assert resp.status_code == 404, resp.text
    assert _invoice_count(tenant_a) == 0
    assert _invoice_count(tenant_b) == 0


@pytest.mark.parametrize("url", ["/api/v1/payments/invoices/", "/api/v1/invoices/"])
def test_invoice_create_refuses_an_invalid_student_id(url):
    tenant_a = _tenant()
    resp = client.post(url, json={"student_id": "pas-un-uuid", "total_amount": 50000},
                       headers=_as(tenant_a))
    assert resp.status_code == 422, resp.text
    assert _invoice_count(tenant_a) == 0


@pytest.mark.parametrize("url", ["/api/v1/payments/invoices/", "/api/v1/invoices/"])
def test_invoice_create_for_a_student_of_the_school_still_works(url):
    tenant_a = _tenant()
    student = _student(tenant_a)
    resp = client.post(url, json={"student_id": student, "total_amount": 50000,
                                  "due_date": "2026-12-31"}, headers=_as(tenant_a))
    assert resp.status_code == 201, resp.text
    assert _invoice_count(tenant_a) == 1


# --- FIN-PUT-01 ------------------------------------------------------------------------------

@pytest.mark.parametrize("prefix", ["/api/v1/payments/invoices/", "/api/v1/invoices/"])
def test_invoice_update_without_due_date_and_number_keeps_them(prefix):
    tenant_a = _tenant()
    student = _student(tenant_a)
    due = date(2027, 1, 15)
    invoice_id = _invoice(tenant_a, student, due=due)
    number_before = _scalar("SELECT invoice_number FROM invoices WHERE id = :i", i=invoice_id)

    resp = client.put(f"{prefix}{invoice_id}/", json={"student_id": student, "total_amount": 80000},
                      headers=_as(tenant_a))

    assert resp.status_code == 200, resp.text
    with SessionLocal() as db:
        row = db.execute(text("SELECT invoice_number, due_date, total_amount FROM invoices WHERE id = :i"),
                         {"i": invoice_id}).first()
    assert row.invoice_number == number_before
    assert row.due_date == due
    assert float(row.total_amount) == 80000.0


@pytest.mark.parametrize("prefix", ["/api/v1/payments/invoices/", "/api/v1/invoices/"])
def test_invoice_update_with_a_new_due_date_still_applies_it(prefix):
    tenant_a = _tenant()
    student = _student(tenant_a)
    invoice_id = _invoice(tenant_a, student, due=date(2027, 1, 15))
    resp = client.put(f"{prefix}{invoice_id}/", json={"student_id": student, "total_amount": 80000,
                                                      "due_date": "2027-03-01"}, headers=_as(tenant_a))
    assert resp.status_code == 200, resp.text
    assert _scalar("SELECT due_date FROM invoices WHERE id = :i", i=invoice_id) == date(2027, 3, 1)


# --- FIN-EMAIL-01 ----------------------------------------------------------------------------

EMAIL_URL = "/api/v1/payments/send-invoice-email/"


def _email_audits(tenant_id: str) -> int:
    return _scalar("SELECT COUNT(*) FROM audit_logs WHERE tenant_id = :t AND action = 'EMAIL_INVOICE'",
                   t=tenant_id)


def test_parent_can_no_longer_call_the_invoice_email_route():
    tenant_a = _tenant()
    invoice_id = _invoice(tenant_a, _student(tenant_a))
    resp = client.post(EMAIL_URL, json={"invoiceId": invoice_id, "recipientEmail": "x@example.gn"},
                       headers=_as(tenant_a, "PARENT"))
    assert resp.status_code == 403, resp.text
    assert _email_audits(tenant_a) == 0


def test_invoice_email_answers_501_and_claims_nothing():
    tenant_a = _tenant()
    invoice_id = _invoice(tenant_a, _student(tenant_a))
    resp = client.post(EMAIL_URL, json={"invoiceId": invoice_id, "recipientEmail": "x@example.gn"},
                       headers=_as(tenant_a, "ACCOUNTANT"))
    assert resp.status_code == 501, resp.text
    assert "envoyée" not in resp.text
    assert _email_audits(tenant_a) == 0


def test_invoice_email_of_another_school_is_404():
    tenant_a, tenant_b = _tenant(), _tenant()
    foreign_invoice = _invoice(tenant_b, _student(tenant_b))
    resp = client.post(EMAIL_URL, json={"invoiceId": foreign_invoice}, headers=_as(tenant_a))
    assert resp.status_code == 404, resp.text


# --- FIN-REMIND-01 ---------------------------------------------------------------------------

REMIND_URL = "/api/v1/payments/send-reminders/"


def _parent(tenant_id: str) -> str:
    parent_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=parent_id, tenant_id=tenant_id, email=f"{parent_id[:8]}@example.gn",
                    username=f"parent-{parent_id[:8]}", password_hash="x", first_name="Mariama",
                    last_name="Parent", phone="+224623000000", is_active=True))
        db.commit()
    return parent_id


def _link(link_tenant: str, student_id: str, parent_id: str) -> None:
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO parent_students (id, tenant_id, student_id, parent_id, relation_type, created_at, updated_at) "
            "VALUES (:id, :tid, :sid, :pid, 'parent', NOW(), NOW())"
        ), {"id": str(uuid.uuid4()), "tid": link_tenant, "sid": student_id, "pid": parent_id})
        db.commit()


def _notifications(tenant_id: str, user_id: str) -> int:
    return _scalar("SELECT COUNT(*) FROM notifications WHERE tenant_id = :t AND user_id = :u",
                   t=tenant_id, u=user_id)


def test_reminders_ignore_a_parent_link_recorded_in_another_school():
    tenant_a, tenant_b = _tenant(), _tenant()
    student = _student(tenant_a)
    parent = _parent(tenant_a)
    _link(tenant_b, student, parent)  # lien enregistré sous un autre établissement
    invoice_id = _invoice(tenant_a, student, status=InvoiceStatus.OVERDUE)

    with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value="job")) as enqueue:
        resp = client.post(REMIND_URL, json={"invoice_ids": [invoice_id]}, headers=_as(tenant_a))

    assert resp.status_code == 200, resp.text
    assert _notifications(tenant_a, parent) == 0
    assert not any(c.args[0] == "send_whatsapp_notification" for c in enqueue.await_args_list)


def test_reminders_still_reach_the_parent_linked_in_the_school():
    tenant_a = _tenant()
    student = _student(tenant_a)
    parent = _parent(tenant_a)
    _link(tenant_a, student, parent)
    invoice_id = _invoice(tenant_a, student, status=InvoiceStatus.OVERDUE)

    with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value="job")):
        resp = client.post(REMIND_URL, json={"invoice_ids": [invoice_id]}, headers=_as(tenant_a))

    assert resp.status_code == 200, resp.text
    assert _notifications(tenant_a, parent) == 1
    assert resp.json()["channels"] == {"in_app": 1, "in_app_failed": 0}


def test_a_failed_notification_is_counted_and_does_not_cancel_the_others():
    tenant_a = _tenant()
    parents, invoices = [], []
    for _ in range(2):
        student = _student(tenant_a)
        parent = _parent(tenant_a)
        _link(tenant_a, student, parent)
        parents.append(parent)
        invoices.append(_invoice(tenant_a, student, status=InvoiceStatus.OVERDUE))

    real_execute = Session.execute
    calls = {"n": 0}

    def flaky_execute(self, statement, *args, **kwargs):
        if "INSERT INTO notifications" in str(statement):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("panne simulée de l'insertion")
        return real_execute(self, statement, *args, **kwargs)

    with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value="job")), \
            patch.object(Session, "execute", flaky_execute):
        resp = client.post(REMIND_URL, json={"invoice_ids": invoices}, headers=_as(tenant_a))

    assert resp.status_code == 200, resp.text
    assert resp.json()["channels"] == {"in_app": 1, "in_app_failed": 1}
    assert sum(_notifications(tenant_a, p) for p in parents) == 1
    # La transaction n'a pas été invalidée : la trace d'audit de l'envoi est bien écrite.
    assert _scalar("SELECT COUNT(*) FROM audit_logs WHERE tenant_id = :t AND action = 'SEND_REMINDERS'",
                   t=tenant_a) == 1


# --- FIN-KPI-01 ------------------------------------------------------------------------------

def test_outstanding_by_class_counts_the_remaining_amount_once_in_the_current_class():
    tenant_a = _tenant()
    student = _student(tenant_a)
    with SessionLocal() as db:
        old_year = AcademicYear(tenant_id=tenant_a, name="2025-2026", code="2025",
                                start_date=date(2025, 9, 1), end_date=date(2026, 7, 1), is_current=False)
        year = AcademicYear(tenant_id=tenant_a, name="2026-2027", code="2026",
                            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1), is_current=True)
        db.add_all([old_year, year])
        db.flush()
        old_class = Classroom(tenant_id=tenant_a, name="6e A (ancienne)")
        current_class = Classroom(tenant_id=tenant_a, name="5e A")
        transferred_from = Classroom(tenant_id=tenant_a, name="5e B")
        db.add_all([old_class, current_class, transferred_from])
        db.flush()
        db.add_all([
            Enrollment(tenant_id=tenant_a, student_id=student, class_id=old_class.id,
                       academic_year_id=old_year.id, status="COMPLETED"),
            Enrollment(tenant_id=tenant_a, student_id=student, class_id=transferred_from.id,
                       academic_year_id=year.id, status="TRANSFERRED"),
            Enrollment(tenant_id=tenant_a, student_id=student, class_id=current_class.id,
                       academic_year_id=year.id, status="ACTIVE"),
        ])
        db.commit()
        current_class_id = str(current_class.id)
    _invoice(tenant_a, student, total=100000.0, paid=40000.0, status=InvoiceStatus.PARTIAL)
    _invoice(tenant_a, student, total=50000.0, status=InvoiceStatus.CANCELLED)
    _invoice(tenant_a, student, total=30000.0, paid=30000.0, status=InvoiceStatus.PAID)

    resp = client.get("/api/v1/analytics/financial-kpis/", headers=_as(tenant_a))

    assert resp.status_code == 200, resp.text
    by_class = resp.json()["outstandingByClass"]
    assert by_class == [{"class_id": current_class_id, "class_name": "5e A", "outstanding_amount": 60000.0}]
