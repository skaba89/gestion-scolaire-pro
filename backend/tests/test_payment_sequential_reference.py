"""Sequential receipt/payment reference numbering (REC-{year}-{seq}).

docs/PAYMENTS_READINESS.md flagged the previous random-hex default
(PAY-{hex}) as potentially insufficient for legal accounting, "à
clarifier avec le premier client". Built on a documented, reasonable
default assumption (per-tenant, per-calendar-year counter) rather than
left unbuilt indefinitely — additive: a caller-supplied `reference` still
overrides it entirely, and every existing payment keeps its old
reference untouched.
"""
import uuid
from datetime import date, timedelta

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from app.models.payment_reference_counter import PaymentReferenceCounter  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="payment_reference_counters uses gen_random_uuid()/ON CONFLICT (Postgres-only).",
)

REGISTER_URL = "/api/v1/payments/register/"


def _make_tenant(name: str = "École Reçu Séquentiel") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"seq-ref-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_invoice(tenant_id: str, *, total: float = 100000.0) -> tuple[str, str]:
    student_id = str(uuid.uuid4())
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{uuid.uuid4().hex[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
            issue_date=date.today(), due_date=date.today() + timedelta(days=30),
            subtotal=total, total_amount=total, paid_amount=0.0,
            currency="GNF", status=InvoiceStatus.PENDING,
        ))
        db.commit()
    return student_id, invoice_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


class TestSequentialReference:
    def test_default_reference_is_sequential_format(self):
        tenant_id = _make_tenant()
        _, invoice_id = _make_invoice(tenant_id)
        resp = client.post(
            REGISTER_URL,
            json={"invoice_id": invoice_id, "amount": 50000.0, "method": "CASH"},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        reference = resp.json()["reference"]
        year = date.today().year
        assert reference.startswith(f"REC-{year}-")
        # REC-{year}-{seq:05d}-{tenant_short} — the trailing tenant_short
        # exists only to keep the platform-wide unique constraint on
        # payments.reference satisfied (see _next_payment_reference).
        seq_part = reference.split("-")[2]
        assert seq_part.isdigit()
        assert len(seq_part) == 5

    def test_consecutive_payments_increment_the_counter(self):
        tenant_id = _make_tenant()
        _, inv1 = _make_invoice(tenant_id, total=200000.0)
        _, inv2 = _make_invoice(tenant_id, total=200000.0)
        headers = _admin_headers(tenant_id)

        r1 = client.post(REGISTER_URL, json={"invoice_id": inv1, "amount": 10000.0, "method": "CASH"}, headers=headers)
        r2 = client.post(REGISTER_URL, json={"invoice_id": inv2, "amount": 10000.0, "method": "CASH"}, headers=headers)
        assert r1.status_code == 201 and r2.status_code == 201

        seq1 = int(r1.json()["reference"].split("-")[2])
        seq2 = int(r2.json()["reference"].split("-")[2])
        assert seq2 == seq1 + 1

    def test_explicit_reference_still_overrides_default(self):
        """The caller can still supply their own reference — the sequential
        default never forces itself when a reference is explicitly given."""
        tenant_id = _make_tenant()
        _, invoice_id = _make_invoice(tenant_id)
        # payments.reference has a platform-wide unique constraint — a
        # literal reused across runs against a persistent DB (this suite's
        # Postgres run isn't reset between invocations) would collide with
        # itself on a second run.
        custom_ref = f"CUSTOM-REF-{uuid.uuid4().hex[:8]}"
        resp = client.post(
            REGISTER_URL,
            json={"invoice_id": invoice_id, "amount": 10000.0, "method": "CASH", "reference": custom_ref},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["reference"] == custom_ref

        with SessionLocal() as db:
            # Supplying an explicit reference must not consume a sequence number.
            counter = db.query(PaymentReferenceCounter).filter(PaymentReferenceCounter.tenant_id == tenant_id).first()
            assert counter is None

    def test_counters_are_isolated_per_tenant(self):
        tenant_a = _make_tenant("École Séquence A")
        tenant_b = _make_tenant("École Séquence B")
        _, inv_a = _make_invoice(tenant_a)
        _, inv_b = _make_invoice(tenant_b)

        r_a = client.post(REGISTER_URL, json={"invoice_id": inv_a, "amount": 5000.0, "method": "CASH"}, headers=_admin_headers(tenant_a))
        r_b = client.post(REGISTER_URL, json={"invoice_id": inv_b, "amount": 5000.0, "method": "CASH"}, headers=_admin_headers(tenant_b))
        assert r_a.status_code == 201 and r_b.status_code == 201

        # Both start their own sequence at 1 -- a new tenant is never
        # affected by another tenant's payment volume. References still
        # differ overall (trailing tenant_short), satisfying the
        # platform-wide unique constraint on payments.reference.
        assert r_a.json()["reference"].split("-")[2] == "00001"
        assert r_b.json()["reference"].split("-")[2] == "00001"
        assert r_a.json()["reference"] != r_b.json()["reference"]

    def test_existing_payments_keep_their_old_reference_format(self):
        """Non-regression: a payment created before this change (or with an
        explicit legacy-style reference) is never rewritten."""
        tenant_id = _make_tenant()
        _, invoice_id = _make_invoice(tenant_id)
        legacy_ref = f"PAY-{uuid.uuid4().hex[:8].upper()}"
        resp = client.post(
            REGISTER_URL,
            json={"invoice_id": invoice_id, "amount": 10000.0, "method": "CASH", "reference": legacy_ref},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["reference"] == legacy_ref
