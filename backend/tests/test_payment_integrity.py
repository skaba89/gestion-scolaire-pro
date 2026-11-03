"""Intégrité des encaissements (P0, audit 2026-11-02).

Avant ce correctif :
- POST /payments/register/ lisait paid_amount, calculait le nouveau solde en
  Python puis le réécrivait : deux encaissements simultanés passaient tous
  deux le contrôle de trop-perçu et la facture ne comptait qu'un des deux
  paiements (mise à jour perdue) ;
- aucun X-Idempotency-Key : le client rejouait un POST sur 502/504 (proxy qui
  expire pendant le commit) et créait un second paiement ;
- POST /payments/{id}/reverse/ contrôlait le statut puis écrivait en deux
  temps : deux annulations simultanées décrémentaient la facture deux fois ;
- une référence Mobile Money déjà enregistrée faisait une 500.

PostgreSQL uniquement (comme test_payment_business_rules.py) : SQL brut sur
UUID, et seul PostgreSQL exerce réellement les verrous de ligne.
"""
import threading
import uuid
from datetime import date, timedelta

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user, get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus, Payment  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="SQL brut sur UUID et verrous de ligne : PostgreSQL uniquement (job CI PostgreSQL).",
)

REGISTER_URL = "/api/v1/payments/register/"
REVERSE_URL = "/api/v1/payments/{payment_id}/reverse/"


@pytest.fixture(autouse=True)
def _no_rate_limit_and_clean_overrides():
    from app.api.v1.endpoints.finance.payments import limiter

    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous
    app.dependency_overrides.pop(get_current_user, None)


