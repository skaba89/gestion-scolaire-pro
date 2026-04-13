from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models import AccountDeletionRequest, Profile, User
from app.schemas.rgpd import DeletionRequest, DeletionRequestCreate, DeletionRequestUpdate
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit
from app.models.audit_log import AuditLog
import uuid
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/requests/", response_model=DeletionRequest)
def create_deletion_request(
    *,
    db: Session = Depends(get_db),
    request_in: DeletionRequestCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new account deletion request.
    """
    user_id = uuid.UUID(current_user["id"])
    
    # Check if a pending request already exists
    existing_request = db.query(AccountDeletionRequest).filter(
        AccountDeletionRequest.user_id == user_id,
        AccountDeletionRequest.status == "PENDING"
    ).first()
    if existing_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A deletion request is already pending for this account."
        )

    # Use tenant_id from user if available, else default (mocked for now)
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant context found for this user."
        )

    db_obj = AccountDeletionRequest(
        tenant_id=tenant_id,
        user_id=user_id,
        reason=request_in.reason,
        status="PENDING"
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/requests/", response_model=List[DeletionRequest])
def list_deletion_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List deletion requests. 
    Admin see all for tenant, users see their own.
    """
    user_id = uuid.UUID(current_user["id"])
    roles = current_user.get("roles", [])
    tenant_id = current_user.get("tenant_id")
    
    query = db.query(AccountDeletionRequest).options(joinedload(AccountDeletionRequest.user))
    
    if any(role in ["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR"] for role in roles):
        if tenant_id and "SUPER_ADMIN" not in roles:
            query = query.filter(AccountDeletionRequest.tenant_id == tenant_id)
        return query.all()
    else:
        return query.filter(AccountDeletionRequest.user_id == user_id).all()

@router.patch("/requests/{request_id}/", response_model=DeletionRequest)
def process_deletion_request(
    request_id: uuid.UUID,
    update_in: DeletionRequestUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:write"))
):
    """
    Process (Approve/Reject) a deletion request.
    If approved, trigger actual user anonymization/deletion.
    """
    tenant_id = current_user.get("tenant_id")
    query = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.id == request_id)
    if tenant_id:
        query = query.filter(AccountDeletionRequest.tenant_id == tenant_id)
    db_obj = query.first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Request not found")
        
    db_obj.status = update_in.status
    db_obj.rejection_reason = update_in.rejection_reason
    db_obj.processed_at = datetime.now(timezone.utc)
    db_obj.processed_by = uuid.UUID(current_user["id"])
    
    if update_in.status == "PROCESSED":
        # Perform actual anonymization
        user_to_delete = db.query(User).filter(User.id == db_obj.user_id).first()
        if user_to_delete:
            # 1. Anonymize user in DB
            user_to_delete.email = f"deleted_{str(user_to_delete.id)[:8]}@schoolflow.deleted"
            user_to_delete.first_name = "Deleted"
            user_to_delete.last_name = "User"
            user_to_delete.is_active = False
            
            # 2. Anonymize profile if exists
            profile = db.query(Profile).filter(Profile.id == user_to_delete.id).first()
            if profile:
                profile.phone = None
                profile.avatar_url = None
                
            # 3. User is anonymized in the local DB only (no external identity provider)
            pass
                
        # Log audit
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=db_obj.tenant_id,
            action="RGPD_DELETE_PROCESSED",
            resource_type="USER",
            resource_id=str(db_obj.user_id),
            details={"request_id": str(db_obj.id)}
        )

    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/stats/")
def get_rgpd_stats(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:read"))
):
    """
    Get RGPD compliance statistics for the dashboard.
    """
    from sqlalchemy import text as sql_text

    total_consents = 0 # Placeholder for consent management
    anonymized_users = db.query(User).filter(User.is_active == False).count()
    pending_requests = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.status == "PENDING").count()

    # Count actual retention risks (inactive > 5 years)
    risks_count = db.execute(sql_text(
        "SELECT COUNT(*) FROM users WHERE is_active = false AND created_at < NOW() - INTERVAL '5 years'"
    )).scalar() or 0

    # Count actual RGPD exports from audit logs
    tenant_id = current_user.get("tenant_id")
    export_count = db.execute(sql_text(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'RGPD_EXPORT' AND (:tenant_id IS NULL OR tenant_id = :tenant_id::uuid)"
    ), {"tenant_id": str(tenant_id) if tenant_id else None}).scalar() or 0

    compliance_risks = risks_count
    total_exports = export_count
    
    return {
        "totalConsents": total_consents,
        "anonymizedUsers": anonymized_users,
        "pendingRequests": pending_requests,
        "complianceRisks": compliance_risks,
        "totalExports": total_exports,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }

