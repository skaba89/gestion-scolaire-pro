"""Employee deletion must preserve employment, leave and payroll history."""
from datetime import date
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Employee, Contract, LeaveRequest, Payslip  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

BASE = "/api/v1/hr/employees"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture
def school():
    tenant_id, other_id, employee_id = (uuid4() for _ in range(3))
    with SessionLocal() as db:
        for tid in (tenant_id, other_id):
            db.add(Tenant(id=tid, name="HR history", slug=f"hr-history-{tid}",
                          type="secondary", country="GN"))
        db.flush()
        db.add(Employee(id=employee_id, tenant_id=tenant_id, employee_number=str(uuid4()),
                        first_name="Fatoumata", last_name="Diallo", hire_date=date(2025, 9, 1)))
        db.commit()
    user = {"id": str(uuid4()), "tenant_id": str(tenant_id), "roles": ["TENANT_ADMIN"]}
    app.dependency_overrides[get_current_user] = lambda: user
    yield tenant_id, other_id, employee_id, user
    app.dependency_overrides.pop(get_current_user, None)


def add_history(tenant_id, employee_id, kind):
    fields = dict(id=uuid4(), tenant_id=tenant_id, employee_id=employee_id)
    if kind == "contract":
        record = Contract(**fields, contract_number=str(uuid4()), contract_type="CDD",
                          start_date=date(2025, 9, 1), end_date=date(2026, 6, 30),
                          job_title="Enseignant", gross_monthly_salary=2500000, is_current=False)
    elif kind == "payslip":
        record = Payslip(**fields, period_month=6, period_year=2026, gross_salary=2500000,
                         net_salary=2200000, pay_date=date(2026, 6, 30), is_final="true")
    else:
        record = LeaveRequest(**fields, leave_type="CONGE_PAYE", start_date=date(2026, 5, 1),
                              end_date=date(2026, 5, 2), total_days=2, status="APPROVED")
    with SessionLocal() as db:
        db.add(record)
        db.commit()
        return type(record), record.id


@pytest.mark.parametrize("kind", ["contract", "payslip", "leave"])
def test_employee_with_history_cannot_be_deleted(school, kind):
    tenant, _, employee, _ = school
    model, record_id = add_history(tenant, employee, kind)
    response = client.delete(f"{BASE}/{employee}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(Employee, employee) is not None
        record = db.get(model, record_id)
        assert record is not None
        if kind == "payslip":
            assert record.net_salary == 2200000
        if kind == "contract":
            assert record.is_current is False
    # A refusal must not retain the transaction/lock or break the next read.
    assert client.get(f"{BASE}/{employee}/", headers=HEADERS).status_code == 200


def test_empty_employee_can_be_deleted(school):
    _, _, employee, _ = school
    response = client.delete(f"{BASE}/{employee}/", headers=HEADERS)
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        assert db.get(Employee, employee) is None


def test_missing_employee_returns_not_found(school):
    assert client.delete(f"{BASE}/{uuid4()}/", headers=HEADERS).status_code == 404


def test_foreign_employee_is_hidden_and_history_preserved(school):
    tenant, other, employee, user = school
    model, record_id = add_history(tenant, employee, "payslip")
    user["tenant_id"] = str(other)
    response = client.delete(f"{BASE}/{employee}/", headers=HEADERS)
    assert response.status_code == 404, response.text
    with SessionLocal() as db:
        assert db.get(Employee, employee) is not None
        assert db.get(model, record_id).net_salary == 2200000


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER", "ALUMNI"])
def test_unprivileged_role_cannot_delete_employee(school, role):
    _, _, employee, user = school
    user["roles"] = [role]
    assert client.delete(f"{BASE}/{employee}/", headers=HEADERS).status_code == 403
    with SessionLocal() as db:
        assert db.get(Employee, employee) is not None


def test_deactivation_preserves_history_and_does_not_allow_deletion(school):
    tenant, _, employee, _ = school
    records = [add_history(tenant, employee, kind) for kind in ("contract", "payslip", "leave")]
    response = client.put(f"{BASE}/{employee}/", json={"is_active": False}, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is False
    response = client.delete(f"{BASE}/{employee}/", headers=HEADERS)
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.get(Employee, employee).is_active is False
        for model, record_id in records:
            assert db.get(model, record_id) is not None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL FK row locks")
def test_concurrent_committed_contract_prevents_employee_deletion(school):
    """Observe a real lock wait, then commit the child and retain both rows."""
    from concurrent.futures import ThreadPoolExecutor
    from queue import Queue
    from time import monotonic, sleep
    from sqlalchemy import text
    from app.crud.hr import delete_employee, EmployeeHasProtectedHistory

    tenant, _, employee, _ = school
    pids = Queue()

    def remove_in_another_transaction():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            with pytest.raises(EmployeeHasProtectedHistory):
                delete_employee(db, employee, tenant)
            return True

    with SessionLocal() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        contract = Contract(tenant_id=tenant, employee_id=employee,
                            contract_number=str(uuid4()), contract_type="CDI",
                            start_date=date(2026, 9, 1), job_title="Enseignant",
                            gross_monthly_salary=2500000)
        writer.add(contract)
        writer.flush()  # FK takes KEY SHARE until commit.
        contract_id = contract.id
        future = pool.submit(remove_in_another_transaction)
        try:
            pid = pids.get(timeout=10)
            deadline = monotonic() + 10
            blocked = False
            while monotonic() < deadline:
                blocked = bool(writer.execute(text("SELECT pg_blocking_pids(:pid)"), {"pid": pid}).scalar_one())
                if blocked:
                    break
                if future.done():
                    break
                sleep(0.02)
            assert blocked, "Deletion did not wait for the concurrent contract transaction"
            writer.commit()
        finally:
            # Release the FK lock even if the assertion fails, so the worker exits.
            writer.rollback()
        assert future.result(timeout=20) is True
    with SessionLocal() as db:
        assert db.get(Employee, employee) is not None
        assert db.get(Contract, contract_id).gross_monthly_salary == 2500000