def _setup(total: float = 100000.0) -> tuple[str, str, dict]:
    """Établissement, comptable réel (FK des clés d'idempotence), facture."""
    tenant_id, user_id, student_id, invoice_id = (str(uuid.uuid4()) for _ in range(4))
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Intégrité", slug=f"integrity-{tenant_id[:8]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        db.add(User(id=user_id, tenant_id=tenant_id, email=f"compta.{tenant_id[:8]}@ecole.gn",
                    username=f"compta.{tenant_id[:8]}", first_name="Kadiatou", last_name="Bah",
                    password_hash=get_password_hash("Integrity@2026"), is_active=True, is_verified=True))
        db.add(Student(id=student_id, tenant_id=tenant_id, registration_number=f"REG-{uuid.uuid4().hex[:8]}",
                       first_name="Test", last_name="Élève", date_of_birth=date(2012, 1, 1),
                       gender=Gender.MALE, status=StudentStatus.ACTIVE))
        db.commit()
        db.add(Invoice(id=invoice_id, tenant_id=tenant_id, student_id=student_id,
                       invoice_number=f"INV-{uuid.uuid4().hex[:8]}", issue_date=date.today(),
                       due_date=date.today() + timedelta(days=30), subtotal=total, total_amount=total,
                       paid_amount=0.0, currency="GNF", status=InvoiceStatus.PENDING))
        db.commit()
    user = {"id": user_id, "roles": ["ACCOUNTANT"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": ["ACCOUNTANT"]})
    return tenant_id, invoice_id, {"Authorization": f"Bearer {token}"}


def _invoice(invoice_id: str) -> Invoice:
    with SessionLocal() as db:
        return db.query(Invoice).filter(Invoice.id == invoice_id).one()


def _payments(invoice_id: str) -> list[Payment]:
    with SessionLocal() as db:
        return db.query(Payment).filter(Payment.invoice_id == invoice_id).all()


def _ref() -> str:
    return f"OM-{uuid.uuid4().hex[:10]}"


def _concurrently(fn, n: int) -> list:
    barrier = threading.Barrier(n)
    results: list = [None] * n

    def run(i):
        barrier.wait()
        results[i] = fn(i)

    threads = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    return results


class TestIdempotentRegistration:
    def test_replay_with_same_key_returns_first_result_and_records_one_payment(self):
        _, invoice_id, headers = _setup()
        body = {"invoice_id": invoice_id, "amount": 30000.0, "method": "MOBILE_MONEY", "reference": _ref()}
        h = {**headers, "X-Idempotency-Key": "pay-1"}

        first = client.post(REGISTER_URL, json=body, headers=h)
        replay = client.post(REGISTER_URL, json=body, headers=h)

        assert first.status_code == 201, first.text
        assert replay.status_code == 201, replay.text
        assert replay.json() == first.json()
        assert len(_payments(invoice_id)) == 1
        assert float(_invoice(invoice_id).paid_amount) == 30000.0

    def test_same_key_with_different_body_is_rejected(self):
        _, invoice_id, headers = _setup()
        h = {**headers, "X-Idempotency-Key": "pay-2"}
        ok = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 10000.0, "method": "CASH", "reference": _ref()}, headers=h)
        assert ok.status_code == 201, ok.text
        clash = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 20000.0, "method": "CASH", "reference": _ref()}, headers=h)
        assert clash.status_code == 409, clash.text
        assert float(_invoice(invoice_id).paid_amount) == 10000.0

    def test_concurrent_replays_of_one_key_charge_once(self):
        """Rejeux simultanés (connexion qui hésite) : un seul encaissement."""
        _, invoice_id, headers = _setup()
        body = {"invoice_id": invoice_id, "amount": 25000.0, "method": "MOBILE_MONEY", "reference": _ref()}
        h = {**headers, "X-Idempotency-Key": "pay-3"}

        results = _concurrently(lambda _i: client.post(REGISTER_URL, json=body, headers=h), 4)

        assert all(r is not None and r.status_code == 201 for r in results), [r and r.text for r in results]
        assert len({r.json()["id"] for r in results}) == 1
        assert len(_payments(invoice_id)) == 1
        assert float(_invoice(invoice_id).paid_amount) == 25000.0


    def test_concurrent_replays_of_a_settling_payment_all_get_the_first_result(self):
        """Le premier envoi solde la facture : les rejeux reçoivent son résultat,
        pas « facture déjà soldée »."""
        _, invoice_id, headers = _setup(total=40000.0)
        body = {"invoice_id": invoice_id, "amount": 40000.0, "method": "MOBILE_MONEY", "reference": _ref()}
        h = {**headers, "X-Idempotency-Key": "pay-4"}

        results = _concurrently(lambda _i: client.post(REGISTER_URL, json=body, headers=h), 4)

        assert all(r.status_code == 201 for r in results), [r.text for r in results]
        assert {r.json()["status"] for r in results} == {"PAID"}
        assert len(_payments(invoice_id)) == 1
        assert float(_invoice(invoice_id).paid_amount) == 40000.0


class TestConcurrentRegistration:
    def test_concurrent_payments_cannot_overpay_or_lose_an_update(self):
        """Deux caissiers encaissent 60 % chacun en même temps : un seul passe."""
        _, invoice_id, headers = _setup(total=100000.0)

        results = _concurrently(
            lambda _i: client.post(
                REGISTER_URL,
                json={"invoice_id": invoice_id, "amount": 60000.0, "method": "CASH", "reference": _ref()},
                headers=headers,
            ),
            2,
        )

        codes = sorted(r.status_code for r in results)
        assert codes == [201, 400], [r.text for r in results]
        inv = _invoice(invoice_id)
        recorded = [p for p in _payments(invoice_id)]
        assert len(recorded) == 1
        assert float(inv.paid_amount) == 60000.0 == sum(float(p.amount) for p in recorded)

    def test_concurrent_partial_payments_are_all_counted(self):
        """Quatre versements de 20 % simultanés : la facture compte les quatre."""
        _, invoice_id, headers = _setup(total=100000.0)

        results = _concurrently(
            lambda _i: client.post(
                REGISTER_URL,
                json={"invoice_id": invoice_id, "amount": 20000.0, "method": "CASH", "reference": _ref()},
                headers=headers,
            ),
            4,
        )

        assert all(r.status_code == 201 for r in results), [r.text for r in results]
        inv = _invoice(invoice_id)
        assert float(inv.paid_amount) == 80000.0
        assert inv.status == InvoiceStatus.PARTIAL
        assert len(_payments(invoice_id)) == 4


