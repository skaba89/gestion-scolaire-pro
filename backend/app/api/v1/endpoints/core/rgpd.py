from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models import (
    AccountDeletionRequest,
    Attendance,
    Grade,
    Invoice,
    ParentStudent,
    Payment,
    Profile,
    Student,
    User,
)
from app.schemas.rgpd import DeletionRequest, DeletionRequestCreate, DeletionRequestUpdate
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit
from app.models.audit_log import AuditLog
import uuid
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _privacy_tenant_scope(current_user: dict, *, allow_platform_admin: bool = True):
    """Return the tenant boundary for privacy administration.

    Tenant users must never fall back to an unscoped query when their token is
    incomplete. Only a platform SUPER_ADMIN may deliberately operate without a
    tenant context.
    """
    tenant_id = current_user.get("tenant_id")
    if tenant_id:
        return tenant_id
    if allow_platform_admin and "SUPER_ADMIN" in current_user.get("roles", []):
        return None
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tenant context found for privacy administration.",
    )


def _related_student_ids(db: Session, *, user: User, tenant_id) -> list:
    """Resolve student records owned by a student account or linked parent."""
    linked_ids = {
        row[0]
        for row in db.query(ParentStudent.student_id).filter(
            ParentStudent.parent_id == user.id,
            ParentStudent.tenant_id == tenant_id,
        ).all()
    }
    if user.email:
        linked_ids.update(
            row[0]
            for row in db.query(Student.id).filter(
                Student.tenant_id == tenant_id,
                Student.email == user.email,
            ).all()
        )
    return list(linked_ids)


def _anonymize_user(db: Session, user: User) -> None:
    """Remove direct identifiers consistently from user and profile records."""
    anonymous_id = str(user.id).replace("-", "")
    user.email = f"deleted_{anonymous_id}@schoolflow.deleted"
    user.username = f"deleted_{anonymous_id}"
    user.first_name = "Deleted"
    user.last_name = "User"
    user.phone = None
    user.avatar_url = None
    user.is_active = False

    profile = db.query(Profile).filter(
        Profile.id == user.id,
        Profile.tenant_id == user.tenant_id,
    ).first()
    if profile:
        profile.phone = None
        profile.avatar_url = None

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
        tenant_id = _privacy_tenant_scope(current_user)
        if tenant_id:
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
    tenant_id = _privacy_tenant_scope(current_user)
    query = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.id == request_id)
    if tenant_id:
        query = query.filter(AccountDeletionRequest.tenant_id == tenant_id)
    db_obj = query.first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Request not found")
    if db_obj.status != "PENDING":
        raise HTTPException(status_code=409, detail="Deletion request has already been processed")
        
    db_obj.status = update_in.status
    db_obj.rejection_reason = update_in.rejection_reason
    db_obj.processed_at = datetime.now(timezone.utc)
    db_obj.processed_by = uuid.UUID(current_user["id"])
    
    if update_in.status == "PROCESSED":
        # Perform actual anonymization
        user_to_delete = db.query(User).filter(
            User.id == db_obj.user_id,
            User.tenant_id == db_obj.tenant_id,
        ).first()
        if not user_to_delete:
            raise HTTPException(status_code=404, detail="User not found")
        _anonymize_user(db, user_to_delete)
                
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

    tenant_id = _privacy_tenant_scope(current_user)

    anonymized_query = db.query(User).filter(User.is_active == False)
    if tenant_id:
        anonymized_query = anonymized_query.filter(User.tenant_id == tenant_id)
    anonymized_users = anonymized_query.count()

    pending_query = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.status == "PENDING")
    if tenant_id:
        pending_query = pending_query.filter(AccountDeletionRequest.tenant_id == tenant_id)
    pending_requests = pending_query.count()

    # Count actual granted consents and retention risks in the same tenant scope.
    if tenant_id:
        total_consents = db.execute(sql_text(
            """
            SELECT COUNT(*) FROM user_consents
            WHERE consent_given = true AND tenant_id = CAST(:tenant_id AS UUID)
            """
        ), {"tenant_id": str(tenant_id)}).scalar() or 0
    else:
        total_consents = db.execute(sql_text(
            "SELECT COUNT(*) FROM user_consents WHERE consent_given = true"
        )).scalar() or 0

    retention_cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=365 * 5)
    risks_query = db.query(User).filter(
        User.is_active.is_(False),
        User.created_at < retention_cutoff,
    )
    if tenant_id:
        risks_query = risks_query.filter(User.tenant_id == tenant_id)
    risks_count = risks_query.count()

    # Count actual RGPD exports from audit logs
    export_query = db.query(AuditLog).filter(AuditLog.action == "RGPD_EXPORT")
    if tenant_id:
        export_query = export_query.filter(AuditLog.tenant_id == tenant_id)
    export_count = export_query.count()

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
    uid = str(user_id)
    tenant_id = _privacy_tenant_scope(current_user, allow_platform_admin=False)

    target_user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    student_ids = _related_student_ids(db, user=target_user, tenant_id=tenant_id)

    def count_for_students(model) -> int:
        if not student_ids:
            return 0
        return db.query(model).filter(
            model.tenant_id == tenant_id,
            model.student_id.in_(student_ids),
        ).count()

    grades_count = count_for_students(Grade)
    attendance_count = count_for_students(Attendance)
    payments_count = count_for_students(Payment)
    invoices_count = count_for_students(Invoice)

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
    tenant_id = _privacy_tenant_scope(current_user)
    query = db.query(AuditLog).filter(
        AuditLog.action.ilike("RGPD_%")
    )
    if tenant_id:
        query = query.filter(AuditLog.tenant_id == tenant_id)
    logs = query.order_by(AuditLog.created_at.desc()).limit(100).all()
    return logs

