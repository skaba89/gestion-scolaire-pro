from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.schemas.hr import (
    Employee, EmployeeCreate, EmployeeUpdate,
    Contract, ContractCreate, ContractUpdate,
    LeaveRequest, LeaveRequestCreate, LeaveRequestUpdate,
    Payslip, PayslipCreate, PayslipUpdate
)
from app.crud import hr as crud_hr
from app.utils.audit import log_audit
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

@router.delete("/leave-requests/{leave_id}/")
def delete_leave_request(
    leave_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete a leave request."""
    success = crud_hr.delete_leave_request(db, leave_id=leave_id, tenant_id=current_user.get("tenant_id"))
    if not success:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return {"status": "success"}

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


# --- Job Offers (Careers module) ---
# job_offers/career_events/alumni_mentors have no SQLAlchemy ORM model
# (raw-SQL operational tables, see app/core/operational_tables.py), so these
# follow the same text()-based pattern as clubs.py rather than crud_hr.

class JobOfferIn(BaseModel):
    title: str
    company_name: str
    description: str
    requirements: Optional[str] = None
    location: Optional[str] = None
    is_remote: bool = False
    offer_type: str = "INTERNSHIP"
    salary_range: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    application_deadline: Optional[str] = None
    contact_email: Optional[str] = None
    external_url: Optional[str] = None
    is_active: bool = True


@router.post("/job-offers/", status_code=201)
def create_job_offer(
    offer: JobOfferIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO job_offers (id, tenant_id, title, company_name, description, requirements,
                                     location, is_remote, offer_type, salary_range, start_date, end_date,
                                     application_deadline, contact_email, external_url, is_active,
                                     created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :title, :company, :desc, :req, :loc, :remote, :otype,
                    :salary, :sdate, :edate, :deadline, :email, :url, :active, NOW(), NOW())
            RETURNING *
        """), {
            "tid": tenant_id, "title": offer.title, "company": offer.company_name,
            "desc": offer.description, "req": offer.requirements, "loc": offer.location,
            "remote": offer.is_remote, "otype": offer.offer_type, "salary": offer.salary_range,
            "sdate": offer.start_date or None, "edate": offer.end_date or None,
            "deadline": offer.application_deadline or None, "email": offer.contact_email,
            "url": offer.external_url, "active": offer.is_active,
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_JOB_OFFER", resource_type="JOB_OFFER", resource_id=str(result["id"]))
        db.commit()
        return dict(result)
    except Exception as e:
        db.rollback()
        logger.error("Error creating job offer: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/job-offers/{offer_id}/")
def update_job_offer(
    offer_id: UUID,
    offer: JobOfferIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            UPDATE job_offers SET title=:title, company_name=:company, description=:desc,
                requirements=:req, location=:loc, is_remote=:remote, offer_type=:otype,
                salary_range=:salary, start_date=:sdate, end_date=:edate,
                application_deadline=:deadline, contact_email=:email, external_url=:url,
                is_active=:active, updated_at=NOW()
            WHERE id=:id AND tenant_id=:tid
            RETURNING *
        """), {
            "id": str(offer_id), "tid": tenant_id, "title": offer.title, "company": offer.company_name,
            "desc": offer.description, "req": offer.requirements, "loc": offer.location,
            "remote": offer.is_remote, "otype": offer.offer_type, "salary": offer.salary_range,
            "sdate": offer.start_date or None, "edate": offer.end_date or None,
            "deadline": offer.application_deadline or None, "email": offer.contact_email,
            "url": offer.external_url, "active": offer.is_active,
        }).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Job offer not found")
        db.commit()
        return dict(result)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating job offer: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/job-offers/{offer_id}/", status_code=204)
def delete_job_offer(
    offer_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    result = db.execute(text("DELETE FROM job_offers WHERE id=:id AND tenant_id=:tid"),
                         {"id": str(offer_id), "tid": tenant_id})
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(status_code=404, detail="Job offer not found")
    db.commit()
    return None


@router.put("/job-applications/{application_id}/")
def update_job_application(
    application_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    status_value = body.get("status")
    if not status_value:
        raise HTTPException(status_code=422, detail="status is required")
    result = db.execute(text("""
        UPDATE job_applications SET status=:status, updated_at=NOW()
        WHERE id=:id AND tenant_id=:tid
        RETURNING id, status
    """), {"id": str(application_id), "tid": tenant_id, "status": status_value}).mappings().first()
    if not result:
        db.rollback()
        raise HTTPException(status_code=404, detail="Application not found")
    db.commit()
    return dict(result)


# --- Career Events (Careers module) ---

class CareerEventIn(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str = "workshop"
    location: Optional[str] = None
    is_online: bool = False
    meeting_url: Optional[str] = None
    start_datetime: str
    end_datetime: Optional[str] = None
    max_participants: Optional[int] = None
    registration_deadline: Optional[str] = None
    is_active: bool = True


@router.post("/career-events/", status_code=201)
def create_career_event(
    event: CareerEventIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO career_events (id, tenant_id, title, description, event_type, location,
                                        is_online, meeting_url, start_datetime, end_datetime,
                                        max_participants, registration_deadline, is_active,
                                        created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :title, :desc, :etype, :loc, :online, :url,
                    :start, :end, :maxp, :regdl, :active, NOW(), NOW())
            RETURNING *
        """), {
            "tid": tenant_id, "title": event.title, "desc": event.description,
            "etype": event.event_type, "loc": event.location, "online": event.is_online,
            "url": event.meeting_url, "start": event.start_datetime, "end": event.end_datetime or None,
            "maxp": event.max_participants, "regdl": event.registration_deadline or None,
            "active": event.is_active,
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_CAREER_EVENT", resource_type="CAREER_EVENT", resource_id=str(result["id"]))
        db.commit()
        return dict(result)
    except Exception as e:
        db.rollback()
        logger.error("Error creating career event: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/career-events/{event_id}/")
def update_career_event(
    event_id: UUID,
    event: CareerEventIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            UPDATE career_events SET title=:title, description=:desc, event_type=:etype,
                location=:loc, is_online=:online, meeting_url=:url, start_datetime=:start,
                end_datetime=:end, max_participants=:maxp, registration_deadline=:regdl,
                is_active=:active, updated_at=NOW()
            WHERE id=:id AND tenant_id=:tid
            RETURNING *
        """), {
            "id": str(event_id), "tid": tenant_id, "title": event.title, "desc": event.description,
            "etype": event.event_type, "loc": event.location, "online": event.is_online,
            "url": event.meeting_url, "start": event.start_datetime, "end": event.end_datetime or None,
            "maxp": event.max_participants, "regdl": event.registration_deadline or None,
            "active": event.is_active,
        }).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Career event not found")
        db.commit()
        return dict(result)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating career event: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/career-events/{event_id}/", status_code=204)
def delete_career_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    result = db.execute(text("DELETE FROM career_events WHERE id=:id AND tenant_id=:tid"),
                         {"id": str(event_id), "tid": tenant_id})
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(status_code=404, detail="Career event not found")
    db.commit()
    return None


# --- Alumni Mentors ---

class AlumniMentorIn(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    graduation_year: Optional[int] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None
    industry: Optional[str] = None
    expertise_areas: Optional[list] = None
    bio: Optional[str] = None
    linkedin_url: Optional[str] = None
    is_available: bool = True
    max_mentees: int = 3


@router.post("/alumni-mentors/", status_code=201)
def create_alumni_mentor(
    mentor: AlumniMentorIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    import json as _json
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO alumni_mentors (id, tenant_id, first_name, last_name, email, phone,
                                         graduation_year, current_company, current_position, industry,
                                         expertise_areas, bio, linkedin_url, is_available, max_mentees,
                                         created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :fname, :lname, :email, :phone, :gyear, :company,
                    :position, :industry, :expertise, :bio, :linkedin, :available, :maxm, NOW(), NOW())
            RETURNING *
        """), {
            "tid": tenant_id, "fname": mentor.first_name, "lname": mentor.last_name,
            "email": mentor.email, "phone": mentor.phone, "gyear": mentor.graduation_year,
            "company": mentor.current_company, "position": mentor.current_position,
            "industry": mentor.industry,
            "expertise": _json.dumps(mentor.expertise_areas or []),
            "bio": mentor.bio, "linkedin": mentor.linkedin_url,
            "available": mentor.is_available, "maxm": mentor.max_mentees,
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_ALUMNI_MENTOR", resource_type="ALUMNI_MENTOR", resource_id=str(result["id"]))
        db.commit()
        return dict(result)
    except Exception as e:
        db.rollback()
        logger.error("Error creating alumni mentor: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/alumni-mentors/{mentor_id}/")
def update_alumni_mentor(
    mentor_id: UUID,
    mentor: AlumniMentorIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    import json as _json
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            UPDATE alumni_mentors SET first_name=:fname, last_name=:lname, email=:email,
                phone=:phone, graduation_year=:gyear, current_company=:company,
                current_position=:position, industry=:industry, expertise_areas=:expertise,
                bio=:bio, linkedin_url=:linkedin, is_available=:available, max_mentees=:maxm,
                updated_at=NOW()
            WHERE id=:id AND tenant_id=:tid
            RETURNING *
        """), {
            "id": str(mentor_id), "tid": tenant_id, "fname": mentor.first_name, "lname": mentor.last_name,
            "email": mentor.email, "phone": mentor.phone, "gyear": mentor.graduation_year,
            "company": mentor.current_company, "position": mentor.current_position,
            "industry": mentor.industry,
            "expertise": _json.dumps(mentor.expertise_areas or []),
            "bio": mentor.bio, "linkedin": mentor.linkedin_url,
            "available": mentor.is_available, "maxm": mentor.max_mentees,
        }).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Mentor not found")
        db.commit()
        return dict(result)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating alumni mentor: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/alumni-mentors/{mentor_id}/", status_code=204)
def delete_alumni_mentor(
    mentor_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    result = db.execute(text("DELETE FROM alumni_mentors WHERE id=:id AND tenant_id=:tid"),
                         {"id": str(mentor_id), "tid": tenant_id})
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(status_code=404, detail="Mentor not found")
    db.commit()
    return None


# --- Alumni Document Requests (admin management) ---
# Distinct from alumni.py's self-service routes (scoped to alumni_id =
# current user) — these are tenant-wide, for staff processing requests
# submitted by any alumnus.

_REQUEST_UPDATABLE_COLUMNS = {"status", "validation_notes"}


@router.put("/alumni-document-requests/{request_id}/")
def admin_update_document_request(
    request_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    updates = {k: v for k, v in body.items() if k in _REQUEST_UPDATABLE_COLUMNS}
    if not updates:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    set_clause = ", ".join(f"{col}=:{col}" for col in updates)
    params = {**updates, "id": str(request_id), "tid": tenant_id}
    result = db.execute(text(f"""
        UPDATE alumni_document_requests SET {set_clause}, updated_at=NOW()
        WHERE id=:id AND tenant_id=:tid
        RETURNING *
    """), params).mappings().first()
    if not result:
        db.rollback()
        raise HTTPException(status_code=404, detail="Request not found")
    db.commit()
    return dict(result)


class RequestHistoryIn(BaseModel):
    request_id: str
    action: str
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    performed_by: Optional[str] = None
    notes: Optional[str] = None


@router.post("/alumni-request-history/", status_code=201)
def create_request_history_entry(
    entry: RequestHistoryIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    # Ensure the request belongs to this tenant before logging against it.
    owner = db.execute(text("""
        SELECT id FROM alumni_document_requests WHERE id=:id AND tenant_id=:tid
    """), {"id": entry.request_id, "tid": tenant_id}).fetchone()
    if not owner:
        raise HTTPException(status_code=404, detail="Request not found")
    result = db.execute(text("""
        INSERT INTO alumni_request_history (id, request_id, action, new_status, performed_by, notes, created_at)
        VALUES (gen_random_uuid(), :rid, :action, :status, :performer, :notes, NOW())
        RETURNING *
    """), {
        "rid": entry.request_id, "action": entry.action, "status": entry.new_status,
        "performer": entry.performed_by or current_user.get("id"), "notes": entry.notes,
    }).mappings().first()
    db.commit()
    return dict(result)
