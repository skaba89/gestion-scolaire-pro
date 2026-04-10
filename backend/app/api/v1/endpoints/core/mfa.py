"""MFA / Backup Codes endpoints"""
import secrets
import hashlib
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
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


def _ensure_mfa_tables(db: Session):
    """Ensure MFA-related tables exist. Safe to call multiple times."""
    try:
        # Check if mfa_backup_codes table exists
        table_check = db.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'mfa_backup_codes' AND table_schema = 'public'
            )
        """)).scalar()

        if not table_check:
            logger.info("Creating mfa_backup_codes table...")
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS mfa_backup_codes (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    tenant_id UUID,
                    code_hash VARCHAR(255) NOT NULL,
                    used BOOLEAN NOT NULL DEFAULT FALSE,
                    used_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """))
            db.execute(text("CREATE INDEX IF NOT EXISTS ix_mfa_backup_codes_user_id ON mfa_backup_codes(user_id)"))
            db.commit()
            logger.info("mfa_backup_codes table created")

        # Check if email_otps table exists
        otp_table_check = db.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'email_otps' AND table_schema = 'public'
            )
        """)).scalar()

        if not otp_table_check:
            logger.info("Creating email_otps table...")
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS email_otps (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    code_hash VARCHAR(255) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """))
            db.execute(text("CREATE INDEX IF NOT EXISTS ix_email_otps_user_id ON email_otps(user_id)"))
            db.commit()
            logger.info("email_otps table created")

        # Ensure mfa_enabled column exists on users table
        col_check = db.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'mfa_enabled'
            )
        """)).scalar()

        if not col_check:
            logger.info("Adding mfa_enabled column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
            db.commit()

    except Exception as e:
        logger.error("Failed to ensure MFA tables: %s", e)
        db.rollback()


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
    try:
        _ensure_mfa_tables(db)
    except Exception as e:
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

    user_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
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
                    "created_at": datetime.now(timezone.utc)
                }
            )
            plain_codes.append(code)

        db.commit()
        return {"codes": plain_codes}
    except Exception as e:
        db.rollback()
        logger.error("Failed to generate backup codes: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.post("/backup-codes/verify/")
def verify_backup_code(
    body: VerifyCodeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Verify a backup recovery code. Marks the code as used if valid."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        _ensure_mfa_tables(db)
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

        db.execute(
            text("UPDATE mfa_backup_codes SET used = TRUE, used_at = :used_at WHERE id = :id"),
            {"id": row.id, "used_at": datetime.now(timezone.utc)}
        )
        db.commit()
        return {"valid": True, "message": "Code vérifié avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to verify backup code: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/backup-codes/")
def list_backup_codes(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all backup codes for the current user (status only, no plain-text codes)."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        _ensure_mfa_tables(db)
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
    except Exception as e:
        logger.error("Failed to list backup codes: %s", e)
        return []


@router.get("/backup-codes/count/")
def count_backup_codes(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Count remaining (unused) backup codes for the current user."""
    user_id = current_user.get("id")
    if not user_id:
        return {"count": 0}

    try:
        _ensure_mfa_tables(db)
        row = db.execute(
            text("""
                SELECT COUNT(*) AS remaining
                FROM mfa_backup_codes
                WHERE user_id = :user_id AND used = FALSE
            """),
            {"user_id": user_id}
        ).fetchone()

        return {"count": int(row.remaining or 0)}
    except Exception as e:
        logger.error("Failed to count backup codes: %s", e)
        return {"count": 0}


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
    """
    try:
        _ensure_mfa_tables(db)
    except Exception as e:
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

    import random, string
    from datetime import timedelta

    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
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
            raise HTTPException(status_code=429, detail="Limite atteinte. Veuillez attendre 1 heure avant de demander un nouveau code.")

        # Generate 6-digit code
        code = "".join(random.choices(string.digits, k=6))
        code_hash = _hash_code(code)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

        # Invalidate previous OTPs
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
        return {"success": True, "remaining": max_attempts - used - 1}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to request OTP: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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

    try:
        _ensure_mfa_tables(db)
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

        if row.expires_at < datetime.now(timezone.utc):
            db.execute(text("UPDATE email_otps SET is_valid = false WHERE id = :id"), {"id": row.id})
            db.commit()
            return {"valid": False}

        db.execute(text("UPDATE email_otps SET is_valid = false WHERE id = :id"), {"id": row.id})
        db.commit()
        return {"valid": True}
    except Exception as e:
        db.rollback()
        logger.error("Failed to verify OTP: %s", e)
        return {"valid": False}


@router.get("/otp/remaining/")
def get_otp_remaining(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get number of remaining OTP requests allowed in the current hour."""
    user_id = current_user.get("id")
    if not user_id:
        return {"remaining": 0}

    try:
        _ensure_mfa_tables(db)
        count_row = db.execute(
            text("""
                SELECT COUNT(*) AS cnt FROM email_otps
                WHERE user_id = :user_id AND created_at > NOW() - INTERVAL '1 hour'
            """),
            {"user_id": user_id}
        ).fetchone()

        used = int(count_row.cnt) if count_row else 0
        return {"remaining": max(0, 3 - used)}
    except Exception:
        return {"remaining": 0}


@router.get("/status/")
def get_mfa_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Check if MFA is enabled for the current user."""
    user_id = current_user.get("id")

    try:
        _ensure_mfa_tables(db)
        if not user_id:
            return {"enabled": False}

        row = db.execute(
            text("SELECT mfa_enabled FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        ).fetchone()
        return {"enabled": bool(row.mfa_enabled) if row else False}
    except Exception as e:
        logger.error("Failed to get MFA status: %s", e)
        return {"enabled": False}


@router.post("/toggle/")
def toggle_mfa(
    body: dict,  # {"enabled": bool}
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Enable or disable MFA for the current user."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    enabled = body.get("enabled", False)

    try:
        _ensure_mfa_tables(db)
        db.execute(
            text("UPDATE users SET mfa_enabled = :enabled WHERE id = :user_id"),
            {"enabled": enabled, "user_id": user_id}
        )
        db.commit()
        return {"success": True, "enabled": enabled}
    except Exception as e:
        db.rollback()
        logger.error("Failed to toggle MFA: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")
