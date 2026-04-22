"""Alumni Portal endpoints — sovereign backend replacing Supabase direct access."""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel
import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class DocumentRequestCreate(BaseModel):
    document_type: str          # transcript | diploma | certificate | attestation | other
    document_description: Optional[str] = None
    purpose: str
    urgency: str = "normal"     # normal | urgent
    delivery_method: str = "email"  # email | mail | pickup
    delivery_address: Optional[str] = None


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard/")
def alumni_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """
        Aggregate stats for the alumni dashboard:
        - document requests counts by status
        - unread messages count
        - 3 most recent requests
        """
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Document request stats
        stats_rows = db.execute(text("""
            SELECT status, COUNT(*) AS cnt
            FROM alumni_document_requests
            WHERE alumni_id = :user_id
            GROUP BY status
        """), {"user_id": user_id}).fetchall()

        status_map: dict[str, int] = {}
        for r in stats_rows:
            status_map[r.status] = r.cnt

        pending = status_map.get("pending", 0)
        in_progress = (status_map.get("in_progress", 0) + status_map.get("awaiting_validation", 0))
        completed = status_map.get("completed", 0)
        total = sum(status_map.values())

        # Unread messages count (via sovereign messaging)
        unread = db.execute(text("""
            SELECT COUNT(m.id) AS cnt
            FROM messages m
            JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE cp.user_id = :user_id
              AND m.sender_id != :user_id
              AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        """), {"user_id": user_id}).scalar() or 0

        # Recent requests (last 3)
        recent = db.execute(text("""
            SELECT id, document_type, status, urgency, created_at
            FROM alumni_document_requests
            WHERE alumni_id = :user_id
            ORDER BY created_at DESC
            LIMIT 3
        """), {"user_id": user_id}).fetchall()

        return {
            "requests_stats": {
                "pending": pending,
                "in_progress": in_progress,
                "completed": completed,
                "total": total,
            },
            "unread_count": unread,
            "recent_requests": [{
                "id": str(r.id),
                "document_type": r.document_type,
                "status": r.status,
                "urgency": r.urgency,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            } for r in recent],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error in alumni_dashboard: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Document Requests ────────────────────────────────────────────────────────

@router.get("/document-requests/")
def list_document_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """List all document requests for the current alumni user."""
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        rows = db.execute(text("""
            SELECT id, document_type, document_description, purpose, urgency,
                   delivery_method, delivery_address, status, validation_notes,
                   created_at, updated_at
            FROM alumni_document_requests
            WHERE alumni_id = :user_id
            ORDER BY created_at DESC
        """), {"user_id": user_id}).fetchall()

        return [{
            "id": str(r.id),
            "document_type": r.document_type,
            "document_description": r.document_description,
            "purpose": r.purpose,
            "urgency": r.urgency,
            "delivery_method": r.delivery_method,
            "delivery_address": r.delivery_address,
            "status": r.status,
            "validation_notes": r.validation_notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        } for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error listing document requests: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.post("/document-requests/", status_code=status.HTTP_201_CREATED)
def create_document_request(
    body: DocumentRequestCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """Submit a new document request."""
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")
        if not user_id or not tenant_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        request_id = db.execute(text("""
            INSERT INTO alumni_document_requests
                (tenant_id, alumni_id, document_type, document_description, purpose,
                 urgency, delivery_method, delivery_address, status, created_at, updated_at)
            VALUES
                (:tenant_id, :alumni_id, :document_type, :document_description, :purpose,
                 :urgency, :delivery_method, :delivery_address, 'pending', NOW(), NOW())
            RETURNING id
        """), {
            "tenant_id": tenant_id,
            "alumni_id": user_id,
            "document_type": body.document_type,
            "document_description": body.document_description,
            "purpose": body.purpose,
            "urgency": body.urgency,
            "delivery_method": body.delivery_method,
            "delivery_address": body.delivery_address if body.delivery_method != "email" else None,
        }).scalar()

        # Log history entry
        db.execute(text("""
            INSERT INTO alumni_request_history
                (request_id, action, new_status, performed_by, notes, created_at)
            VALUES (:request_id, 'created', 'pending', :user_id, 'Demande soumise', NOW())
        """), {"request_id": str(request_id), "user_id": user_id})

        db.commit()
        return {"id": str(request_id), "message": "Demande soumise avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error creating document request: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.patch("/document-requests/{request_id}/cancel/")
def cancel_document_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """Cancel a pending document request (alumni can only cancel their own pending requests)."""
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        result = db.execute(text("""
            UPDATE alumni_document_requests
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = :request_id AND alumni_id = :user_id AND status = 'pending'
        """), {"request_id": request_id, "user_id": user_id})

        if result.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Demande introuvable ou ne peut pas être annulée"
            )

        db.execute(text("""
            INSERT INTO alumni_request_history
                (request_id, action, new_status, performed_by, notes, created_at)
            VALUES (:request_id, 'cancelled', 'cancelled', :user_id, 'Annulé par l''alumni', NOW())
        """), {"request_id": request_id, "user_id": user_id})

        db.commit()
        return {"message": "Demande annulée"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error cancelling document request: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/document-requests/{request_id}/history/")
def get_request_history(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """Get the action history for a specific document request."""
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Ensure the request belongs to this alumni
        check = db.execute(text("""
            SELECT id FROM alumni_document_requests WHERE id = :id AND alumni_id = :user_id
        """), {"id": request_id, "user_id": user_id}).fetchone()
        if not check:
            raise HTTPException(status_code=404, detail="Demande introuvable")

        rows = db.execute(text("""
            SELECT h.id, h.action, h.new_status, h.notes, h.created_at,
                   u.first_name, u.last_name
            FROM alumni_request_history h
            LEFT JOIN users u ON u.id = h.performed_by
            WHERE h.request_id = :request_id
            ORDER BY h.created_at DESC
        """), {"request_id": request_id}).fetchall()

        return [{
            "id": str(r.id),
            "action": r.action,
            "new_status": r.new_status,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "performer": {"first_name": r.first_name, "last_name": r.last_name} if r.first_name else None,
        } for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting request history: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Careers ──────────────────────────────────────────────────────────────────

@router.get("/careers/jobs/")
def alumni_job_offers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """List active job offers for the tenant."""
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []

        rows = db.execute(text("""
            SELECT id, title, company_name, offer_type, description, location,
                   is_remote, application_deadline, contact_email, created_at
            FROM job_offers
            WHERE tenant_id = :tenant_id AND is_active = true
            ORDER BY created_at DESC
        """), {"tenant_id": tenant_id}).fetchall()

        return [{
            "id": str(r.id), "title": r.title, "company_name": r.company_name,
            "offer_type": r.offer_type, "description": r.description,
            "location": r.location, "is_remote": r.is_remote,
            "application_deadline": r.application_deadline.isoformat() if r.application_deadline else None,
            "contact_email": r.contact_email,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error listing job offers: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/careers/mentors/")
def alumni_mentors(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """List available alumni mentors for the tenant."""
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []

        rows = db.execute(text("""
            SELECT id, first_name, last_name, current_position, current_company,
                   bio, expertise_areas, linkedin_url
            FROM alumni_mentors
            WHERE tenant_id = :tenant_id AND is_available = true
            ORDER BY first_name
        """), {"tenant_id": tenant_id}).fetchall()

        return [{
            "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
            "current_position": r.current_position, "current_company": r.current_company,
            "bio": r.bio, "expertise_areas": r.expertise_areas or [],
            "linkedin_url": r.linkedin_url,
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error listing mentors: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/careers/events/")
def alumni_career_events(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """List upcoming career events for the tenant."""
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        rows = db.execute(text("""
            SELECT id, title, description, event_type, start_datetime,
                   location, is_online
            FROM career_events
            WHERE tenant_id = :tenant_id AND is_active = true
              AND start_datetime >= :now
            ORDER BY start_datetime ASC
        """), {"tenant_id": tenant_id, "now": now}).fetchall()

        return [{
            "id": str(r.id), "title": r.title, "description": r.description,
            "event_type": r.event_type,
            "start_datetime": r.start_datetime.isoformat() if r.start_datetime else None,
            "location": r.location, "is_online": r.is_online,
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error listing career events: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Career Applications ──────────────────────────────────────────────────────

@router.get("/careers/applications/")
def list_job_applications(
    student_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /alumni/careers/applications/ — list job applications (scoped to student if provided)."""
    try:
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        where = ["ja.tenant_id = :tid"]
        params: dict = {"tid": tenant_id}

        # Non-admins can only see their own applications
        roles = current_user.get("roles", [])
        if not any(r in roles for r in ("TENANT_ADMIN", "DIRECTOR", "STAFF")):
            where.append("ja.student_id = :uid")
            params["uid"] = student_id or user_id
        elif student_id:
            where.append("ja.student_id = :uid")
            params["uid"] = student_id

        rows = db.execute(text(f"""
            SELECT ja.id, ja.student_id, ja.job_offer_id, ja.cover_letter,
                   ja.status, ja.applied_at, ja.created_at,
                   jo.title as job_title, jo.company_name
            FROM job_applications ja
            LEFT JOIN job_offers jo ON jo.id = ja.job_offer_id
            WHERE {' AND '.join(where)}
            ORDER BY ja.applied_at DESC NULLS LAST, ja.created_at DESC
            LIMIT 200
        """), params).mappings().all()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error("Error listing job applications: %s", e)
        return []


@router.post("/careers/applications/", status_code=201)
def create_job_application(
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """POST /alumni/careers/applications/ — apply to a job offer."""
    import uuid as _uuid
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    try:
        new_id = str(_uuid.uuid4())
        db.execute(text("""
            INSERT INTO job_applications
            (id, tenant_id, student_id, job_offer_id, cover_letter, status, applied_at, created_at)
            VALUES (:id, :tid, :sid, :jid, :cover, 'pending', NOW(), NOW())
            ON CONFLICT (student_id, job_offer_id) DO NOTHING
        """), {
            "id": new_id,
            "tid": tenant_id,
            "sid": body.get("student_id") or user_id,
            "jid": body.get("job_offer_id"),
            "cover": body.get("cover_letter", ""),
        })
        db.commit()
        return {"id": new_id, **body, "status": "pending"}
    except Exception as e:
        db.rollback()
        logger.error("Error creating job application: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/mentorship-requests/")
def list_mentorship_requests_student(
    student_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /alumni/mentorship-requests/ — student-facing list of mentorship requests."""
    try:
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        effective_id = student_id or user_id
        rows = db.execute(text("""
            SELECT m.id, m.student_id, m.mentor_id, m.message, m.goals,
                   m.status, m.created_at,
                   am.first_name as mentor_first_name, am.last_name as mentor_last_name,
                   am.current_position, am.current_company
            FROM mentorship_requests m
            LEFT JOIN alumni_mentors am ON am.id = m.mentor_id
            WHERE m.tenant_id = :tid AND m.student_id = :sid
            ORDER BY m.created_at DESC
            LIMIT 100
        """), {"tid": tenant_id, "sid": effective_id}).mappings().all()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error("Error listing mentorship requests: %s", e)
        return []


# ─── Messaging recipients (staff for alumni to contact) ───────────────────────

@router.get("/messaging/staff-recipients/")
def alumni_staff_recipients(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        """
        Return staff/admin users available for the alumni to message.
        Replaces the Supabase multi-step query in AlumniMessages.tsx.
        """
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        rows = db.execute(text("""
            SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, ur.role
            FROM users u
            JOIN user_roles ur ON ur.user_id = u.id
            WHERE ur.tenant_id = :tenant_id
              AND ur.role IN ('STAFF', 'TENANT_ADMIN', 'DIRECTOR')
              AND u.id != :user_id
            ORDER BY u.last_name, u.first_name
        """), {"tenant_id": tenant_id, "user_id": user_id}).fetchall()

        role_label = {"STAFF": "Secrétariat", "TENANT_ADMIN": "Administration", "DIRECTOR": "Direction"}

        return [{
            "id": str(r.id),
            "first_name": r.first_name or "",
            "last_name": r.last_name or "",
            "email": r.email or "",
            "info": role_label.get(r.role, r.role),
        } for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error listing staff recipients: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

# ─── Admin Endpoints ─────────────────────────────────────────────────────────

@router.get("/admin/mentors/")
def admin_list_mentors(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")), # Simplified permission
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        rows = db.execute(text("""
            SELECT * FROM alumni_mentors WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
        """), {"tenant_id": tenant_id}).mappings().all()
        return rows
    except Exception as e:
        db.rollback()
        logger.error("Error admin listing mentors: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/admin/mentorship-requests/")
def admin_list_mentorship_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        rows = db.execute(text("""
            SELECT 
                m.*,
                s.id as student_id, s.first_name as student_first_name, s.last_name as student_last_name, s.email as student_email,
                am.id as mentor_id, am.first_name as mentor_first_name, am.last_name as mentor_last_name, 
                am.current_company, am.current_position
            FROM mentorship_requests m
            LEFT JOIN students s ON s.id = m.student_id
            LEFT JOIN alumni_mentors am ON am.id = m.mentor_id
            WHERE m.tenant_id = :tenant_id
            ORDER BY m.created_at DESC
        """), {"tenant_id": tenant_id}).fetchall()

        return [{
            **dict(r._mapping),
            "students": {"id": r.student_id, "first_name": r.student_first_name, "last_name": r.student_last_name, "email": r.student_email},
            "alumni_mentors": {"id": r.mentor_id, "first_name": r.mentor_first_name, "last_name": r.mentor_last_name, "current_company": r.current_company, "current_position": r.current_position}
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error admin listing mentorship requests: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/admin/document-requests/")
def admin_list_document_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        rows = db.execute(text("""
            SELECT * FROM alumni_document_requests WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
        """), {"tenant_id": tenant_id}).mappings().all()
        return rows
    except Exception as e:
        db.rollback()
        logger.error("Error admin listing document requests: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/admin/job-applications/")
def admin_list_job_applications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        rows = db.execute(text("""
            SELECT 
                app.*,
                s.id as student_id, s.first_name, s.last_name, s.registration_number, s.email,
                jo.id as job_id, jo.title, jo.company_name
            FROM job_applications app
            LEFT JOIN students s ON s.id = app.student_id
            LEFT JOIN job_offers jo ON jo.id = app.job_offer_id
            WHERE app.tenant_id = :tenant_id
            ORDER BY app.applied_at DESC
        """), {"tenant_id": tenant_id}).fetchall()

        return [{
            **dict(r._mapping),
            "students": {"id": r.student_id, "first_name": r.first_name, "last_name": r.last_name, "registration_number": r.registration_number, "email": r.email},
            "job_offers": {"id": r.job_id, "title": r.title, "company_name": r.company_name}
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error admin listing job applications: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/admin/event-registrations/")
def admin_list_event_registrations(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        rows = db.execute(text("""
            SELECT event_id, id FROM career_event_registrations WHERE tenant_id = :tenant_id
        """), {"tenant_id": tenant_id}).mappings().all()
        return rows
    except Exception as e:
        db.rollback()
        logger.error("Error admin listing event registrations: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")