@router.get("/check-retention/{user_id}/")
def check_legal_retention(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:read"))
):
    """
    Check legal data retention requirements before deletion.
    Queries actual counts from DB for grades, attendance, payments, invoices.
    SECURITY FIX: All queries are now scoped to the current user's tenant
    to prevent cross-tenant data leakage.
    """
    from sqlalchemy import text as sql_text

    uid = str(user_id)
    # SECURITY FIX: Enforce tenant isolation — require tenant_id from current user context
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant context found. Cannot check retention data."
        )
    tid = str(tenant_id)

    # Students linked to this user (by user_id FK or profile), scoped to tenant
    student_row = db.execute(sql_text(
        "SELECT id FROM students WHERE user_id = :uid AND tenant_id = :tid LIMIT 1"
    ), {"uid": uid, "tid": tid}).mappings().first()
    student_id = str(student_row["id"]) if student_row else None

    grades_count = 0
    attendance_count = 0
    if student_id:
        # SECURITY FIX: Tenant-scoped queries for grades and attendance
        grades_count = db.execute(sql_text(
            "SELECT COUNT(*) FROM grades WHERE student_id = :sid AND tenant_id = :tid"
        ), {"sid": student_id, "tid": tid}).scalar() or 0
        attendance_count = db.execute(sql_text(
            "SELECT COUNT(*) FROM attendance WHERE student_id = :sid AND tenant_id = :tid"
        ), {"sid": student_id, "tid": tid}).scalar() or 0

    # SECURITY FIX: Tenant-scoped queries for payments and invoices
    payments_count = db.execute(sql_text(
        "SELECT COUNT(*) FROM payments WHERE user_id = :uid AND tenant_id = :tid"
    ), {"uid": uid, "tid": tid}).scalar() or 0

    invoices_count = db.execute(sql_text(
        "SELECT COUNT(*) FROM invoices WHERE user_id = :uid AND tenant_id = :tid"
    ), {"uid": uid, "tid": tid}).scalar() or 0

    has_permanent_data = grades_count > 0

    return {
        "user_id": uid,
        "legal_data": {
            "invoices": {"count": invoices_count, "retention_period": "10 years", "legal_basis": "Code du Commerce"},
            "payments": {"count": payments_count, "retention_period": "10 years", "legal_basis": "Code du Commerce"},
            "grades": {"count": grades_count, "retention_period": "Unlimited", "legal_basis": "Législation Académique"},
            "attendance": {"count": attendance_count, "retention_period": "5 years", "legal_basis": "Suivi Pédagogique"},
        },
        "can_be_fully_deleted": not has_permanent_data,
        "message": (
            "Certaines données (Notes) doivent être conservées à vie pour la validité des diplômes."
            if has_permanent_data
            else "Aucune donnée à conservation permanente. Suppression possible."
        ),
    }

@router.get("/search/")
def search_users_for_rgpd(
    email: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:read"))
):
    """
    Search for a user by email for RGPD actions.
    SECURITY FIX: Results are scoped to the current user's tenant
    to prevent cross-tenant data access.
    """
    # SECURITY FIX: Enforce tenant isolation on user search
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant context found. Cannot search users."
        )
    safe_email = email.replace('%', r'\%').replace('_', r'\_')
    query = db.query(User).filter(User.email.ilike(f"%{safe_email}%"))
    # SECURITY FIX: Only return users from the same tenant
    query = query.filter(User.tenant_id == tenant_id)
    user = query.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/audit-logs/")
def get_rgpd_audit_logs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:read"))
):
    """
    Get RGPD relevant audit logs.
    """
    tenant_id = current_user.get("tenant_id")
    query = db.query(AuditLog).filter(
        AuditLog.action.ilike("RGPD_%")
    )
    if tenant_id:
        query = query.filter(AuditLog.tenant_id == tenant_id)
    logs = query.order_by(AuditLog.created_at.desc()).limit(100).all()
    return logs

