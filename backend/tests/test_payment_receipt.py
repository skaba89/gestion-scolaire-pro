"""Reçu de paiement (GET /payments/{id}/receipt/) — national audit Phase 5
(paiements locaux Guinée).

The audit's absolute rules for this phase require numbered receipts and
tenant-scoped access; nothing in the codebase produced a receipt at all
before this endpoint (payments.py had list/register/reverse but no receipt
view). Follows the exact base64-encoded-HTML pattern already used and
proven for bulletins (school_life.py:generate-report-card/v2/) rather than
introducing a new PDF rendering dependency.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    """A module-level teardown_function() only fires for bare test
    functions, NOT for methods inside a `class Test...:` block — it would
    silently leak get_current_user's override into every test file that
    runs afterward in the same pytest session (national audit finding).
    An autouse fixture tears down reliably in both cases."""
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _build_payment(*, tenant_name: str = "École Reçu Test", status: PaymentStatus = PaymentStatus.COMPLETED):
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    payment_id = str(uuid.uuid4())

    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=tenant_name, slug=f"receipt-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()

        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Ibrahima", last_name="Sow",
            date_of_birth=date(2010, 3, 15), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()

        db.add(Payment(
            id=payment_id, tenant_id=tenant_id, student_id=student_id,
            amount=250000.0, currency="GNF", payment_date=date(2026, 7, 1),
            payment_method=PaymentMethod.MOBILE_MONEY, status=status,
            reference=f"PAY-2026-{payment_id[:8].upper()}",
        ))
        db.commit()

    return {"tenant_id": tenant_id, "payment_id": payment_id}


class TestPaymentReceipt:
    def test_receipt_returns_numbered_html_receipt(self):
        ctx = _build_payment()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(f"/api/v1/payments/{ctx['payment_id']}/receipt/", headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["format"] == "html"
        assert data["receipt_number"].startswith("PAY-2026-")

        import base64
        html = base64.b64decode(data["html"]).decode("utf-8")
        assert "Ibrahima" in html
        assert "École Reçu Test" in html
        assert "250,000 GNF" in html

    def test_reversed_payment_receipt_shows_cancellation(self):
        ctx = _build_payment(status=PaymentStatus.REVERSED)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(f"/api/v1/payments/{ctx['payment_id']}/receipt/", headers=headers)
        assert resp.status_code == 200, resp.text

        import base64
        html = base64.b64decode(resp.json()["html"]).decode("utf-8")
        assert "annulé" in html

    def test_receipt_requires_payments_read_permission(self):
        ctx = _build_payment()
        # STUDENT has no payments:read.
        headers = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": ctx["tenant_id"]})

        resp = client.get(f"/api/v1/payments/{ctx['payment_id']}/receipt/", headers=headers)
        assert resp.status_code == 403, resp.text

    def test_receipt_cannot_be_fetched_across_tenants(self):
        """A payment id guessed by another tenant's admin must 404, not
        leak the receipt — payments:read is a real permission but the WHERE
        tenant_id=:tid clause must still hold per-row."""
        ctx = _build_payment()
        other_tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=other_tenant_id, name="Autre École", slug=f"other-{other_tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": other_tenant_id})
        resp = client.get(f"/api/v1/payments/{ctx['payment_id']}/receipt/", headers=headers)
        assert resp.status_code == 404, resp.text

    def test_receipt_404_for_unknown_payment(self):
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Inconnue", slug=f"unknown-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"/api/v1/payments/{uuid.uuid4()}/receipt/", headers=headers)
        assert resp.status_code == 404, resp.text


class TestPaymentsExport:
    """GET /payments/export/ — Phase 1 commercialisation (national audit) :
    seuls les agrégats /analytics/ étaient exportables avant ce commit,
    jamais la liste brute des paiements — une école demande souvent un
    export brut pour son comptable, pas seulement des KPI agrégés."""

    def test_export_returns_csv_with_expected_row(self):
        ctx = _build_payment()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get("/api/v1/payments/export/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/csv")
        assert "attachment" in resp.headers.get("content-disposition", "")

        body = resp.text
        assert "reference,date,eleve" in body
        assert "Ibrahima Sow" in body
        assert "250000.0" in body or "250000" in body

    def test_export_requires_payments_read_permission(self):
        ctx = _build_payment()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": ctx["tenant_id"]})

        resp = client.get("/api/v1/payments/export/", headers=headers)
        assert resp.status_code == 403, resp.text

    def test_export_never_leaks_another_tenants_payments(self):
        ctx_a = _build_payment(tenant_name="École Export A")
        ctx_b = _build_payment(tenant_name="École Export B")

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx_a["tenant_id"]})
        resp = client.get("/api/v1/payments/export/", headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            other_payment = db.query(Payment).filter(Payment.id == ctx_b["payment_id"]).first()
            assert other_payment.reference not in resp.text

    def test_export_filters_by_status(self):
        ctx = _build_payment(status=PaymentStatus.REVERSED)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get("/api/v1/payments/export/", params={"status": "COMPLETED"}, headers=headers)
        assert resp.status_code == 200, resp.text
        with SessionLocal() as db:
            payment = db.query(Payment).filter(Payment.id == ctx["payment_id"]).first()
            assert payment.reference not in resp.text  # REVERSED, filtered out by status=COMPLETED
