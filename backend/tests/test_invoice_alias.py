"""POST /invoices/ (aliases.py::create_invoice_alias) — regression test.

Found during a real end-to-end Playwright run (Phase 6, national
commercialisation brief): this raw-SQL INSERT omitted `id` and `subtotal`,
both NOT NULL columns on `invoices` with no server-side default —
every single call to this endpoint failed with a 500 IntegrityError,
meaning billing was silently broken end-to-end regardless of payload.
"""
import datetime
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="invoices has NOT NULL constraints only enforced by real Postgres.",
)

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/invoices/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant_and_student() -> tuple[str, str]:
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Facture Test", slug=f"invoice-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.add(Student(
            id=student_id, tenant_id=tenant_id, first_name="Fatoumata", last_name="Diallo",
            registration_number=f"REG-{uuid.uuid4().hex[:6]}", status=StudentStatus.ACTIVE,
            date_of_birth=datetime.date(2012, 1, 1), gender=Gender.FEMALE,
        ))
        db.commit()
    return tenant_id, student_id


class TestCreateInvoiceAlias:
    def test_minimal_payload_creates_invoice(self):
        """Regression: previously a 500 IntegrityError on every call, even
        with a valid minimal payload — subtotal/id were never in the INSERT."""
        tenant_id, student_id = _make_tenant_and_student()
        resp = client.post(
            URL, json={"student_id": student_id, "total_amount": 75000.0},
            headers=_as(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["invoice_id"]
        assert body["invoice_number"].startswith("INV-")

        with SessionLocal() as db:
            invoice = db.query(Invoice).filter(Invoice.id == body["invoice_id"]).first()
            assert invoice is not None
            assert invoice.subtotal == 75000.0
            assert invoice.total_amount == 75000.0
            assert invoice.tenant_id is not None

    def test_explicit_due_date_and_invoice_number_are_respected(self):
        tenant_id, student_id = _make_tenant_and_student()
        resp = client.post(
            URL,
            json={
                "student_id": student_id, "total_amount": 30000.0,
                "invoice_number": f"CUSTOM-{uuid.uuid4().hex[:8]}",
                "due_date": "2026-12-01",
            },
            headers=_as(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["invoice_number"].startswith("CUSTOM-")

        with SessionLocal() as db:
            invoice = db.query(Invoice).filter(Invoice.id == body["invoice_id"]).first()
            assert str(invoice.due_date) == "2026-12-01"

    def test_missing_tenant_context_is_rejected_not_500(self):
        student_id = str(uuid.uuid4())
        user = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
        app.dependency_overrides[get_current_user] = lambda: user
        resp = client.post(URL, json={"student_id": student_id, "total_amount": 1000.0}, headers=HEADERS)
        assert resp.status_code in (400, 403, 404)
