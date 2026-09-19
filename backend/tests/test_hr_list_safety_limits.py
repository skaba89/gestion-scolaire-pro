"""app/crud/hr.py — get_employees/get_contracts/get_leave_requests/
get_payslips had no bound at all (institutional-readiness audit, 2026-09,
Phase 3 — same class of risk as docs/NATIONAL_AUDIT_PHASE0.md's P1-2).
Payslips in particular grow every month, forever, per employee.

The frontend (src/queries/hr.ts) expects a plain array with no pagination
UI, so this is a defensive cap rather than a pagination contract change —
verified here by monkeypatching the cap down instead of inserting
thousands of rows.
"""
import uuid
from datetime import date

import pytest

from app.core.database import SessionLocal
import app.crud.hr as crud_hr
from app.models.employee import Employee
from app.models.tenant import Tenant


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Limites HR Test", slug=f"hr-limit-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_employees(tenant_id: str, count: int) -> None:
    with SessionLocal() as db:
        for i in range(count):
            db.add(Employee(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                employee_number=f"EMP-{i:03d}", first_name="Test", last_name=f"Employee{i}",
                hire_date=date(2020, 1, 1),
            ))
        db.commit()


class TestEmployeeListSafetyLimit:
    def test_returns_all_when_under_the_cap(self):
        tenant_id = _make_tenant()
        _make_employees(tenant_id, 3)

        with SessionLocal() as db:
            result = crud_hr.get_employees(db, tenant_id=tenant_id)

        assert len(result) == 3

    def test_caps_when_over_the_limit(self, monkeypatch):
        monkeypatch.setattr(crud_hr, "_LIST_SAFETY_LIMIT", 2)
        tenant_id = _make_tenant()
        _make_employees(tenant_id, 5)

        with SessionLocal() as db:
            result = crud_hr.get_employees(db, tenant_id=tenant_id)

        assert len(result) == 2

    def test_cap_applies_to_contracts_leave_requests_and_payslips_too(self, monkeypatch):
        """Same _LIST_SAFETY_LIMIT constant guards all four resources —
        prove it's actually wired into each query, not just employees."""
        monkeypatch.setattr(crud_hr, "_LIST_SAFETY_LIMIT", 0)
        tenant_id = _make_tenant()
        _make_employees(tenant_id, 1)

        with SessionLocal() as db:
            assert crud_hr.get_employees(db, tenant_id=tenant_id) == []
            assert crud_hr.get_contracts(db, tenant_id=tenant_id) == []
            assert crud_hr.get_leave_requests(db, tenant_id=tenant_id) == []
            assert crud_hr.get_payslips(db, tenant_id=tenant_id) == []