@router.post("/direct-delete/{user_id}/")
def direct_delete_user(
    user_id: uuid.UUID,
    body: Optional[BaseModel] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:write"))
):
    """
    Directly delete/anonymize a user (admin action).
    SECURITY FIX: tenant_id is REQUIRED for non-SUPER_ADMIN users.
    The target user must belong to the same tenant as the caller.
    """
    reason = (body.dict() if body else {}).get("reason", "Direct admin action")
    tenant_id = current_user.get("tenant_id")
    roles = current_user.get("roles", [])

    # SECURITY FIX: Require tenant_id for all non-SUPER_ADMIN users
    is_super_admin = "SUPER_ADMIN" in roles
    if not tenant_id and not is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant context found. Direct deletion requires a valid tenant."
        )

    query = db.query(User).filter(User.id == user_id)
    if tenant_id:
        # SECURITY FIX: Always scope to tenant — even SUPER_ADMIN with a tenant
        # should not be able to delete users from other tenants
        query = query.filter(User.tenant_id == tenant_id)
    user_to_delete = query.first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    # SECURITY FIX: Validate that the target user belongs to the same tenant
    if tenant_id and user_to_delete.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Target user does not belong to your tenant."
        )
        
    # Reuse the same logic as process_deletion_request
    user_to_delete.email = f"deleted_{str(user_to_delete.id)[:8]}@schoolflow.deleted"
    user_to_delete.first_name = "Deleted"
    user_to_delete.last_name = "User"
    user_to_delete.is_active = False
    
    profile = db.query(Profile).filter(Profile.id == user_to_delete.id).first()
    if profile:
        profile.phone = None
        profile.avatar_url = None
        
    # User is anonymized in the local DB only (no external identity provider)
        
    # Log audit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=current_user.get("tenant_id"),
        action="RGPD_DIRECT_DELETE",
        resource_type="USER",
        resource_id=str(user_id),
        details={"reason": reason}
    )
    
    db.commit()
    return {"message": "User anonymized successfully"}

@router.post("/export/")
def export_user_data(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate an export of all personal data for the user.
    """
    user_id = uuid.UUID(current_user["id"])
    tenant_id = current_user.get("tenant_id")
    
    # Gather data from various tables
    user = db.query(User).filter(User.id == user_id).first()
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    
    export_data = {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "created_at": user.created_at.isoformat() if user.created_at else None
        },
        "profile": {
            "phone": profile.phone if profile else None,
            "avatar_url": profile.avatar_url if profile else None
        },
        "export_metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "tenant_id": str(tenant_id)
        }
    }
    
    # Log the export action
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="RGPD_EXPORT",
        resource_type="USER",
        resource_id=str(user_id),
        details={"format": "JSON"}
    )
    
    db.commit()
    return export_data

@router.get("/export-history/")
def get_rgpd_export_history(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:read"))
):
    """
    Get history of data exports.
    """
    from sqlalchemy import text as sql_text
    tenant_id = current_user.get("tenant_id")

    query = sql_text("""
        SELECT al.id, al.created_at AS export_date,
               u.email AS user_email, u.first_name, u.last_name,
               al.user_id AS requester_id,
               al.details
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.action = 'RGPD_EXPORT'
          AND (:tenant_id IS NULL OR al.tenant_id = :tenant_id::uuid)
        ORDER BY al.created_at DESC
        LIMIT 100
    """)

    rows = db.execute(query, {"tenant_id": str(tenant_id) if tenant_id else None}).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "export_date": r["export_date"].isoformat() if r["export_date"] else None,
            "user_email": r["user_email"],
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "requester_email": r["user_email"],
        }
        for r in rows
    ]

@router.get("/retention-risks/")
def get_rgpd_retention_risks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:read"))
):
    """
    Get users whose data retention period has expired (inactive > 5 years).
    """
    from sqlalchemy import text as sql_text
    tenant_id = current_user.get("tenant_id")

    query = sql_text("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
               u.is_active,
               EXTRACT(YEAR FROM AGE(NOW(), u.created_at))::int AS account_age_years
        FROM users u
        WHERE u.is_active = false
          AND (:tenant_id IS NULL OR u.tenant_id = :tenant_id::uuid)
          AND u.created_at < NOW() - INTERVAL '5 years'
        ORDER BY u.created_at ASC
        LIMIT 100
    """)

    rows = db.execute(query, {"tenant_id": str(tenant_id) if tenant_id else None}).mappings().all()

    from datetime import timedelta
    return [
        {
            "user_id": str(r["id"]),
            "email": r["email"],
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "account_created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "retention_end_date": (r["created_at"] + timedelta(days=365*5)).isoformat() if r["created_at"] else None,
            "account_age_years": r["account_age_years"],
            "compliance_status": "EXPIRED",
        }
        for r in rows
    ]
