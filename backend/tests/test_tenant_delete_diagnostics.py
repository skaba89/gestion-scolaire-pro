"""Irreversible tenant deletion fails before any commit or cascade is attempted."""
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Tenant  # noqa: E402


@pytest.fixture
def school():
    tid = uuid4()
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="Retention guard", slug=f"retain-{tid}", type="primary"))
        db.commit()
    actor = {"id": str(uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
    app.dependency_overrides[get_current_user] = lambda: actor
    yield tid, actor
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("fault", [IntegrityError("DELETE", {}, Exception("private SQL diagnostic")), RuntimeError("unexpected")])
def test_retention_guard_never_attempts_to_commit_a_delete(school, monkeypatch, fault):
    tid, _ = school
    def fail_if_commit(self, *args, **kwargs):
        raise fault
    monkeypatch.setattr(Session, "commit", fail_if_commit)
    response = client.delete(f"/api/v1/tenants/{tid}/", headers={"Authorization": "Bearer mock-token"})
    assert response.status_code == 409, response.text
    assert "private SQL" not in response.text
    assert "restauration" in response.json()["detail"]
    with SessionLocal() as db:
        assert db.get(Tenant, tid) is not None


@pytest.mark.parametrize("active", [False, True])
def test_even_empty_or_inactive_tenant_cannot_be_erased(school, active):
    tid, _ = school
    with SessionLocal() as db:
        db.get(Tenant, tid).is_active = active
        db.commit()
    response = client.delete(f"/api/v1/tenants/{tid}/", headers={"Authorization": "Bearer mock-token"})
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(Tenant, tid).is_active is active


@pytest.mark.parametrize("role", ["TENANT_ADMIN", "DIRECTOR", "SECRETARY", "ACCOUNTANT", "TEACHER", "PARENT", "STUDENT"])
def test_only_super_admin_reaches_retention_guard(school, role):
    tid, actor = school
    actor.update(roles=[role], tenant_id=str(tid))
    response = client.delete(f"/api/v1/tenants/{tid}/", headers={"Authorization": "Bearer mock-token"})
    assert response.status_code == 403, response.text
    with SessionLocal() as db:
        assert db.get(Tenant, tid) is not None


def test_unknown_tenant_is_not_found(school):
    response = client.delete(f"/api/v1/tenants/{uuid4()}/", headers={"Authorization": "Bearer mock-token"})
    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_deactivation_and_reactivation_preserve_financial_history_and_other_school(school):
    from datetime import date
    from app.models import Student
    from app.models.payment import Invoice, Payment
    from app.api.v1.endpoints.core.tenants import toggle_tenant_status
    tid, actor = school
    student, invoice, payment, other = (uuid4() for _ in range(4))
    with SessionLocal() as db:
        db.add(Tenant(id=other, name="Other institution", slug=f"other-retain-{other}", type="primary"))
        db.add(Student(id=student, tenant_id=tid, registration_number=str(student),
                       first_name="Aminata", last_name="Camara", gender="FEMALE", date_of_birth=date(2012, 1, 1)))
        db.flush()
        db.add(Invoice(id=invoice, tenant_id=tid, student_id=student, invoice_number=str(invoice),
                       issue_date=date(2026, 11, 1), due_date=date(2026, 12, 1),
                       subtotal=100000, total_amount=100000, paid_amount=50000))
        db.flush()
        db.add(Payment(id=payment, tenant_id=tid, student_id=student, invoice_id=invoice,
                       amount=50000, payment_method="CASH", status="REVERSED", payment_date=date(2026, 11, 14)))
        db.commit()
    response = client.delete(f"/api/v1/tenants/{tid}/", headers={"Authorization": "Bearer mock-token"})
    assert response.status_code == 409
    for active in (False, True):
        with SessionLocal() as db:
            tenant = await toggle_tenant_status(tid, db, actor)
            assert tenant.is_active is active
        with SessionLocal() as db:
            assert db.get(Student, student).tenant_id == tid
            assert db.get(Invoice, invoice).paid_amount == 50000
            assert db.get(Payment, payment).invoice_id == invoice
            assert db.get(Payment, payment).status.value == "REVERSED"
            assert db.get(Tenant, other).is_active


@pytest.mark.skipif(engine.dialect.name != "postgresql",
                    reason="Requires PostgreSQL RLS")
@pytest.mark.asyncio
async def test_retention_guard_under_non_bypass_rls_role(school):
    from sqlalchemy import text
    from app.core.database import engine, switch_tenant_context
    from app.api.v1.endpoints.core.tenants import delete_tenant
    from fastapi import HTTPException
    tid, actor = school
    role = "tenant_retention_" + uuid4().hex
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
    try:
        with SessionLocal() as db:
            db.execute(text(f'SET LOCAL ROLE "{role}"'))
            assert db.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).one() == (False, False)
            assert db.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='students'::regclass")).scalar_one()
            switch_tenant_context(db, str(tid))
            with pytest.raises(HTTPException) as exc:
                await delete_tenant(tid, db, actor)
            assert exc.value.status_code == 409
        with SessionLocal() as db:
            assert db.get(Tenant, tid) is not None
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))