class TestReversal:
    def test_concurrent_reversals_decrement_the_invoice_once(self):
        _, invoice_id, headers = _setup(total=100000.0)
        paid = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 40000.0, "method": "CASH", "reference": _ref()}, headers=headers)
        assert paid.status_code == 201, paid.text
        other = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 30000.0, "method": "CASH", "reference": _ref()}, headers=headers)
        assert other.status_code == 201, other.text
        payment_id = paid.json()["id"]

        results = _concurrently(
            lambda _i: client.post(REVERSE_URL.format(payment_id=payment_id), json={"notes": "erreur de saisie"}, headers=headers),
            3,
        )

        assert sorted(r.status_code for r in results) == [200, 400, 400], [r.text for r in results]
        inv = _invoice(invoice_id)
        assert float(inv.paid_amount) == 30000.0
        assert inv.status == InvoiceStatus.PARTIAL

    def test_reversing_the_only_payment_returns_invoice_to_pending(self):
        _, invoice_id, headers = _setup(total=50000.0)
        paid = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 50000.0, "method": "CASH", "reference": _ref()}, headers=headers)
        assert paid.json()["status"] == "PAID"
        resp = client.post(REVERSE_URL.format(payment_id=paid.json()["id"]), json={"notes": "chèque rejeté"}, headers=headers)
        assert resp.status_code == 200, resp.text
        inv = _invoice(invoice_id)
        assert float(inv.paid_amount) == 0.0
        assert inv.status == InvoiceStatus.PENDING

    def test_unknown_payment_is_404(self):
        _, _, headers = _setup()
        resp = client.post(REVERSE_URL.format(payment_id=str(uuid.uuid4())), json={"notes": "x"}, headers=headers)
        assert resp.status_code == 404, resp.text


class TestRejectedRegistrationsLeaveTheInvoiceUntouched:
    def test_duplicate_mobile_money_reference_is_409_not_500(self):
        _, invoice_id, headers = _setup()
        ref = _ref()
        first = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 10000.0, "method": "MOBILE_MONEY", "reference": ref}, headers=headers)
        assert first.status_code == 201, first.text
        dup = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 10000.0, "method": "MOBILE_MONEY", "reference": ref}, headers=headers)
        assert dup.status_code == 409, dup.text
        assert float(_invoice(invoice_id).paid_amount) == 10000.0
        assert len(_payments(invoice_id)) == 1

    def test_cancelled_invoice_cannot_be_paid(self):
        _, invoice_id, headers = _setup()
        with SessionLocal() as db:
            db.query(Invoice).filter(Invoice.id == invoice_id).update({"status": InvoiceStatus.CANCELLED})
            db.commit()
        resp = client.post(REGISTER_URL, json={"invoice_id": invoice_id, "amount": 10000.0, "method": "CASH", "reference": _ref()}, headers=headers)
        assert resp.status_code == 400, resp.text
        assert float(_invoice(invoice_id).paid_amount) == 0.0

    def test_invoice_of_another_tenant_is_404(self):
        _, foreign_invoice, _ = _setup()
        _, _, headers = _setup()  # le comptable courant est celui du 2e établissement
        resp = client.post(REGISTER_URL, json={"invoice_id": foreign_invoice, "amount": 10000.0, "method": "CASH", "reference": _ref()}, headers=headers)
        assert resp.status_code == 404, resp.text
        assert float(_invoice(foreign_invoice).paid_amount) == 0.0
