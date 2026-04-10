from typing import List, Optional
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import date

from app.models import Employee, Contract, LeaveRequest, Payslip
from app.schemas.hr import (
    EmployeeCreate, EmployeeUpdate,
    ContractCreate, ContractUpdate,
    LeaveRequestCreate, LeaveRequestUpdate,
    PayslipCreate, PayslipUpdate
)

# --- Employee ---
def get_employees(db: Session, tenant_id: UUID) -> List[Employee]:
    return db.query(Employee).filter(Employee.tenant_id == tenant_id).order_by(Employee.last_name).all()

def get_employee(db: Session, employee_id: UUID, tenant_id: UUID) -> Optional[Employee]:
    return db.query(Employee).filter(Employee.id == employee_id, Employee.tenant_id == tenant_id).first()

def create_employee(db: Session, obj_in: EmployeeCreate, tenant_id: UUID) -> Employee:
    db_obj = Employee(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_employee(db: Session, employee_id: UUID, obj_in: EmployeeUpdate, tenant_id: UUID) -> Optional[Employee]:
    db_obj = get_employee(db, employee_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_employee(db: Session, employee_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_employee(db, employee_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Contract ---
def get_contracts(db: Session, tenant_id: UUID) -> List[Contract]:
    return db.query(Contract).filter(Contract.tenant_id == tenant_id).order_by(Contract.start_date.desc()).all()

def get_contract(db: Session, contract_id: UUID, tenant_id: UUID) -> Optional[Contract]:
    return db.query(Contract).filter(Contract.id == contract_id, Contract.tenant_id == tenant_id).first()

def create_contract(db: Session, obj_in: ContractCreate, tenant_id: UUID) -> Contract:
    if obj_in.is_current:
        # Reset others for this employee
        db.query(Contract).filter(
            Contract.tenant_id == tenant_id, 
            Contract.employee_id == obj_in.employee_id
        ).update({"is_current": False})
    
    db_obj = Contract(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_contract(db: Session, contract_id: UUID, obj_in: ContractUpdate, tenant_id: UUID) -> Optional[Contract]:
    db_obj = get_contract(db, contract_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    if update_data.get("is_current"):
        db.query(Contract).filter(
            Contract.tenant_id == tenant_id, 
            Contract.employee_id == db_obj.employee_id,
            Contract.id != contract_id
        ).update({"is_current": False})
        
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_contract(db: Session, contract_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_contract(db, contract_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Leave Request ---
def get_leave_requests(db: Session, tenant_id: UUID) -> List[LeaveRequest]:
    return db.query(LeaveRequest).filter(LeaveRequest.tenant_id == tenant_id).order_by(LeaveRequest.created_at.desc()).all()

def get_leave_request(db: Session, leave_id: UUID, tenant_id: UUID) -> Optional[LeaveRequest]:
    return db.query(LeaveRequest).filter(LeaveRequest.id == leave_id, LeaveRequest.tenant_id == tenant_id).first()

def create_leave_request(db: Session, obj_in: LeaveRequestCreate, tenant_id: UUID) -> LeaveRequest:
    db_obj = LeaveRequest(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_leave_status(db: Session, leave_id: UUID, obj_in: LeaveRequestUpdate, tenant_id: UUID) -> Optional[LeaveRequest]:
    db_obj = get_leave_request(db, leave_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# --- Payslip ---
def get_payslips(db: Session, tenant_id: UUID) -> List[Payslip]:
    return db.query(Payslip).filter(Payslip.tenant_id == tenant_id).order_by(Payslip.period_year.desc(), Payslip.period_month.desc()).all()

def get_payslip(db: Session, payslip_id: UUID, tenant_id: UUID) -> Optional[Payslip]:
    return db.query(Payslip).filter(Payslip.id == payslip_id, Payslip.tenant_id == tenant_id).first()

def create_payslip(db: Session, obj_in: PayslipCreate, tenant_id: UUID) -> Payslip:
    db_obj = Payslip(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_payslip(db: Session, payslip_id: UUID, obj_in: PayslipUpdate, tenant_id: UUID) -> Optional[Payslip]:
    db_obj = get_payslip(db, payslip_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_payslip(db: Session, payslip_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_payslip(db, payslip_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

def get_last_employee_number(db: Session, tenant_id: UUID) -> Optional[str]:
    employee = db.query(Employee).filter(Employee.tenant_id == tenant_id).order_by(Employee.created_at.desc()).first()
    return employee.employee_number if employee else None
