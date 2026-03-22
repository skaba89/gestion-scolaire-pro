"""MFA / Backup Codes endpoints"""
import secrets
import hashlib
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

NUM_CODES = 10
CODE_LENGTH = 8  # characters per segment (format: XXXX-XXXX)


class VerifyCodeRequest(BaseModel):
    code: str


def _generate_raw_code() -> str:
    """Generate a random backup code in XXXX-XXXX format."""
    raw = secrets.token_hex(4).upper()  # 8 hex chars
    return f"{raw[:4]}-{raw[4:]}"


def _hash_code(code: str) -> str:
    """SHA-256 hash of the normalized (uppercase, no dash) code."""
    normalized = code.upper().replace("-", "").strip()
    return hashlib.sha256(normalized.encode()).hexdigest()


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/backup-codes/generate/")
def generate_backup_codes(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Generate 10 new backup recovery codes for the current user.
    Invalidates all existing codes first.
    Returns the plain-text codes (only shown once).
    """
    user_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Invalidate existing codes
    db.execute(
        text("DELETE FROM mfa_backup_codes WHERE user_id = :user_id"),
        {"user_id": user_id}
    )

    plain_codes = []
    for _ in range(NUM_CODES):
        code = _generate_raw_code()
        code_hash = _hash_code(code)
        db.execute(
            text("""
                INSERT INTO mfa_backup_codes (id, user_id, tenant_id, code_hash, used, created_at)
                VALUES (:id, :user_id, :tenant_id, :code_hash, FALSE, :created_at)
            """),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "tenant_id": tenant_id,
                "code_hash": code_hash,
                "created_at": datetime.utcnow()
            }
        )
        plain_codes.append(code)

    db.commit()
    return {"codes": plain_codes}


@router.post("/backup-codes/verify/")
def verify_backup_code(
    body: VerifyCodeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Verify a backup recovery code.
    Marks the code as used if valid.
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    code_hash = _hash_code(body.code)

    row = db.execute(
        text("""
            SELECT id, used FROM mfa_backup_codes
            WHERE user_id = :user_id AND code_hash = :code_hash
            LIMIT 1
        """),
        {"user_id": user_id, "code_hash": code_hash}
    ).fetchone()

    if not row:
        return {"valid": False, "message": "Code invalide"}

    if row.used:
        return {"valid": False, "message": "Code déjà utilisé"}

    # Mark as used
    db.execute(
        text("UPDATE mfa_backup_codes SET used = TRUE, used_at = :used_at WHERE id = :id"),
        {"id": row.id, "used_at": datetime.utcnow()}
    )
    db.commit()

    return {"valid": True, "message": "Code vérifié avec succès"}


@router.get("/backup-codes/")
def list_backup_codes(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List all backup codes for the current user (status only, no plain-text codes).
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    rows = db.execute(
        text("""
            SELECT id, used, created_at, used_at
            FROM mfa_backup_codes
            WHERE user_id = :user_id
            ORDER BY created_at DESC
        """),
        {"user_id": user_id}
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "used": r.used,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "used_at": r.used_at.isoformat() if r.used_at else None,
        }
        for r in rows
    ]


@router.get("/backup-codes/count/")
def count_backup_codes(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Count remaining (unused) backup codes for the current user."""
    user_id = current_user.get("id")
    if not user_id:
        return {"count": 0}

    row = db.execute(
        text("""
            SELECT COUNT(*) AS remaining
            FROM mfa_backup_codes
            WHERE user_id = :user_id AND used = FALSE
        """),
        {"user_id": user_id}
    ).fetchone()

    return {"count": int(row.remaining or 0)}


# ─── Email OTP ────────────────────────────────────────────────────────────────

class OTPRequest(BaseModel):
    email: str

class OTPVerifyRequest(BaseModel):
    code: str

@router.post("/otp/request/")
def request_otp(
    body: OTPRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Generate and store an email OTP for the authenticated user.
    Rate limited to 3 per hour.
    Returns remaining attempt count after this request.
    """
    import random, string
    from datetime import timedelta

    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Rate-limit check: max 3 OTPs in the past hour
    count_row = db.execute(
        text("""
            SELECT COUNT(*) AS cnt FROM email_otps
            WHERE user_id = :user_id AND created_at > NOW() - INTERVAL '1 hour'
        """),
        {"user_id": user_id}
    ).fetchone()
    used = int(count_row.cnt) if count_row else 0
    max_attempts = 3
    if used >= max_attempts:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait 1 hour before requesting a new code.")

    # Generate 6-digit code
    code = "".join(random.choices(string.digits, k=6))
    code_hash = _hash_code(code)
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    # Invalidate previous OTPs for this user
    db.execute(
        text("UPDATE email_otps SET is_valid = false WHERE user_id = :user_id AND is_valid = true"),
        {"user_id": user_id}
    )

    # Store new OTP
    db.execute(
        text("""
            INSERT INTO email_otps (id, user_id, code_hash, expires_at, is_valid, created_at)
            VALUES (:id, :user_id, :code_hash, :expires_at, true, NOW())
        """),
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "code_hash": code_hash,
            "expires_at": expires_at
        }
    )
    db.commit()

    # In production: send email here via SMTP/SendGrid/etc.
    # For now we log it — real impl would use a background task or email service.
    print(f"[OTP] Code for {body.email}: {code} (expires {expires_at})")

    return {"success": True, "remaining": max_attempts - used - 1}


@router.post("/otp/verify/")
def verify_otp(
    body: OTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Verify an email OTP submitted by the user."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    code_hash = _hash_code(body.code.strip())

    row = db.execute(
        text("""
            SELECT id, expires_at, is_valid FROM email_otps
            WHERE user_id = :user_id AND code_hash = :code_hash AND is_valid = true
            ORDER BY created_at DESC LIMIT 1
        """),
        {"user_id": user_id, "code_hash": code_hash}
    ).fetchone()

    if not row:
        return {"valid": False}

    # Check expiry
    if row.expires_at < datetime.utcnow():
        db.execute(text("UPDATE email_otps SET is_valid = false WHERE id = :id"), {"id": row.id})
        db.commit()
        return {"valid": False}

    # Invalidate after use
    db.execute(text("UPDATE email_otps SET is_valid = false WHERE id = :id"), {"id": row.id})
    db.commit()

    return {"valid": True}


@router.get("/otp/remaining/")
def get_otp_remaining(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get number of remaining OTP requests allowed in the current hour."""
    user_id = current_user.get("id")
    if not user_id:
        return {"remaining": 0}

    count_row = db.execute(
        text("""
            SELECT COUNT(*) AS cnt FROM email_otps
            WHERE user_id = :user_id AND created_at > NOW() - INTERVAL '1 hour'
        """),
        {"user_id": user_id}
    ).fetchone()

    used = int(count_row.cnt) if count_row else 0
    return {"remaining": max(0, 3 - used)}

@router.get("/status/")
def get_mfa_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Check if MFA is enabled for the current user."""
    user_id = current_user.get("id")
    row = db.execute(
        text("SELECT mfa_enabled FROM users WHERE id = :user_id"),
        {"user_id": user_id}
    ).fetchone()
    return {"enabled": bool(row.mfa_enabled) if row else False}

@router.post("/toggle/")
def toggle_mfa(
    body: dict, # {"enabled": bool}
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Enable or disable MFA for the current user."""
    user_id = current_user.get("id")
    enabled = body.get("enabled", False)
    db.execute(
        text("UPDATE users SET mfa_enabled = :enabled WHERE id = :user_id"),
        {"enabled": enabled, "user_id": user_id}
    )
    db.commit()
    return {"success": True, "enabled": enabled}
