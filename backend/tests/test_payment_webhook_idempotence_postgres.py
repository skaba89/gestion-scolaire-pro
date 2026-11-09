"""Webhook Mobile Money (PayTech) : idempotence de la confirmation (recette B6).

Les fournisseurs renvoient une même notification (IPN) quand ils n'ont pas
reçu d'accusé assez vite : plusieurs exemplaires peuvent arriver EN MÊME
TEMPS. La confirmation lisait le paiement PENDING sans verrou, le passait en
COMPLETED sans condition et recalculait `invoices.paid_amount` par
lecture-écriture : deux notifications simultanées pouvaient créditer deux fois
la facture. Chaque paiement ne doit compter qu'une seule fois.

PostgreSQL uniquement : la concurrence réelle (verrous, transactions) n'existe
pas sur SQLite.
"""
import hashlib
import hmac
import threading
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Concurrence réelle : PostgreSQL")

URL = "/api/v1/parents/payments/webhook/paytech/"
SECRET = "secret-de-test-paytech"
TOTAL = 150_000.0


@pytest.fixture
def ctx():
    tid, sid, iid = (str(uuid.uuid4()) for _ in range(3))
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École IPN", slug=f"ipn-{tid[:12]}", type="primary", country="GN",
                      is_active=True, settings={"paytechApiKey": "cle", "paytechSecretKey": SECRET}))
        db.flush()
        db.add(Student(id=sid, tenant_id=tid, registration_number=f"IPN-{tid[:12]}", first_name="Aïcha",
                       last_name="Sow", date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE,
                       status=StudentStatus.ACTIVE))
        db.flush()
        db.add(Invoice(id=iid, tenant_id=tid, student_id=sid, invoice_number=f"FAC-{tid[:12]}",
                       issue_date=date.today(), due_date=date.today(), subtotal=TOTAL, total_amount=TOTAL,
                       paid_amount=0.0, status=InvoiceStatus.PENDING))
        db.commit()
    yield {"tid": tid, "sid": sid, "iid": iid}


def _pending(ctx, amount: float) -> str:
    ref = f"PT-{uuid.uuid4().hex[:12]}"
    with SessionLocal() as db:
        db.add(Payment(id=str(uuid.uuid4()), tenant_id=ctx["tid"], student_id=ctx["sid"], invoice_id=ctx["iid"],
                       amount=amount, currency="GNF", payment_date=date.today(),
                       payment_method=PaymentMethod.MOBILE_MONEY, status=PaymentStatus.PENDING, reference=ref))
        db.commit()
    return ref


def _notification(ref: str, amount: float, *, secret: str = SECRET) -> dict:
    return {
        "ref_command": ref, "type_event": "sale_complete", "item_price": str(int(amount)),
        "hash": hmac.new(secret.encode(), ref.encode(), hashlib.sha256).hexdigest(),
    }


def _invoice(ctx) -> tuple[float, str]:
    with SessionLocal() as db:
        inv = db.query(Invoice).filter(Invoice.id == ctx["iid"]).one()
        return float(inv.paid_amount), getattr(inv.status, "value", inv.status)


def _payment_status(ref: str) -> str:
    with SessionLocal() as db:
        p = db.query(Payment).filter(Payment.reference == ref).one()
        return getattr(p.status, "value", p.status)


