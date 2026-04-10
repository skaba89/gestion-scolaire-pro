from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.hr import (
    Employee, EmployeeCreate, EmployeeUpdate,
    Contract, ContractCreate, ContractUpdate,
    LeaveRequest, LeaveRequestCreate, LeaveRequestUpdate,
    Payslip, PayslipCreate, PayslipUpdate
)
from app.crud import hr as crud_hr
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Employees ---

@router.get("/employees/", response_model=List[Employee])
def read_employees(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve all employees for the tenant."""
    return crud_hr.get_employees(db, tenant_id=current_user.get("tenant_id"))

@router.post("/employees/", response_model=Employee)
def create_employee(
    *,
    db: Session = Depends(get_db),
    obj_in: EmployeeCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new employee."""
    return crud_hr.create_employee(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

@router.get("/employees/{employee_id}/", response_model=Employee)
def read_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a specific employee."""
    employee = crud_hr.get_employee(db, employee_id=employee_id, tenant_id=current_user.get("tenant_id"))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee

@router.put("/employees/{employee_id}/", response_model=Employee)
def update_employee(
    *,
    db: Session = Depends(get_db),
    employee_id: UUID,
    obj_in: EmployeeUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an employee."""
    employee = crud_hr.update_employee(db, employee_id=employee_id, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee

@router.delete("/employees/{employee_id}/")
def delete_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete an employee."""
    success = crud_hr.delete_employee(db, employee_id=employee_id, tenant_id=current_user.get("tenant_id"))
    if not success:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"status": "success"}

# --- Contracts ---

@router.get("/contracts/", response_model=List[Contract])
def read_contracts(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_hr.get_contracts(db, tenant_id=current_user.get("tenant_id"))

@router.post("/contracts/", response_model=Contract)
def create_contract(
    *,
    db: Session = Depends(get_db),
    obj_in: ContractCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_hr.create_contract(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

@router.put("/contracts/{contract_id}/", response_model=Contract)
def update_contract(
    *,
    db: Session = Depends(get_db),
    contract_id: UUID,
    obj_in: ContractUpdate,
    current_user: dict = Depends(get_current_user),
):
    contract = crud_hr.update_contract(db, contract_id=contract_id, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract

@router.delete("/contracts/{contract_id}/")
def delete_contract(
    contract_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    success = crud_hr.delete_contract(db, contract_id=contract_id, tenant_id=current_user.get("tenant_id"))
    if not success:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"status": "success"}

# --- Leave Requests ---

@router.get("/leave-requests/", response_model=List[LeaveRequest])
def read_leave_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_hr.get_leave_requests(db, tenant_id=current_user.get("tenant_id"))

@router.post("/leave-requests/", response_model=LeaveRequest)
def create_leave_request(
    *,
    db: Session = Depends(get_db),
    obj_in: LeaveRequestCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_hr.create_leave_request(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

@router.put("/leave-requests/{leave_id}/", response_model=LeaveRequest)
def update_leave_status(
    *,
    db: Session = Depends(get_db),
    leave_id: UUID,
    obj_in: LeaveRequestUpdate,
    current_user: dict = Depends(get_current_user),
):
    leave = crud_hr.update_leave_status(db, leave_id=leave_id, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return leave

# --- Payslips ---

@router.get("/payslips/", response_model=List[Payslip])
def read_payslips(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_hr.get_payslips(db, tenant_id=current_user.get("tenant_id"))

@router.post("/payslips/", response_model=Payslip)
def create_payslip(
    *,
    db: Session = Depends(get_db),
    obj_in: PayslipCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_hr.create_payslip(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

@router.put("/payslips/{payslip_id}/", response_model=Payslip)
def update_payslip(
    *,
    db: Session = Depends(get_db),
    payslip_id: UUID,
    obj_in: PayslipUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a payslip."""
    payslip = crud_hr.update_payslip(db, payslip_id=payslip_id, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return payslip

@router.delete("/payslips/{payslip_id}/")
def delete_payslip(
    payslip_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    success = crud_hr.delete_payslip(db, payslip_id=payslip_id, tenant_id=current_user.get("tenant_id"))
    if not success:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return {"status": "success"}

@router.get("/last-employee-number/")
def read_last_employee_number(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get the last employee number for the tenant."""
    return crud_hr.get_last_employee_number(db, tenant_id=current_user.get("tenant_id"))
