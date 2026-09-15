"""Role-based restriction on the "payments" resource type in
GET /api/v1/search/ (institutional-readiness audit, 2026-09).

Before this fix, global_search() had no role-based filtering at all — it
only checked tenant scoping. Any authenticated tenant user (STUDENT,
PARENT, ALUMNI included) could pass ?types=payments and get back OTHER
families' payment references and amounts, tenant-wide. PARENT does hold
payments:read, but that grant is for viewing their OWN children's
payments via a properly scoped endpoint elsewhere — this search has no
per-student ownership filter, so PARENT must not reach it either.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/search/"


def _make_tenant_with_payment() -> str:
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Search Test", slug=f"search-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"SEARCH-{student_id[:8]}",
            first_name="Test", last_name="Student",
            date_of_birth=date(2010, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
        db.add(Payment(
            tenant_id=tenant_id, student_id=student_id, amount=50000,
            payment_date=date(2026, 9, 1), payment_method=PaymentMethod.CASH,
            status=PaymentStatus.COMPLETED, reference=f"PAY-CONFIDENTIAL-{student_id[:8]}",
        ))
        db.commit()
    return tenant_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestPaymentsSearchRestricted:
    def test_student_search_excludes_payments(self):
        tenant_id = _make_tenant_with_payment()
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).get(URL, params={"q": "PAY-CONFIDENTIAL", "types": "payments"}, headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_search_excludes_payments_despite_holding_payments_read(self):
        tenant_id = _make_tenant_with_payment()
        parent = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent).get(URL, params={"q": "PAY-CONFIDENTIAL", "types": "payments"}, headers=HEADERS)
        assert resp.status_code == 403

    def test_mixed_types_silently_drops_payments_for_unprivileged_role(self):
        tenant_id = _make_tenant_with_payment()
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).get(
            URL, params={"q": "test", "types": "students,payments"}, headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert "payments" not in resp.json()["types_searched"]

    # global_search()'s raw SQL casts id::text — Postgres-only syntax, so a
    # non-privileged role's request never even reaches it (blocked earlier
    # by the role filter above and thus safe to assert on any backend),
    # but a privileged role's actual query execution only works on Postgres.
    @pytest.mark.skipif(
        engine.dialect.name != "postgresql",
        reason="global_search()'s raw SQL uses Postgres-only casts (id::text). "
               "Exercised by the CI Postgres job.",
    )
    def test_tenant_admin_can_search_payments(self):
        tenant_id = _make_tenant_with_payment()
        admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
        resp = _as(admin).get(URL, params={"q": "PAY-CONFIDENTIAL", "types": "payments"}, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["results"]["payments"]["count"] == 1

    @pytest.mark.skipif(
        engine.dialect.name != "postgresql",
        reason="global_search()'s raw SQL uses Postgres-only casts (id::text). "
               "Exercised by the CI Postgres job.",
    )
    def test_accountant_can_search_payments(self):
        tenant_id = _make_tenant_with_payment()
        accountant = {"id": str(uuid.uuid4()), "roles": ["ACCOUNTANT"], "tenant_id": tenant_id}
        resp = _as(accountant).get(URL, params={"q": "PAY-CONFIDENTIAL", "types": "payments"}, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["results"]["payments"]["count"] == 1