class DirectDeletionRequest(BaseModel):
    reason: str = Field(default="Direct admin action", min_length=3, max_length=2000)


@router.post("/direct-delete/{user_id}/")
def direct_delete_user(
    user_id: uuid.UUID,
    body: Optional[DirectDeletionRequest] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rgpd:write"))
):
    """
    Directly delete/anonymize a user (admin action).
    SECURITY FIX: tenant_id is REQUIRED for non-SUPER_ADMIN users.
    The target user must belong to the same tenant as the caller.
    """
    reason = body.reason if body else "Direct admin action"
    tenant_id = _privacy_tenant_scope(current_user)

    query = db.query(User).filter(User.id == user_id)
    if tenant_id:
        # SECURITY FIX: Always scope to tenant — even SUPER_ADMIN with a tenant
        # should not be able to delete users from other tenants
        query = query.filter(User.tenant_id == tenant_id)
    user_to_delete = query.first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    # SECURITY FIX: Validate that the target user belongs to the same tenant
    if tenant_id and str(user_to_delete.tenant_id) != str(tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Target user does not belong to your tenant."
        )
        
    _anonymize_user(db, user_to_delete)
        
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
    user_query = db.query(User).filter(User.id == user_id)
    if tenant_id:
        user_query = user_query.filter(User.tenant_id == tenant_id)
    user = user_query.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
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
    tenant_id = _privacy_tenant_scope(current_user)

    tenant_clause = ""
    params = {}
    if tenant_id:
        tenant_clause = "AND al.tenant_id = CAST(:tenant_id AS UUID)"
        params["tenant_id"] = str(tenant_id)

    query = sql_text(f"""
        SELECT al.id, al.created_at AS export_date,
               u.email AS user_email, u.first_name, u.last_name,
               al.user_id AS requester_id,
               al.details
        FROM audit_logs al
        LEFT JOIN users u ON u.id::text = al.user_id
        WHERE al.action = 'RGPD_EXPORT'
          {tenant_clause}
        ORDER BY al.created_at DESC
        LIMIT 100
    """)

    rows = db.execute(query, params).mappings().all()
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