def test_simultaneous_duplicate_notifications_credit_the_invoice_once(ctx, monkeypatch):
    # Élargit la fenêtre entre la lecture du paiement PENDING et sa mise à
    # jour (contrôle du montant ralenti), comme sous charge ou base lente :
    # sans verrou, chaque notification voit encore PENDING et crédite.
    import time
    from app.api.v1.endpoints.operational import parents
    original = parents._gateway_amount_matches

    def slow_amount_check(expected, received):
        time.sleep(0.5)
        return original(expected, received)

    monkeypatch.setattr(parents, "_gateway_amount_matches", slow_amount_check)
    ref = _pending(ctx, TOTAL)
    barrier = threading.Barrier(4)
    statuses: list[int] = []

    def send():
        barrier.wait()
        statuses.append(client.post(URL, json=_notification(ref, TOTAL)).status_code)

    threads = [threading.Thread(target=send) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert statuses == [200] * 4  # le fournisseur reçoit toujours un accusé
    assert _invoice(ctx) == (TOTAL, "PAID")
    assert _payment_status(ref) == "COMPLETED"


def test_late_replay_does_not_credit_twice(ctx):
    ref = _pending(ctx, 50_000)
    assert client.post(URL, json=_notification(ref, 50_000)).status_code == 200
    assert _invoice(ctx) == (50_000, "PARTIAL")

    assert client.post(URL, json=_notification(ref, 50_000)).status_code == 200

    assert _invoice(ctx) == (50_000, "PARTIAL")


def test_two_distinct_payments_are_both_counted(ctx):
    first, second = _pending(ctx, 100_000), _pending(ctx, 50_000)
    client.post(URL, json=_notification(first, 100_000))
    client.post(URL, json=_notification(second, 50_000))
    assert _invoice(ctx) == (TOTAL, "PAID")


def test_altered_amount_is_not_confirmed(ctx):
    ref = _pending(ctx, TOTAL)
    client.post(URL, json=_notification(ref, 1_000))
    assert _invoice(ctx) == (0.0, "PENDING")
    assert _payment_status(ref) == "PENDING"


def test_bad_signature_is_not_confirmed(ctx):
    ref = _pending(ctx, TOTAL)
    client.post(URL, json=_notification(ref, TOTAL, secret="mauvais-secret"))
    assert _invoice(ctx) == (0.0, "PENDING")
    assert _payment_status(ref) == "PENDING"


def test_two_workers_confirming_the_same_payment_credit_it_once(ctx, monkeypatch):
    """En production l'API tourne avec plusieurs workers : deux notifications
    identiques peuvent être traitées en même temps par deux processus, chacun
    avec sa propre connexion. Reproduit ici avec deux threads et deux
    sessions, et une fenêtre élargie entre lecture et mise à jour."""
    import time
    from app.api.v1.endpoints.operational import parents
    from app.core.tenant_resolution import enter_tenant_context_or_404

    original = parents._gateway_amount_matches

    def slow_amount_check(expected, received):
        time.sleep(0.5)
        return original(expected, received)

    monkeypatch.setattr(parents, "_gateway_amount_matches", slow_amount_check)
    ref = _pending(ctx, TOTAL)
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def worker():
        try:
            with SessionLocal() as db:
                enter_tenant_context_or_404(db, ctx["tid"])
                barrier.wait()
                if parents._confirm_gateway_payment(db, ref, TOTAL):
                    db.commit()
                else:
                    db.rollback()
        except BaseException as exc:  # remonté au test
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not errors, errors
    assert _invoice(ctx) == (TOTAL, "PAID")  # et non 300 000 GNF crédités
    assert _payment_status(ref) == "COMPLETED"


def test_two_workers_confirming_two_payments_of_one_invoice_lose_nothing(ctx, monkeypatch):
    """Deux paiements DIFFÉRENTS d'une même facture (deux échéances) confirmés
    en même temps : `paid_amount` recalculé par lecture-écriture perdait l'un
    des deux (0 + 100 000 puis 0 + 50 000 → 50 000 au lieu de 150 000)."""
    import time
    from app.api.v1.endpoints.operational import parents
    from app.core.tenant_resolution import enter_tenant_context_or_404

    original = parents._gateway_amount_matches

    def slow_amount_check(expected, received):
        time.sleep(0.5)
        return original(expected, received)

    monkeypatch.setattr(parents, "_gateway_amount_matches", slow_amount_check)
    payments = [(_pending(ctx, 100_000), 100_000), (_pending(ctx, 50_000), 50_000)]
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def worker(ref, amount):
        try:
            with SessionLocal() as db:
                enter_tenant_context_or_404(db, ctx["tid"])
                barrier.wait()
                if parents._confirm_gateway_payment(db, ref, amount):
                    db.commit()
                else:
                    db.rollback()
        except BaseException as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=p) for p in payments]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not errors, errors
    assert _invoice(ctx) == (TOTAL, "PAID")
    assert {_payment_status(ref) for ref, _ in payments} == {"COMPLETED"}

