"""Constats des parcours E2E (2026-10-12), côté finance.

1. POST /payments/register/ ignorait la date de paiement : le paiement
   était toujours daté du jour de saisie (un transfert Mobile Money reçu la
   veille ne pouvait pas être daté correctement). Date facultative, jamais
   dans le futur.
2. Deux frais pouvaient porter le même nom : choix ambigu dans les
   factures. 409 en création comme en modification (casse ignorée).
"""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Les endpoints de paiement utilisent du SQL brut PostgreSQL.",
)

API = "/api/v1/payments"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _disable_payments_rate_limiter():
    """POST /payments/register/ est limité à 10/minute par IP, partagé avec
    tout le reste de la suite (test_payment_sequential_reference.py, lancé
    juste après, recevait des 429) — même motif que
    test_auth_rls_restricted_role.py."""
    from app.api.v1.endpoints.finance.payments import limiter as payments_limiter
    previous = payments_limiter.enabled
    payments_limiter.enabled = False
    yield
    payments_limiter.enabled = previous


@pytest.fixture
def school():
    tag = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        tenant = Tenant(name=f"École {tag}", slug=f"pay-{tag}", type="university", country="GN",
                        is_active=True, settings={})
        db.add(tenant)
        db.flush()
        student = Student(tenant_id=tenant.id, registration_number=f"PAY-{tag}", first_name="Awa",
                          last_name="Bah", date_of_birth=date(2005, 1, 1), gender="FEMALE")
        db.add(student)
        db.commit()
        tenant_id, student_id = str(tenant.id), str(student.id)
    user = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return {"headers": {"Authorization": f"Bearer {token}"}, "student_id": student_id}


def _invoice(school, due_date="2026-12-31") -> str:
    body = {"student_id": school["student_id"], "total_amount": 500000}
    if due_date:
        body["due_date"] = due_date
    resp = client.post(f"{API}/invoices/", json=body, headers=school["headers"])
    assert resp.status_code == 201, resp.text
    return resp.json()["invoice_id"]


def _stored_date(payment_id: str) -> date:
    with SessionLocal() as db:
        return db.execute(text("SELECT payment_date FROM payments WHERE id = :id"), {"id": payment_id}).scalar()


class TestPaymentDate:
    def test_a_past_date_is_kept(self, school):
        invoice_id = _invoice(school)
        yesterday = date.today() - timedelta(days=1)

        resp = client.post(f"{API}/register/", json={
            "invoice_id": invoice_id, "amount": 200000, "method": "mobile_money",
            "reference": f"OM-{uuid.uuid4().hex[:6]}", "payment_date": yesterday.isoformat(),
        }, headers=school["headers"])

        assert resp.status_code == 201, resp.text
        assert _stored_date(resp.json()["id"]) == yesterday

    def test_without_a_date_today_is_used(self, school):
        invoice_id = _invoice(school)
        resp = client.post(f"{API}/register/", json={"invoice_id": invoice_id, "amount": 1000, "method": "cash"},
                           headers=school["headers"])
        assert resp.status_code == 201, resp.text
        assert _stored_date(resp.json()["id"]) == date.today()

    def test_a_future_date_is_refused(self, school):
        invoice_id = _invoice(school)
        resp = client.post(f"{API}/register/", json={
            "invoice_id": invoice_id, "amount": 1000, "method": "cash",
            "payment_date": (date.today() + timedelta(days=1)).isoformat(),
        }, headers=school["headers"])
        assert resp.status_code == 422


class TestFeeNamesAreUnique:
    def test_duplicate_name_is_refused_case_insensitively(self, school):
        assert client.post(f"{API}/fees/", json={"name": "Frais d'inscription", "amount": 500000},
                           headers=school["headers"]).status_code == 201
        resp = client.post(f"{API}/fees/", json={"name": "  frais D'INSCRIPTION ", "amount": 400000},
                           headers=school["headers"])
        assert resp.status_code == 409

    def test_renaming_onto_an_existing_name_is_refused(self, school):
        client.post(f"{API}/fees/", json={"name": "Cantine", "amount": 10000}, headers=school["headers"])
        other = client.post(f"{API}/fees/", json={"name": "Transport", "amount": 20000}, headers=school["headers"])

        resp = client.put(f"{API}/fees/{other.json()['id']}/", json={"name": "cantine"}, headers=school["headers"])

        assert resp.status_code == 409

    def test_keeping_its_own_name_on_update_is_allowed(self, school):
        fee = client.post(f"{API}/fees/", json={"name": "Tenue", "amount": 30000}, headers=school["headers"])
        resp = client.put(f"{API}/fees/{fee.json()['id']}/", json={"name": "Tenue", "amount": 35000},
                          headers=school["headers"])
        assert resp.status_code == 200, resp.text

    def test_same_name_in_another_school_is_allowed(self, school):
        assert client.post(f"{API}/fees/", json={"name": "Frais d'examen", "amount": 50000},
                           headers=school["headers"]).status_code == 201
        tag = uuid.uuid4().hex[:8]
        with SessionLocal() as db:
            other = Tenant(name=f"Autre {tag}", slug=f"pay-o-{tag}", type="university", country="GN",
                           is_active=True, settings={})
            db.add(other)
            db.commit()
            other_id = str(other.id)
        user = {"id": str(uuid.uuid4()), "tenant_id": other_id, "roles": ["TENANT_ADMIN"]}
        app.dependency_overrides[get_current_user] = lambda: user
        token = create_access_token({"sub": user["id"], "tenant_id": other_id, "roles": user["roles"]})

        resp = client.post(f"{API}/fees/", json={"name": "Frais d'examen", "amount": 50000},
                           headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 201, resp.text


class TestInvoiceWithoutDueDate:
    def test_due_date_defaults_to_the_issue_date(self, school):
        """due_date facultative dans l'API mais NOT NULL en base : 500 avant."""
        invoice_id = _invoice(school, due_date=None)
        with SessionLocal() as db:
            due, issued = db.execute(text("SELECT due_date, issue_date FROM invoices WHERE id = :id"),
                                     {"id": invoice_id}).one()
        assert due == issued == date.today()
