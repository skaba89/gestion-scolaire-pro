"""QR kiosk mode — unattended check-in/check-out stations.

Two audiences on this router:
  - Device management (POST/GET/DELETE /kiosk/devices/): normal JWT auth,
    TENANT_ADMIN/DIRECTOR only — issuing a device credential is an
    admin-level action, not something every school_life:write role
    (e.g. TEACHER) should be able to do.
  - The scan endpoint (POST /kiosk/scan/): no JWT. The device itself
    authenticates via the X-Kiosk-Token header (see TenantMiddleware
    public_paths exemption). This is intentional: a kiosk is a shared,
    unattended tablet — requiring a staff JWT on it would mean either
    leaving a staff session logged in on a public device, or nobody being
    able to use it. A scoped, revocable device token is the standard
    pattern for this (same idea as a POS terminal credential).
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models import KioskDevice, Room, Student, StudentCheckIn, Tenant
from app.schemas.kiosk import KioskDeviceCreate, KioskDeviceCreated, KioskDeviceInDB, KioskScanRequest
from app.utils.audit import log_audit

# A student may badge in up to this many minutes before a course's
# scheduled start_time — otherwise a student arriving a few minutes early
# would find no matching slot yet and get a plain, course-less check-in.
BADGE_IN_GRACE_MINUTES = 15

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_admin_or_director(current_user: dict):
    roles = current_user.get("roles", [])
    if not any(r in ("TENANT_ADMIN", "DIRECTOR", "SUPER_ADMIN") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux TENANT_ADMIN ou DIRECTOR",
        )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ─── Device management (JWT-authenticated) ───────────────────────────────────

@router.post("/devices/", response_model=KioskDeviceCreated, status_code=status.HTTP_201_CREATED)
def create_kiosk_device(
    request: Request,
    device_in: KioskDeviceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin_or_director(current_user)
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID missing")

    if device_in.room_id:
        room = db.query(Room).filter(Room.id == device_in.room_id, Room.tenant_id == tenant_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Salle introuvable dans cet établissement")

    token = secrets.token_urlsafe(32)
    db_obj = KioskDevice(
        tenant_id=tenant_id,
        label=device_in.label,
        token_hash=_hash_token(token),
        is_active=True,
        created_by_user_id=current_user.get("id"),
        room_id=device_in.room_id,
    )
    db.add(db_obj)

    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="KIOSK_DEVICE_CREATED", resource_type="kiosk_device",
        details={"label": device_in.label, "room_id": device_in.room_id},
    )

    db.commit()
    db.refresh(db_obj)

    return KioskDeviceCreated(
        id=db_obj.id, label=db_obj.label, is_active=db_obj.is_active, room_id=db_obj.room_id,
        last_used_at=db_obj.last_used_at, created_at=db_obj.created_at,
        token=token,
    )


@router.get("/devices/", response_model=list[KioskDeviceInDB])
def list_kiosk_devices(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin_or_director(current_user)
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    return db.query(KioskDevice).filter(
        KioskDevice.tenant_id == tenant_id
    ).order_by(KioskDevice.created_at.desc()).all()


@router.delete("/devices/{device_id}/", status_code=status.HTTP_204_NO_CONTENT)
def revoke_kiosk_device(
    request: Request,
    device_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin_or_director(current_user)
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    device = db.query(KioskDevice).filter(
        KioskDevice.id == device_id, KioskDevice.tenant_id == tenant_id
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Appareil introuvable")

    device.is_active = False
    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="KIOSK_DEVICE_REVOKED", resource_type="kiosk_device",
        resource_id=str(device_id), details={"label": device.label},
    )
    db.commit()
    return None


# ─── Scan (device-token authenticated, no JWT) ────────────────────────────────

def _find_current_slot_for_room(db: Session, *, tenant_id, room_id, now: datetime) -> Optional[dict]:
    """Classroom badge-in feature (institutional-readiness audit, 2026-09):
    the course, if any, currently in session in this room — day_of_week
    follows the same 1=Lundi..7=Dimanche (ISO weekday) convention the
    frontend's schedule pages use (see e.g. src/pages/admin/Schedule.tsx),
    matching how schedule.py's own create/update endpoints store it.
    A badge scan is accepted from BADGE_IN_GRACE_MINUTES before start_time
    through end_time, so a student arriving a little early still gets
    matched to the class they're walking into. The grace window is
    resolved in Python (as a plain time-of-day bound) rather than via SQL
    interval arithmetic, to avoid a cast/concatenation footgun on the
    integer bind param."""
    from datetime import timedelta
    now_plus_grace = (now + timedelta(minutes=BADGE_IN_GRACE_MINUTES)).time()
    return db.execute(text("""
        SELECT s.id, s.class_id, s.subject_id, s.teacher_id
        FROM schedule s
        WHERE s.tenant_id = :tenant_id AND s.room_id = :room_id
          AND s.day_of_week = :day_of_week
          AND s.start_time <= :now_plus_grace ::time
          AND s.end_time >= :now_time ::time
        LIMIT 1
    """), {
        "tenant_id": tenant_id, "room_id": room_id, "day_of_week": now.isoweekday(),
        "now_plus_grace": now_plus_grace.strftime("%H:%M:%S"), "now_time": now.strftime("%H:%M:%S"),
    }).mappings().first()


def _auto_mark_attendance(db: Session, *, tenant_id, student_id, slot: dict, today) -> bool:
    """Marks the student PRESENT for the course currently in session in
    the badged room, unless already enrolled elsewhere or already recorded
    for today (never overwrites a teacher's own manual entry — same
    duplicate-guard rule as academic/attendance.py::create_attendance).
    Returns whether a new attendance row was actually created."""
    enrolled = db.execute(text("""
        SELECT 1 FROM enrollments
        WHERE tenant_id = :tenant_id AND student_id = :student_id AND class_id = :class_id
          AND status = 'ACTIVE'
    """), {"tenant_id": tenant_id, "student_id": student_id, "class_id": slot["class_id"]}).first()
    if not enrolled:
        return False

    existing = db.execute(text("""
        SELECT id FROM attendance
        WHERE tenant_id = :tenant_id AND student_id = :student_id AND date = :date
          AND subject_id IS NOT DISTINCT FROM :subject_id
    """), {
        "tenant_id": tenant_id, "student_id": student_id, "date": today, "subject_id": slot["subject_id"],
    }).first()
    if existing:
        return False

    db.execute(text("""
        INSERT INTO attendance (id, tenant_id, student_id, date, status, reason, subject_id, classroom_id, created_at, updated_at)
        VALUES (gen_random_uuid(), :tenant_id, :student_id, :date, 'PRESENT', :reason, :subject_id, :classroom_id, NOW(), NOW())
    """), {
        "tenant_id": tenant_id, "student_id": student_id, "date": today,
        "reason": "Badge automatique (capteur salle)",
        "subject_id": slot["subject_id"], "classroom_id": slot["class_id"],
    })
    return True


@router.post("/scan/")
def kiosk_scan(
    body: KioskScanRequest,
    db: Session = Depends(get_db),
    x_kiosk_token: str = Header(None, alias="X-Kiosk-Token"),
):
    if not x_kiosk_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token d'appareil manquant")

    token_hash = _hash_token(x_kiosk_token)
    # Constant-time comparison happens at the DB layer via exact hash match
    # (the hash itself is the lookup key, not compared value-by-value in
    # Python — there is no timing side-channel to mitigate here since a
    # wrong guess simply misses the unique index).
    device = db.query(KioskDevice).filter(KioskDevice.token_hash == token_hash).first()
    if not device or not device.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Appareil inconnu ou désactivé")

    tenant = db.query(Tenant).filter(Tenant.id == device.tenant_id).first()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Établissement inactif")

    direction = body.direction.upper() if body.direction else "IN"
    if direction not in ("IN", "OUT"):
        direction = "IN"

    qr_payload = body.qr_payload.strip()
    student = None
    if _looks_like_uuid(qr_payload):
        student = db.query(Student).filter(
            Student.tenant_id == device.tenant_id, Student.id == qr_payload,
        ).first()
    if not student:
        student = db.query(Student).filter(
            Student.tenant_id == device.tenant_id, Student.registration_number == qr_payload,
        ).first()

    device.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)

    if not student:
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève introuvable")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    check_in = StudentCheckIn(
        tenant_id=device.tenant_id,
        student_id=student.id,
        checked_at=now,
        direction=direction,
        source="KIOSK",
    )
    db.add(check_in)

    # Classroom badge-in feature (institutional-readiness audit, 2026-09):
    # only for an "IN" scan at a room-bound device, and only if a course
    # is actually in session in that room right now.
    course_name = None
    attendance_marked = False
    if direction == "IN" and device.room_id:
        slot = _find_current_slot_for_room(db, tenant_id=device.tenant_id, room_id=device.room_id, now=now)
        if slot:
            attendance_marked = _auto_mark_attendance(
                db, tenant_id=device.tenant_id, student_id=student.id, slot=slot, today=now.date(),
            )
            subject = db.execute(text("SELECT name FROM subjects WHERE id = :id"), {"id": slot["subject_id"]}).scalar()
            course_name = subject

    db.commit()

    return {
        "status": "ok",
        "student_first_name": student.first_name,
        "student_last_name": student.last_name,
        "direction": direction,
        "checked_at": check_in.checked_at,
        "attendance_marked": attendance_marked,
        "course_name": course_name,
    }


def _looks_like_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False
