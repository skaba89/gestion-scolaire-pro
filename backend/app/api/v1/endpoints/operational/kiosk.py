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

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import KioskDevice, Student, StudentCheckIn, Tenant
from app.schemas.kiosk import KioskDeviceCreate, KioskDeviceCreated, KioskDeviceInDB, KioskScanRequest
from app.utils.audit import log_audit

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
    device_in: KioskDeviceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin_or_director(current_user)
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID missing")

    token = secrets.token_urlsafe(32)
    db_obj = KioskDevice(
        tenant_id=tenant_id,
        label=device_in.label,
        token_hash=_hash_token(token),
        is_active=True,
        created_by_user_id=current_user.get("id"),
    )
    db.add(db_obj)

    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="KIOSK_DEVICE_CREATED", resource_type="kiosk_device",
        details={"label": device_in.label},
    )

    db.commit()
    db.refresh(db_obj)

    return KioskDeviceCreated(
        id=db_obj.id, label=db_obj.label, is_active=db_obj.is_active,
        last_used_at=db_obj.last_used_at, created_at=db_obj.created_at,
        token=token,
    )


@router.get("/devices/", response_model=list[KioskDeviceInDB])
def list_kiosk_devices(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin_or_director(current_user)
    tenant_id = current_user.get("tenant_id")
    return db.query(KioskDevice).filter(
        KioskDevice.tenant_id == tenant_id
    ).order_by(KioskDevice.created_at.desc()).all()


@router.delete("/devices/{device_id}/", status_code=status.HTTP_204_NO_CONTENT)
def revoke_kiosk_device(
    device_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin_or_director(current_user)
    tenant_id = current_user.get("tenant_id")
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

    check_in = StudentCheckIn(
        tenant_id=device.tenant_id,
        student_id=student.id,
        checked_at=datetime.now(timezone.utc).replace(tzinfo=None),
        direction=direction,
        source="KIOSK",
    )
    db.add(check_in)
    db.commit()

    return {
        "status": "ok",
        "student_first_name": student.first_name,
        "student_last_name": student.last_name,
        "direction": direction,
        "checked_at": check_in.checked_at,
    }


def _looks_like_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False
