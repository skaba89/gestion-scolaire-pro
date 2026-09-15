"""Authorization on /api/v1/hr/ — employees, contracts, leave-requests,
payslips (institutional-readiness audit, 2026-09, P0).

Before this fix, every endpoint in
backend/app/api/v1/endpoints/operational/hr.py for these four resources
depended on get_current_user() ONLY — no require_permission() call at all.
Any authenticated user of ANY role in the tenant (STUDENT, PARENT, ALUMNI
included) could read every employee's payslip (salary data) and
create/update/delete employee, contract, leave-request and payslip
records, limited only by tenant isolation, never by role.

This suite proves: (1) roles with no business reaching HR data are
rejected, (2) the roles the product's own AdminLayout route already
exposes /admin/hr to (SUPER_ADMIN, TENANT_ADMIN, DIRECTOR, STAFF,
ACCOUNTANT, SECRETARY — src/App.tsx allowedRoles) keep working exactly as
before.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"hr-auth-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def _employee_payload(number: str = "EMP-001") -> dict:
    return {
        "employee_number": number,
        "first_name": "Fatoumata",
        "last_name": "Diallo",
        "hire_date": str(date.today()),
    }


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


# ─── Roles that must NEVER reach HR data ──────────────────────────────────────

class TestNoBusinessReachingHRData:
    def test_student_cannot_read_employees(self):
        tenant_id = _make_tenant("École HR Student")
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).get("/api/v1/hr/employees/", headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_cannot_read_payslips(self):
        """The most sensitive case: PARENT reading staff salary data."""
        tenant_id = _make_tenant("École HR Parent")
        parent = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent).get("/api/v1/hr/payslips/", headers=HEADERS)
        assert resp.status_code == 403

    def test_student_cannot_create_employee(self):
        tenant_id = _make_tenant("École HR Student Write")
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).post(
            "/api/v1/hr/employees/", json=_employee_payload(), headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_teacher_cannot_read_employees(self):
        tenant_id = _make_tenant("École HR Teacher")
        teacher = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}
        resp = _as(teacher).get("/api/v1/hr/employees/", headers=HEADERS)
        assert resp.status_code == 403

    def test_department_head_cannot_read_payslips(self):
        tenant_id = _make_tenant("École HR DeptHead")
        head = {"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}
        resp = _as(head).get("/api/v1/hr/payslips/", headers=HEADERS)
        assert resp.status_code == 403

    def test_alumni_cannot_delete_employee(self):
        tenant_id = _make_tenant("École HR Alumni")
        alumni = {"id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id}
        resp = _as(alumni).delete(
            f"/api/v1/hr/employees/{uuid.uuid4()}/", headers=HEADERS,
        )
        assert resp.status_code == 403


# ─── Roles the product already exposes /admin/hr to — must keep working ──────

class TestRolesAlreadyExposedToHRPageKeepWorking:
    def test_staff_can_read_and_create_employees(self):
        tenant_id = _make_tenant("École HR Staff")
        staff = {"id": str(uuid.uuid4()), "roles": ["STAFF"], "tenant_id": tenant_id}

        resp = _as(staff).get("/api/v1/hr/employees/", headers=HEADERS)
        assert resp.status_code == 200, resp.text

        resp = _as(staff).post(
            "/api/v1/hr/employees/", json=_employee_payload("EMP-STAFF"), headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

    def test_accountant_can_read_payslips(self):
        tenant_id = _make_tenant("École HR Accountant")
        accountant = {"id": str(uuid.uuid4()), "roles": ["ACCOUNTANT"], "tenant_id": tenant_id}
        resp = _as(accountant).get("/api/v1/hr/payslips/", headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_secretary_can_create_and_read_contracts(self):
        tenant_id = _make_tenant("École HR Secretary")
        secretary = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}

        # Need an employee to attach the contract to.
        emp_resp = _as(secretary).post(
            "/api/v1/hr/employees/", json=_employee_payload("EMP-SEC"), headers=HEADERS,
        )
        assert emp_resp.status_code == 200, emp_resp.text
        employee_id = emp_resp.json()["id"]

        resp = _as(secretary).post(
            "/api/v1/hr/contracts/",
            json={
                "contract_number": "CTR-001",
                "contract_type": "CDI",
                "start_date": str(date.today()),
                "job_title": "Enseignant",
                "gross_monthly_salary": 1500000.0,
                "employee_id": employee_id,
            },
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

    def test_director_still_has_full_hr_access(self):
        """Sanity check: unchanged for the roles that already had hr:read/write."""
        tenant_id = _make_tenant("École HR Director")
        director = {"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": tenant_id}
        resp = _as(director).get("/api/v1/hr/payslips/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
