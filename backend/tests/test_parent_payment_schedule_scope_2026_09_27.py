"""Follow-up to the ID-parameter ownership audit (docs/PERMISSIONS_MATRIX.md,
PRs #236/#240/#241/#242). Found by a background audit pass over modules not
yet covered by that methodology.

Real bug: operational/parents.py::list_parent_payment_schedules
(GET /parents/payment-schedules/) only applied its "scope to the parent's
own children" check in the `if not student_id` branch — passing an
explicit ?student_id=<any student in the tenant> skipped that check
entirely and returned that student's payment schedule (installment
amounts, due dates, status) regardless of the caller, unlike every sibling
endpoint in the same file (e.g. create_parent_payment), which verifies
`parent_students` linkage before touching a student_id.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="payment_schedules is a raw-SQL operational table (app/core/operational_tables.py).",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Payment Schedule Scope Test", slug=f"pss-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@pss-test.example",
            username=f"u-{user_id[:8]}", first_name="Test", last_name="Parent",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"{reg}-{student_id[:8]}",
            first_name="Test", last_name="Élève",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _link_parent(tenant_id: str, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id, parent_id=parent_id,
            student_id=student_id, is_primary=True,
        ))
        db.commit()


def _make_invoice(tenant_id: str, student_id: str) -> str:
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{invoice_id[:8]}", issue_date=date(2026, 9, 1),
            due_date=date(2026, 10, 1), subtotal=500000, total_amount=500000,
            status=InvoiceStatus.PENDING,
        ))
        db.commit()
    return invoice_id


def _make_payment_schedule(tenant_id: str, invoice_id: str) -> str:
    schedule_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO payment_schedules (id, tenant_id, invoice_id, installment_number, amount, due_date, status)
            VALUES (:id, :tid, :inv, 1, 250000, '2026-10-01', 'PENDING')
        """), {"id": schedule_id, "tid": tenant_id, "inv": invoice_id})
        db.commit()
    return schedule_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@requires_postgres
class TestParentPaymentScheduleListScoping:
    def test_parent_cannot_list_another_familys_schedule_by_student_id(self):
        tenant_id = _make_tenant()
        own_parent = _make_user(tenant_id)
        other_parent = _make_user(tenant_id)
        own_child = _make_student(tenant_id, reg="S1")
        other_child = _make_student(tenant_id, reg="S2")
        _link_parent(tenant_id, own_parent, own_child)
        _link_parent(tenant_id, other_parent, other_child)
        invoice_id = _make_invoice(tenant_id, other_child)
        _make_payment_schedule(tenant_id, invoice_id)

        resp = _as({"id": own_parent, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/parents/payment-schedules/", params={"student_id": other_child}, headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []
        assert resp.json()["total"] == 0

    def test_parent_can_list_their_own_childs_schedule_by_student_id(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        child_id = _make_student(tenant_id, reg="S3")
        _link_parent(tenant_id, parent_id, child_id)
        invoice_id = _make_invoice(tenant_id, child_id)
        _make_payment_schedule(tenant_id, invoice_id)

        resp = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/parents/payment-schedules/", params={"student_id": child_id}, headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 1

    def test_parent_with_no_student_id_sees_only_their_own_children(self):
        tenant_id = _make_tenant()
        own_parent = _make_user(tenant_id)
        other_parent = _make_user(tenant_id)
        own_child = _make_student(tenant_id, reg="S4")
        other_child = _make_student(tenant_id, reg="S5")
        _link_parent(tenant_id, own_parent, own_child)
        _link_parent(tenant_id, other_parent, other_child)
        own_invoice = _make_invoice(tenant_id, own_child)
        other_invoice = _make_invoice(tenant_id, other_child)
        _make_payment_schedule(tenant_id, own_invoice)
        _make_payment_schedule(tenant_id, other_invoice)

        resp = _as({"id": own_parent, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/parents/payment-schedules/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 1