@router.get("/export-history/me/")
def get_my_rgpd_export_history(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return only the authenticated user's own export history."""
    user_id = str(current_user["id"])
    tenant_id = current_user.get("tenant_id")
    query = db.query(AuditLog).filter(
        AuditLog.action == "RGPD_EXPORT",
        AuditLog.user_id == user_id,
    )
    if tenant_id:
        query = query.filter(AuditLog.tenant_id == tenant_id)
    rows = query.order_by(AuditLog.created_at.desc()).limit(10).all()
    return [
        {
            "id": str(row.id),
            "export_date": row.created_at.isoformat() if row.created_at else None,
            "details": row.details,
        }
        for row in rows
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
    tenant_id = _privacy_tenant_scope(current_user)

    tenant_clause = ""
    params = {}
    if tenant_id:
        tenant_clause = "AND u.tenant_id = CAST(:tenant_id AS UUID)"
        params["tenant_id"] = str(tenant_id)

    query = sql_text(f"""
        SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
               u.is_active,
               EXTRACT(YEAR FROM AGE(NOW(), u.created_at))::int AS account_age_years
        FROM users u
        WHERE u.is_active = false
          {tenant_clause}
          AND u.created_at < NOW() - INTERVAL '5 years'
        ORDER BY u.created_at ASC
        LIMIT 100
    """)

    rows = db.execute(query, params).mappings().all()

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


# ─── Consent CRUD (/rgpd/consent/ and /consent/ alias) ───────────────────────

consent_router = APIRouter()


@consent_router.get("/")
def list_consents(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /consent/ — fetch current user's consent records."""
    from sqlalchemy import text as _text
    user_id = current_user.get("id")
    rows = db.execute(_text("""
        SELECT id, user_id, consent_type, consent_given, consent_version,
               details, withdrawal_date, created_at, updated_at
        FROM user_consents
        WHERE user_id = :user_id
        ORDER BY created_at DESC
    """), {"user_id": user_id}).mappings().all()
    return [dict(r) for r in rows]


@consent_router.post("/record/", status_code=201)
def record_consent(
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """POST /consent/record/ — record a consent choice for the current user."""
    import json
    from sqlalchemy import text as _text
    user_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    consent_type = body.get("consent_type")
    consent_given = body.get("consent_given", False)
    consent_version = body.get("consent_version", "1.0")
    details = body.get("details")

    if not consent_type:
        raise HTTPException(status_code=400, detail="consent_type is required")

    # Upsert: update existing row or insert
    row = db.execute(_text("""
        INSERT INTO user_consents (tenant_id, user_id, consent_type, consent_given, consent_version, details)
        VALUES (:tenant_id, :user_id, :consent_type, :consent_given, :consent_version, :details)
        ON CONFLICT DO NOTHING
        RETURNING id, user_id, consent_type, consent_given, consent_version, created_at
    """), {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "consent_type": consent_type,
        "consent_given": consent_given,
        "consent_version": consent_version,
        "details": json.dumps(details) if details else None,
    }).mappings().first()

    if not row:
        # Update existing
        row = db.execute(_text("""
            UPDATE user_consents
            SET consent_given = :consent_given,
                consent_version = :consent_version,
                details = :details,
                updated_at = NOW(),
                withdrawal_date = CASE WHEN :consent_given = FALSE THEN NOW() ELSE NULL END
            WHERE user_id = :user_id AND consent_type = :consent_type
            RETURNING id, user_id, consent_type, consent_given, consent_version, updated_at
        """), {
            "user_id": user_id,
            "consent_type": consent_type,
            "consent_given": consent_given,
            "consent_version": consent_version,
            "details": json.dumps(details) if details else None,
        }).mappings().first()

    db.commit()
    return dict(row) if row else {"success": True, "consent_type": consent_type}
