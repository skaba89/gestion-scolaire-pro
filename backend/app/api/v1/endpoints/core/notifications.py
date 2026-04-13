import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import Notification, PushSubscription
from app.schemas.push_subscription import PushSubscriptionCreate, PushSubscriptionInDB
from app.schemas.notification import NotificationResponse, NotificationCreate, NotificationBulkCreate, NotificationUpdate

router = APIRouter()

# ─── Push Subscriptions ──────────────────────────────────────────────────────

@router.get("/subscriptions/", response_model=List[PushSubscriptionInDB])
def read_subscriptions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all push subscriptions for the current user."""
    user_id = current_user.get("id")
    subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    return subscriptions

@router.post("/subscriptions/", response_model=PushSubscriptionInDB)
def create_subscription(
    subscription_in: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create or update a push subscription."""
    user_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a tenant to subscribe to notifications"
        )

    existing = db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id,
        PushSubscription.endpoint == subscription_in.endpoint
    ).first()

    if existing:
        for field, value in subscription_in.dict(exclude_unset=True).items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    new_subscription = PushSubscription(
        **subscription_in.dict(),
        user_id=user_id,
        tenant_id=tenant_id
    )
    db.add(new_subscription)
    db.commit()
    db.refresh(new_subscription)
    return new_subscription

@router.delete("/subscriptions/", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(
    endpoint: str = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete push subscriptions."""
    user_id = current_user.get("id")
    query = db.query(PushSubscription).filter(PushSubscription.user_id == user_id)
    if endpoint:
        query = query.filter(PushSubscription.endpoint == endpoint)
    query.delete()
    db.commit()
    return None

# ─── Notifications History ───────────────────────────────────────────────────

@router.get("/", response_model=List[NotificationResponse])
def read_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = False
):
    """Get notification history for current user."""
    user_id = current_user.get("id")
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()
    return notifications

@router.post("/", response_model=NotificationResponse)
def create_notification(
    notification_in: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("notifications:write"))
):
    """Create a new notification (usually internal)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID missing")

    # SECURITY: Non-admin users can only create notifications for themselves.
    # Ignore any user_id supplied in the request body.
    user_roles = current_user.get("roles", [])
    is_admin = any(r in ("SUPER_ADMIN", "ADMIN", "MANAGER") for r in user_roles)
    notification_data = notification_in.dict()
    if not is_admin:
        notification_data["user_id"] = current_user.get("id")

    db_obj = Notification(
        **notification_data,
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.post("/bulk/", status_code=status.HTTP_201_CREATED)
def create_bulk_notifications(
    bulk_in: NotificationBulkCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("notifications:write"))
):
    """Create multiple notifications at once."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID missing")
        
    for n in bulk_in.notifications:
        db_obj = Notification(
            **n.dict(),
            tenant_id=tenant_id
        )
        db.add(db_obj)
    
    db.commit()
    return {"status": "ok", "count": len(bulk_in.notifications)}

@router.patch("/{notification_id}/", response_model=NotificationResponse)
def update_notification(
    notification_id: UUID,
    update_in: NotificationUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update notification status (mark as read)."""
    user_id = current_user.get("id")
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user_id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    for field, value in update_in.dict(exclude_unset=True).items():
        setattr(notification, field, value)
    
    db.commit()
    db.refresh(notification)
    return notification

@router.post("/mark-all-read/")
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Mark all notifications as read for current user."""
    user_id = current_user.get("id")
    db.query(Notification).filter(
        Notification.user_id == user_id, 
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}

@router.delete("/{notification_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a specific notification."""
    user_id = current_user.get("id")
    db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user_id
    ).delete()
    db.commit()
    return None

@router.delete("/clear-read/", status_code=status.HTTP_204_NO_CONTENT)
def clear_read_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete all read notifications for current user."""
    user_id = current_user.get("id")
    db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == True
    ).delete()
    db.commit()
    return None


# ─── Parent Alerts (replaces Supabase Edge Function 'send-parent-alert') ──────

from pydantic import BaseModel
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

class ParentAlertRequest(BaseModel):
    type: str  # 'absence' | 'low_grade'
    student_id: str
    student_name: str
    details: Dict[str, Any] = {}

@router.post("/send-parent-alert/")
def send_parent_alert(
    body: ParentAlertRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Send a notification to parents of a student.
    Replaces Supabase Edge Function 'send-parent-alert'.
    """
    tenant_id = current_user.get("tenant_id")

    if body.type == "absence":
        title = f"Absence signalée — {body.student_name}"
        message = f"{body.student_name} a été absent(e) le {body.details.get('date', '?')}."
    elif body.type == "low_grade":
        pct = round((body.details.get("score", 0) / max(body.details.get("max_score", 1), 1)) * 100)
        title = f"Note insuffisante — {body.student_name}"
        message = (f"{body.student_name} a obtenu {body.details.get('score')}/{body.details.get('max_score')} "
                   f"({pct}%) en {body.details.get('subject_name', '?')} — {body.details.get('assessment_name', '')}.")
    else:
        title = f"Alerte — {body.student_name}"
        message = str(body.details)

    # Find parents of this student
    parent_users = db.execute(text("""
        SELECT DISTINCT u.id FROM parent_students ps
        JOIN users u ON u.id = ps.parent_id
        WHERE ps.student_id = :student_id AND ps.tenant_id = :tenant_id
    """), {"student_id": body.student_id, "tenant_id": tenant_id}).fetchall()

    count = 0
    for pu in parent_users:
        db.execute(text("""
            INSERT INTO notifications (tenant_id, user_id, type, title, message, is_read, created_at)
            VALUES (:tenant_id, :user_id, :type, :title, :message, false, NOW())
        """), {
            "tenant_id": tenant_id, "user_id": str(pu.id),
            "type": body.type.upper(), "title": title, "message": message
        })
        count += 1

    db.commit()
    return {"sent": count, "type": body.type, "student": body.student_name}

