from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models import AccountDeletionRequest, Profile, User
from app.schemas.rgpd import DeletionRequest, DeletionRequestCreate, DeletionRequestUpdate
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit
from app.models.audit_log import AuditLog
import uuid
from datetime import datetime

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
    db_obj = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.id == request_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Request not found")
        
    db_obj.status = update_in.status
    db_obj.rejection_reason = update_in.rejection_reason
    db_obj.processed_at = datetime.utcnow()
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
                
            # 3. Delete from Keycloak if possible
            try:
                from app.core.keycloak_admin import delete_keycloak_user
                delete_keycloak_user(str(user_to_delete.id))
            except Exception as e:
                # Log error but don't fail the whole process if Keycloak is down
                # In a real app, you might want to retry this later
                print(f"Error deleting user from Keycloak: {e}")
                
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
    # This is a simplified version. In production, these should be optimized queries or cached.
    total_consents = 0 # Placeholder for consent management
    anonymized_users = db.query(User).filter(User.is_active == False).count()
    pending_requests = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.status == "PENDING").count()
    compliance_risks = 0 # Placeholder for retention risk detection
    total_exports = 0 # Placeholder for export logs
    
    return {
        "totalConsents": total_consents,
        "anonymizedUsers": anonymized_users,
        "pendingRequests": pending_requests,
        "complianceRisks": compliance_risks,
        "totalExports": total_exports,
        "lastUpdated": datetime.utcnow().isoformat()
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
    """
    from sqlalchemy import text as sql_text

    uid = str(user_id)

    # Students linked to this user (by user_id FK or profile)
    student_row = db.execute(sql_text(
        "SELECT id FROM students WHERE user_id = :uid LIMIT 1"
    ), {"uid": uid}).mappings().first()
    student_id = str(student_row["id"]) if student_row else None

    grades_count = 0
    attendance_count = 0
    if student_id:
        grades_count = db.execute(sql_text(
            "SELECT COUNT(*) FROM grades WHERE student_id = :sid"
        ), {"sid": student_id}).scalar() or 0
        attendance_count = db.execute(sql_text(
            "SELECT COUNT(*) FROM attendance WHERE student_id = :sid"
        ), {"sid": student_id}).scalar() or 0

    payments_count = db.execute(sql_text(
        "SELECT COUNT(*) FROM payments WHERE user_id = :uid"
    ), {"uid": uid}).scalar() or 0

    invoices_count = db.execute(sql_text(
        "SELECT COUNT(*) FROM invoices WHERE user_id = :uid"
    ), {"uid": uid}).scalar() or 0

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
    """
    user = db.query(User).filter(User.email.ilike(f"%{email}%")).first()
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
    # Query the new audit log table for RGPD relevant actions
    logs = db.query(AuditLog).filter(
        AuditLog.action.ilike("RGPD_%")
    ).order_by(AuditLog.created_at.desc()).limit(100).all()
    return logs

@router.post("/direct-delete/{user_id}/")
def direct_delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:write"))
):
    """
    Directly delete/anonymize a user (admin action).
    """
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Reuse the same logic as process_deletion_request
    user_to_delete.email = f"deleted_{str(user_to_delete.id)[:8]}@schoolflow.deleted"
    user_to_delete.first_name = "Deleted"
    user_to_delete.last_name = "User"
    user_to_delete.is_active = False
    
    profile = db.query(Profile).filter(Profile.id == user_to_delete.id).first()
    if profile:
        profile.phone = None
        profile.avatar_url = None
        
    try:
        from app.core.keycloak_admin import delete_keycloak_user
        delete_keycloak_user(str(user_to_delete.id))
    except Exception as e:
        print(f"Error deleting user from Keycloak: {e}")
        
    # Log audit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=current_user.get("tenant_id"),
        action="RGPD_DIRECT_DELETE",
        resource_type="USER",
        resource_id=str(user_id)
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
            "exported_at": datetime.utcnow().isoformat(),
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
    logs = db.query(AuditLog).filter(
        AuditLog.action == "RGPD_EXPORT"
    ).order_by(AuditLog.created_at.desc()).all()
    return logs

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

    return [
        {
            "user_id": str(r["id"]),
            "email": r["email"],
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "account_age_years": r["account_age_years"],
            "risk": "RETENTION_EXPIRED",
            "message": f"Compte inactif depuis plus de {r['account_age_years']} ans",
        }
        for r in rows
    ]
