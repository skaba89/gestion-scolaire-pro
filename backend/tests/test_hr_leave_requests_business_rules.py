"""Institutional-readiness audit (2026-09), business-rules subagent —
HR leave requests had no data-integrity checks at all:

- total_days was a fully independent client-supplied int, never checked
  against start_date/end_date.
- No overlap guard: the same employee could have two overlapping PENDING/
  APPROVED leave requests recorded simultaneously.
- No transition enforcement: an already-APPROVED/REJECTED request could
  be flipped again with no guard.
"""
import uuid
from datetime import date, timedelta

import pytest
from pydantic import ValidationError
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.crud import hr as crud_hr  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.schemas.hr import LeaveRequestCreate, LeaveRequestUpdate  # noqa: E402


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École RH Test", slug=f"hr-leave-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_employee(tenant_id: str) -> str:
    employee_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Employee(
            id=employee_id, tenant_id=tenant_id, employee_number=f"EMP-{employee_id[:8]}",
            first_name="Amadou", last_name="Bah", hire_date=date(2020, 1, 1), is_active=True,
        ))
        db.commit()
    return employee_id


class TestLeaveRequestSchemaValidation:
    def test_rejects_total_days_exceeding_date_span(self):
        with pytest.raises(ValidationError):
            LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 1, 1), end_date=date(2026, 1, 5),
                total_days=10, employee_id=uuid.uuid4(),
            )

    def test_rejects_end_date_before_start_date(self):
        with pytest.raises(ValidationError):
            LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 1, 5), end_date=date(2026, 1, 1),
                total_days=1, employee_id=uuid.uuid4(),
            )

    def test_accepts_total_days_within_span(self):
        payload = LeaveRequestCreate(
            leave_type="CONGE_PAYE", start_date=date(2026, 1, 1), end_date=date(2026, 1, 5),
            total_days=5, employee_id=uuid.uuid4(),
        )
        assert payload.total_days == 5

    def test_update_rejects_status_outside_approved_rejected(self):
        with pytest.raises(ValidationError):
            LeaveRequestUpdate(status="PENDING")


class TestLeaveRequestOverlapGuard:
    def test_overlapping_leave_for_same_employee_is_rejected(self):
        tenant_id = _make_tenant()
        employee_id = _make_employee(tenant_id)
        with SessionLocal() as db:
            crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 6, 1), end_date=date(2026, 6, 10),
                total_days=10, employee_id=employee_id,
            ), tenant_id)

            with pytest.raises(ValueError):
                crud_hr.create_leave_request(db, LeaveRequestCreate(
                    leave_type="MALADIE", start_date=date(2026, 6, 5), end_date=date(2026, 6, 15),
                    total_days=11, employee_id=employee_id,
                ), tenant_id)

    def test_non_overlapping_leave_is_accepted(self):
        tenant_id = _make_tenant()
        employee_id = _make_employee(tenant_id)
        with SessionLocal() as db:
            crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 6, 1), end_date=date(2026, 6, 10),
                total_days=10, employee_id=employee_id,
            ), tenant_id)

            second = crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="MALADIE", start_date=date(2026, 6, 11), end_date=date(2026, 6, 15),
                total_days=5, employee_id=employee_id,
            ), tenant_id)
            assert second.id is not None

    def test_rejected_leave_does_not_block_a_new_overlapping_request(self):
        tenant_id = _make_tenant()
        employee_id = _make_employee(tenant_id)
        with SessionLocal() as db:
            first = crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 6, 1), end_date=date(2026, 6, 10),
                total_days=10, employee_id=employee_id,
            ), tenant_id)
            crud_hr.update_leave_status(db, first.id, LeaveRequestUpdate(status="REJECTED"), tenant_id)

            second = crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="MALADIE", start_date=date(2026, 6, 5), end_date=date(2026, 6, 8),
                total_days=4, employee_id=employee_id,
            ), tenant_id)
            assert second.id is not None


class TestLeaveRequestTransitionEnforcement:
    def test_approving_an_already_rejected_request_is_blocked(self):
        tenant_id = _make_tenant()
        employee_id = _make_employee(tenant_id)
        with SessionLocal() as db:
            leave = crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 7, 1), end_date=date(2026, 7, 5),
                total_days=5, employee_id=employee_id,
            ), tenant_id)
            crud_hr.update_leave_status(db, leave.id, LeaveRequestUpdate(status="REJECTED"), tenant_id)

            with pytest.raises(ValueError):
                crud_hr.update_leave_status(db, leave.id, LeaveRequestUpdate(status="APPROVED"), tenant_id)

    def test_pending_request_can_be_approved(self):
        tenant_id = _make_tenant()
        employee_id = _make_employee(tenant_id)
        with SessionLocal() as db:
            leave = crud_hr.create_leave_request(db, LeaveRequestCreate(
                leave_type="CONGE_PAYE", start_date=date(2026, 8, 1), end_date=date(2026, 8, 5),
                total_days=5, employee_id=employee_id,
            ), tenant_id)
            updated = crud_hr.update_leave_status(db, leave.id, LeaveRequestUpdate(status="APPROVED"), tenant_id)
            assert updated.status == "APPROVED"
