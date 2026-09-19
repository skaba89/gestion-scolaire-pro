"""POST /payment-schedules/ (finance/payment_schedules.py) —
institutional-readiness audit, 2026-09.

create_payment_schedules() hard-codes tenant_id from the caller (good) but
never verified invoice_id belongs to that tenant before inserting. A
holder of payments:write in tenant A could point a schedule at tenant B's
invoice_id — the row would carry tenant_id=A, but list_payment_schedules'
own LEFT JOIN invoices (no tenant check on the join) would then mix
tenant B's invoice data into tenant A's ledger.

Raw SQL uses ::date/::timestamptz casts and ANY() array binds —
Postgres-only, same pattern as test_invoice_deletion_payment_history.py."""
import uuid
from datetime import date, timedelta

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL uses ::date/::timestamptz casts and ANY() array binds — Postgres-only.",
)

BASE = "/api/v1/payment-schedules"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant_with_invoice(*, total_amount: float = 100000.0) -> dict:
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Échéancier Test", slug=f"sched-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{student_id[:8]}",
            first_name="Fatoumata", last_name="Diallo",
            date_of_birth=date(2011, 5, 20), gender=Gender.FEMALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{invoice_id[:8]}",
            issue_date=date(2026, 1, 1), due_date=date(2026, 1, 1) + timedelta(days=30),
            subtotal=total_amount, total_amount=total_amount, paid_amount=0.0,
            status=InvoiceStatus.DRAFT,
        ))
        db.commit()
    return {"tenant_id": tenant_id, "invoice_id": invoice_id}


class TestCreatePaymentScheduleRejectsCrossTenantInvoice:
    def test_invoice_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant_with_invoice()
        tenant_b = _make_tenant_with_invoice()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a["tenant_id"]})

        resp = client.post(f"{BASE}/", json=[{
            "invoice_id": tenant_b["invoice_id"], "installment_number": 1,
            "amount": 50000.0, "due_date": "2026-02-01",
        }], headers=headers)
        assert resp.status_code == 404, resp.text

        with SessionLocal() as db:
            from sqlalchemy import text
            count = db.execute(text(
                "SELECT COUNT(*) FROM payment_schedules WHERE invoice_id = :iid"
            ), {"iid": tenant_b["invoice_id"]}).scalar()
        assert count == 0, "no schedule should have been created against the foreign invoice"

    def test_own_tenant_invoice_is_accepted(self):
        ctx = _make_tenant_with_invoice()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.post(f"{BASE}/", json=[{
            "invoice_id": ctx["invoice_id"], "installment_number": 1,
            "amount": 50000.0, "due_date": "2026-02-01",
        }], headers=headers)
        assert resp.status_code == 201, resp.text
        assert len(resp.json()["ids"]) == 1
