import logging
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, require_permission, verify_password, verify_token_raw
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# ─── Token Blacklist Helpers ─────────────────────────────────────────────

async def blacklist_token(token_jti: str, expires_in_seconds: int) -> None:
    """Add a token to the blacklist in Redis until it naturally expires.

    Uses the token's JTI (or a hash if JTI is absent) as the key, with an
    expiry matching the remaining token lifetime so Redis auto-cleans.
    """
    try:
        from app.core.cache import redis_client
        key = f"token_blacklist:{token_jti}"
        await redis_client.set(key, "1", expire=expires_in_seconds)
    except Exception as exc:
        # Redis unavailable — log but don't block the request
        logger.warning("Failed to blacklist token (Redis unavailable): %s", exc)


async def is_token_blacklisted(token_jti: str) -> bool:
    """Check if a token has been blacklisted."""
    try:
        from app.core.cache import redis_client
        key = f"token_blacklist:{token_jti}"
        return await redis_client.exists(key)
    except Exception as exc:
        # Redis unavailable — log WARNING and fail-open to avoid blocking all requests
        logger.warning("Redis unavailable during blacklist check (fail-open): %s", exc)
        return False


async def blacklist_all_user_tokens(user_id: str, except_jti: str = None) -> int:
    """Blacklist all active tokens for a user by incrementing their token version.

    Instead of tracking individual tokens, we use a 'token_version' counter.
    Each time a token is created, it includes the current version.
    When logout-all is called, we increment the version, invalidating
    all tokens with older versions.

    Returns the new token version number.
    """
    try:
        from app.core.cache import redis_client
        key = f"user_token_version:{user_id}"
        # Atomically increment the version
        import asyncio
        client = await redis_client.client
        new_version = await client.incr(f"sfp:{key}")
        # Set a long expiry so it doesn't disappear
        await client.expire(f"sfp:{key}", 86400 * 30)  # 30 days
        logger.info("Token version for user %s bumped to %d", user_id, new_version)
        return new_version
    except Exception as exc:
        logger.warning("Failed to bump token version (Redis unavailable): %s", exc)
        return 0


class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: str | None = None
    expires_in: int
    token_version: int | None = None


class UserInfo(BaseModel):
    id: str
    email: str
    username: str
    roles: list[str]
    tenant_id: str | None


# ─── Login Rate Limiting Constants ────────────────────────────────────────
MAX_LOGIN_ATTEMPTS = 5          # Max failed attempts before lockout
LOGIN_LOCKOUT_DURATION = 900    # Lockout duration in seconds (15 minutes)


async def _check_account_lockout(user_id: str) -> tuple[bool, int]:
    """Check if an account is locked due to too many failed login attempts.

    Returns (is_locked, remaining_attempts).
    Uses Redis to track per-account failed attempts.
    """
    try:
        from app.core.cache import redis_client
        client = await redis_client.client

        key = f"sfp:login_attempts:{user_id}"
        attempts_str = await client.get(key)

        if attempts_str:
            attempts = int(attempts_str)
            if attempts >= MAX_LOGIN_ATTEMPTS:
                # Check if lockout has expired
                ttl = await client.ttl(key)
                if ttl and ttl > 0:
                    return True, 0  # Account is locked
                else:
                    # Lockout expired — reset counter
                    await client.delete(key)
                    return False, MAX_LOGIN_ATTEMPTS
            return False, MAX_LOGIN_ATTEMPTS - attempts
        return False, MAX_LOGIN_ATTEMPTS
    except Exception:
        # Redis unavailable — skip lockout check (fail-open)
        logger.warning("Redis unavailable during lockout check (fail-open)")
        return False, MAX_LOGIN_ATTEMPTS


async def _record_failed_login(user_id: str) -> int:
    """Record a failed login attempt. Returns the new attempt count."""
    try:
        from app.core.cache import redis_client
        client = await redis_client.client

        key = f"sfp:login_attempts:{user_id}"
        new_count = await client.incr(key)
        if new_count == 1:
            # First failure — set expiry
            await client.expire(key, LOGIN_LOCKOUT_DURATION)
        return new_count
    except Exception:
        return 0


async def _reset_login_attempts(user_id: str) -> None:
    """Clear failed login attempts after a successful login."""
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        # SECURITY: Use raw key with sfp: prefix to match _record_failed_login key format
        await client.delete(f"sfp:login_attempts:{user_id}")
    except Exception:
        pass


@router.post("/login/", response_model=Token)
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(or_(User.email == form_data.username, User.username == form_data.username))
        .first()
    )

    if not user:
        logger.warning("Login failed: no user found for '%s'", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check per-account lockout (prevents distributed brute-force)
    is_locked, remaining = await _check_account_lockout(str(user.id))
    if is_locked:
        logger.warning("Login blocked: account %s is locked due to too many failed attempts", user.email)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to too many failed login attempts. Please try again later.",
            headers={"WWW-Authenticate": "Bearer", "Retry-After": str(LOGIN_LOCKOUT_DURATION)},
        )

    # Check user is active
    if not user.is_active:
        logger.warning("Login failed: user '%s' (id=%s) is inactive", user.email, user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled. Contact an administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check password_hash is set
    stored_hash = getattr(user, "password_hash", None)
    if not stored_hash:
        logger.error(
            "Login failed: user '%s' (id=%s) has NULL/empty password_hash. "
            "This user cannot log in until a password is set. "
            "Use ADMIN_DEFAULT_PASSWORD env var or /auth/bootstrap/ endpoint.",
            user.email, user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No password set for this account. Contact an administrator to reset it.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(form_data.password, stored_hash):
        attempts = await _record_failed_login(str(user.id))
        logger.info("Login failed: wrong password for '%s' (attempt %d/%d)", user.email, attempts, MAX_LOGIN_ATTEMPTS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify the user's tenant is active (if they belong to one)
    if user.tenant_id:
        from app.models.tenant import Tenant
        tenant_obj = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if not tenant_obj or not getattr(tenant_obj, "is_active", True):
            logger.info("Login denied: tenant %s is inactive for user '%s'", user.tenant_id, form_data.username)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your institution is currently deactivated. Please contact an administrator.",
            )

    roles = [role for (role,) in db.query(UserRole.role).filter(UserRole.user_id == user.id).all()]

    # Fetch current token version from Redis (for logout-all invalidation)
    token_version = 0
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        version_str = await client.get(f"sfp:user_token_version:{user.id}")
        if version_str:
            token_version = int(version_str)
    except Exception:
        pass

    import hashlib
    token_jti = hashlib.sha256(f"{user.id}:{datetime.now(timezone.utc).timestamp()}".encode()).hexdigest()[:16]

    access_token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "preferred_username": user.username,
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
            "roles": roles,
            "jti": token_jti,
            "tv": token_version,
        }
    )

    # SECURITY: Enforce MFA check for privileged roles before issuing token
    # Controlled by ENFORCE_MFA env var (default: disabled to avoid locking out
    # bootstrap super admin who is created with mfa_enabled=False).
    PRIVILEGED_ROLES_REQUIRING_MFA = {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "ACCOUNTANT"}
    user_privileged_roles = [r for r in roles if r in PRIVILEGED_ROLES_REQUIRING_MFA]

    if user_privileged_roles:
        mfa_enabled = getattr(user, "mfa_enabled", False)
        enforce_mfa = os.getenv("ENFORCE_MFA", "false").lower() == "true"

        if not mfa_enabled:
            if enforce_mfa:
                logger.warning(
                    "Login blocked: user '%s' has privileged role(s) %s but MFA is not enabled (ENFORCE_MFA=true)",
                    user.email, user_privileged_roles
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="L'authentification multi-facteurs (MFA) est obligatoire pour ce compte. Veuillez activer le MFA via les paramètres de sécurité.",
                )
            else:
                logger.warning(
                    "MFA not enabled for user '%s' with privileged roles %s. "
                    "Set ENFORCE_MFA=true to require MFA for privileged accounts.",
                    user.email, user_privileged_roles
                )

    # SECURITY: Clear failed login attempts on successful login
    await _reset_login_attempts(str(user.id))

    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=None,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_version=token_version,
    )


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


@router.post("/refresh/", response_model=Token)
@limiter.limit("20/minute")
async def refresh_token(request: Request, db: Session = Depends(get_db)):
    """Refresh an access token.

    Accepts the (possibly expired) access token via Authorization header,
    decodes it WITHOUT checking expiry, validates the user still exists,
    and issues a new access token.
    """
    import hashlib

    # 1. Extract token from Authorization header
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_str = auth_header.split(" ", 1)[1]

    # 2. Decode token WITHOUT expiry check
    payload = verify_token_raw(token_str)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # SECURITY: Check if token is blacklisted (logout was called)
    token_jti = payload.get("jti")
    if token_jti and await is_token_blacklisted(token_jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Verify user still exists and is active
    from app.models.user import User
    user_db = db.query(User).filter(User.id == user_id).first()
    if not user_db or not user_db.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 4. Fetch current roles from DB
    roles = [role for (role,) in db.query(UserRole.role).filter(UserRole.user_id == user_id).all()]
    token_roles = payload.get("roles", []) or []
    all_roles = list(dict.fromkeys([*token_roles, *roles]))

    # 5. Generate new token
    token_jti = hashlib.sha256(f"{user_id}:{datetime.now(timezone.utc).timestamp()}".encode()).hexdigest()[:16]

    token_version = 0
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        version_str = await client.get(f"sfp:user_token_version:{user_id}")
        if version_str:
            token_version = int(version_str)
        # SECURITY: Track active sessions — enforce max concurrent sessions (5)
        session_key = f"sfp:active_sessions:{user_id}"
        current_sessions = await client.smembers(session_key)
        if len(current_sessions) >= 5:
            logger.warning("Refresh blocked: user %s has too many active sessions (%d)", user_id, len(current_sessions))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many active sessions. Please log out from other devices.",
            )
        # Register this session with 30-min TTL
        await client.sadd(session_key, token_jti)
        await client.expire(session_key, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Session tracking failed (Redis unavailable): %s", exc)

    access_token = create_access_token(
        {
            "sub": user_id,
            "email": user_db.email,
            "preferred_username": user_db.username,
            "tenant_id": str(user_db.tenant_id) if user_db.tenant_id else None,
            "roles": all_roles,
            "jti": token_jti,
            "tv": token_version,
        }
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=None,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_version=token_version,
    )


@router.post("/logout/")
@limiter.limit("20/minute")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    # Blacklist the current token so it cannot be reused
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        # SECURITY: Extract JTI from the token payload (not from hash of token string).
        # The login sets JTI = sha256("user_id:timestamp")[:16], so we must match that.
        import hashlib
        try:
            import jwt as jwt_lib
            payload = jwt_lib.decode(
                token_str,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False},
                audience="schoolflow-api",
                issuer="schoolflow-pro",
            )
            token_jti = payload.get("jti")
            if token_jti:
                await blacklist_token(token_jti, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        except Exception:
            # Fallback: blacklist by token hash if payload extraction fails
            token_jti = hashlib.sha256(token_str.encode()).hexdigest()[:16]
            await blacklist_token(token_jti, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

        # SECURITY: Clean up active session tracking to prevent slot accumulation
        try:
            from app.core.cache import redis_client
            client = await redis_client.client
            session_key = f"sfp:active_sessions:{current_user.get('id', '')}"
            await client.srem(session_key, token_jti)
        except Exception as exc:
            logger.warning("Failed to clean up active session on logout: %s", exc)

    logger.info("User '%s' logged out (token blacklisted)", current_user.get("email"))
    return {"message": "Successfully logged out"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def validate_password_strength(password: str) -> None:
    """Validate password meets minimum security requirements."""
    import re
    errors = []
    if len(password) < 8:
        errors.append("8+ chars")
    if not re.search(r'[A-Z]', password):
        errors.append("uppercase")
    if not re.search(r'[a-z]', password):
        errors.append("lowercase")
    if not re.search(r'[0-9]', password):
        errors.append("digit")
    if not re.search(r'[^A-Za-z0-9]', password):
        errors.append("special char")
    if errors:
        # Generic message — don't reveal exact policy to attackers
        raise HTTPException(
            status_code=422,
            detail="Le mot de passe ne respecte pas les critères de sécurité requis."
        )


@router.post("/change-password/")
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the authenticated user's password."""
    from app.core.security import verify_password, get_password_hash

    user_id = current_user.get("id")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not verify_password(body.current_password, getattr(user, "password_hash", None)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    validate_password_strength(body.new_password)

    # SECURITY: Check password history to prevent reuse
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        import hashlib
        # Check last 5 password hashes
        for i in range(5):
            hist_key = f"sfp:pw_history:{user_id}:{i}"
            old_hash = await client.get(hist_key)
            if old_hash and verify_password(body.new_password, old_hash):
                raise HTTPException(
                    status_code=422,
                    detail="Ce mot de passe a été utilisé récemment. Veuillez en choisir un différent."
                )
        # Rotate password history
        # Shift entries: slot 4→delete, 3→4, 2→3, 1→2, 0→1
        for i in range(4, 0, -1):
            old = await client.get(f"sfp:pw_history:{user_id}:{i-1}")
            if old:
                await client.set(f"sfp:pw_history:{user_id}:{i}", old, expire=86400*365)
        # Store current hash in slot 0
        current_hash = getattr(user, "password_hash", None)
        if current_hash:
            await client.set(f"sfp:pw_history:{user_id}:0", current_hash, expire=86400*365)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Password history check failed (Redis unavailable): %s", exc)

    user.password_hash = get_password_hash(body.new_password)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()

    # SECURITY: Invalidate all other sessions after password change
    await blacklist_all_user_tokens(str(user_id))

    logger.info("User '%s' changed their password", current_user.get("email"))
    return {"message": "Password changed successfully"}


@router.post("/logout-all/")
@limiter.limit("5/minute")
async def logout_all_devices(request: Request, current_user: dict = Depends(get_current_user)):
    """Logout from all devices by invalidating all tokens.

    Increments the user's token version in Redis. All future token
    validations will reject tokens with older version numbers.
    Also blacklists the current token immediately.
    """
    user_id = current_user.get("id")

    # Blacklist current token immediately
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        import hashlib
        token_jti = hashlib.sha256(token_str.encode()).hexdigest()[:16]
        await blacklist_token(token_jti, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    # Bump token version — invalidates all existing tokens for this user
    new_version = await blacklist_all_user_tokens(user_id)

    # SECURITY: Clear all active sessions for this user
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        await client.delete(f"sfp:active_sessions:{user_id}")
    except Exception:
        pass

    logger.info("User '%s' logged out from all devices (token version bumped to %d)", current_user.get("email"), new_version)
    return {"message": "Logged out from all devices", "token_version": new_version}


class ForcedPasswordChangeRequest(BaseModel):
    new_password: str


@router.post("/reset-forced-password/")
@limiter.limit("5/minute")
async def reset_forced_password(
    request: Request,
    body: ForcedPasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reset password when forced change is required (no current password needed).

    Used when an admin has set must_change_password=True on a user account.
    The user must be authenticated but does not need to provide the old password.
    """
    from app.core.security import get_password_hash

    user_id = current_user.get("id")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    validate_password_strength(body.new_password)

    # SECURITY: Check password history to prevent reuse
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        import hashlib
        for i in range(5):
            hist_key = f"sfp:pw_history:{user_id}:{i}"
            old_hash = await client.get(hist_key)
            if old_hash and verify_password(body.new_password, old_hash):
                raise HTTPException(
                    status_code=422,
                    detail="Ce mot de passe a été utilisé récemment. Veuillez en choisir un différent."
                )
        for i in range(4, 0, -1):
            old = await client.get(f"sfp:pw_history:{user_id}:{i-1}")
            if old:
                await client.set(f"sfp:pw_history:{user_id}:{i}", old, expire=86400*365)
        current_hash = getattr(user, "password_hash", None)
        if current_hash:
            await client.set(f"sfp:pw_history:{user_id}:0", current_hash, expire=86400*365)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Password history check failed (Redis unavailable): %s", exc)

    user.password_hash = get_password_hash(body.new_password)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()

    # SECURITY: Invalidate all sessions after forced password change
    await blacklist_all_user_tokens(str(user_id))

    logger.info("User '%s' reset their forced password", current_user.get("email"))
    return {"message": "Password changed successfully"}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str = Field(default="", max_length=255)
    last_name: str = Field(default="", max_length=255)
    role: str = "PARENT"
    tenant_slug: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        """Only allow safe, non-privileged roles for public registration."""
        ALLOWED_PUBLIC_ROLES = {"PARENT", "STUDENT", "ALUMNI"}
        if v not in ALLOWED_PUBLIC_ROLES:
            raise ValueError(
                f"Rôle non autorisé pour l'inscription publique. Rôles acceptés : {', '.join(sorted(ALLOWED_PUBLIC_ROLES))}"
            )
        return v


@router.post("/register/", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    body: RegisterRequest,
    db: Session = Depends(get_db),
):
    """Public registration endpoint — create a new user account."""
    import uuid
    from app.core.security import get_password_hash
    from app.models.tenant import Tenant

    # 1. Validate password strength
    validate_password_strength(body.password)

    # 2. Check if email already exists
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un utilisateur avec cet email existe déjà.",
        )

    # 2b. Role is already validated by Pydantic field_validator on RegisterRequest
    safe_role = body.role

    # 3. Resolve tenant if tenant_slug is provided
    tenant_id = None
    if body.tenant_slug:
        tenant = db.query(Tenant).filter(Tenant.slug == body.tenant_slug).first()
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tenant '{body.tenant_slug}' not found.",
            )
        if not tenant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tenant '{body.tenant_slug}' is not active. Registration is disabled for this tenant.",
            )
        tenant_id = tenant.id

    # 4. Create user with hashed password
    new_id = str(uuid.uuid4())
    password_hash = get_password_hash(body.password)

    new_user = User(
        id=new_id,
        email=body.email,
        username=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=password_hash,
        tenant_id=tenant_id,
        is_active=True,
    )
    db.add(new_user)
    db.flush()  # flush to get the id before creating role

    # 5. Assign validated role (safe — never from raw user input)
    user_role = UserRole(
        user_id=new_user.id,
        tenant_id=tenant_id,
        role=safe_role,
    )
    db.add(user_role)
    db.commit()

    logger.info("New user registered: %s (role=%s)", body.email, safe_role)

    return {
        "id": new_id,
        "email": body.email,
        "first_name": body.first_name,
        "last_name": body.last_name,
        "role": safe_role,
        "tenant_id": str(tenant_id) if tenant_id else None,
    }


class BootstrapRequest(BaseModel):
    bootstrap_key: str
    new_password: Optional[str] = None


@router.post("/bootstrap/")
@limiter.limit("5/minute")
def bootstrap_admin(
    request: Request,
    body: BootstrapRequest,
    db: Session = Depends(get_db),
):
    """Create or reset the super admin account.

    Requires BOOTSTRAP_SECRET. Optionally accepts a new_password parameter
    to override ADMIN_DEFAULT_PASSWORD from env.
    """
    # SECURITY: ALWAYS require the bootstrap secret — use timing-safe comparison
    # to prevent timing attacks that could leak the secret character by character.
    import hmac
    if not body.bootstrap_key or not hmac.compare_digest(body.bootstrap_key, settings.BOOTSTRAP_SECRET):
        raise HTTPException(status_code=403, detail="Access denied")

    import sqlalchemy
    import uuid as _uuid
    from app.core.security import get_password_hash

    admin_email = settings.ADMIN_DEFAULT_EMAIL or "admin@schoolflow.local"
    # new_password param takes priority over env var
    admin_password = body.new_password or settings.ADMIN_DEFAULT_PASSWORD
    steps = []

    # SECURITY: Refuse to create admin with weak password
    if not admin_password or len(admin_password) < 8:
        logger.warning("Bootstrap rejected: admin password is empty or too short (min 8 chars)")
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters. Provide new_password or set ADMIN_DEFAULT_PASSWORD.",
        )

    # SECURITY: Validate full password strength
    validate_password_strength(admin_password)

    try:
        # Step 1: Ensure is_superuser column exists (PostgreSQL)
        try:
            if not settings.is_sqlite:
                db.execute(sqlalchemy.text("SAVEPOINT sp_bootstrap"))
                col_exists = db.execute(sqlalchemy.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='users' AND column_name='is_superuser'"
                )).first()
                if not col_exists:
                    db.execute(sqlalchemy.text(
                        "ALTER TABLE users ADD COLUMN is_superuser BOOLEAN DEFAULT FALSE"
                    ))
                    steps.append("added is_superuser column")
                db.execute(sqlalchemy.text("RELEASE SAVEPOINT sp_bootstrap"))
                db.commit()
        except Exception as e:
            try:
                db.execute(sqlalchemy.text("ROLLBACK TO SAVEPOINT sp_bootstrap"))
            except Exception:
                pass
            db.rollback()
            steps.append(f"is_superuser check skipped: {e}")

        # Step 2: Ensure user_roles tenant_id is nullable (PostgreSQL)
        try:
            if not settings.is_sqlite:
                nullable_check = db.execute(sqlalchemy.text(
                    "SELECT is_nullable FROM information_schema.columns "
                    "WHERE table_name='user_roles' AND column_name='tenant_id'"
                )).first()
                if nullable_check and nullable_check[0] == "NO":
                    db.execute(sqlalchemy.text(
                        "ALTER TABLE user_roles ALTER COLUMN tenant_id DROP NOT NULL"
                    ))
                    db.commit()
                    steps.append("made tenant_id nullable")
        except Exception as e:
            db.rollback()
            steps.append(f"tenant_id nullable check skipped: {e}")

        # Step 3: Check if admin exists using raw SQL
        admin_row = db.execute(
            sqlalchemy.text("SELECT id FROM users WHERE email = :email"),
            {"email": admin_email}
        ).first()

        hashed_pw = get_password_hash(admin_password)

        if admin_row:
            # Admin exists — update password and ensure active
            admin_id = str(admin_row[0])
            db.execute(
                sqlalchemy.text(
                    "UPDATE users SET password_hash = :pw, is_active = TRUE, "
                    "is_superuser = TRUE WHERE email = :email"
                ),
                {"pw": hashed_pw, "email": admin_email}
            )
            db.commit()
            steps.append(f"updated password for existing admin {admin_email}")

            # Ensure SUPER_ADMIN role exists
            role_row = db.execute(
                sqlalchemy.text(
                    "SELECT id FROM user_roles WHERE user_id = :uid AND role = 'SUPER_ADMIN'"
                ),
                {"uid": admin_id}
            ).first()
            if not role_row:
                db.execute(
                    sqlalchemy.text(
                        "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
                        "VALUES (:id, :uid, 'SUPER_ADMIN', NULL, NOW(), NOW()) ON CONFLICT DO NOTHING"
                    ),
                    {"id": str(_uuid.uuid4()), "uid": admin_id}
                )
                db.commit()
                steps.append("added SUPER_ADMIN role")
        else:
            # Admin does NOT exist — create using raw SQL
            admin_id = str(_uuid.uuid4())
            db.execute(
                sqlalchemy.text(
                    "INSERT INTO users (id, email, username, password_hash, first_name, last_name, "
                    "is_active, is_superuser, tenant_id, created_at, updated_at, is_verified, mfa_enabled) "
                    "VALUES (:id, :email, :username, :pw, 'Super', 'Admin', TRUE, TRUE, NULL, NOW(), NOW(), FALSE, FALSE)"
                ),
                {"id": admin_id, "email": admin_email, "username": "admin", "pw": hashed_pw}
            )
            db.commit()
            steps.append(f"created admin {admin_email} with id {admin_id}")

            # Create SUPER_ADMIN role
            db.execute(
                sqlalchemy.text(
                    "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
                    "VALUES (:id, :uid, 'SUPER_ADMIN', NULL, NOW(), NOW()) ON CONFLICT DO NOTHING"
                ),
                {"id": str(_uuid.uuid4()), "uid": admin_id}
            )
            db.commit()
            steps.append("created SUPER_ADMIN role")

        # Step 4: Verify the result
        verify = db.execute(
            sqlalchemy.text("SELECT id, email, username, is_active, is_superuser FROM users WHERE email = :email"),
            {"email": admin_email}
        ).first()

        return {
            "status": "ok",
            "message": f"Bootstrap complete for {admin_email}",
            "credentials": {"email": admin_email},
            "steps": steps,
            "user_in_db": {
                "id": str(verify[0]) if verify else None,
                "email": verify[1] if verify else None,
                "username": verify[2] if verify else None,
                "is_active": verify[3] if verify else None,
                "is_superuser": verify[4] if verify else None,
            } if verify else None,
        }

    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        # SECURITY: Log internal error details server-side only
        logger.error("Bootstrap failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred during bootstrap. Check server logs for details.",
        )


@router.get("/diag/")
def diagnostics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("*")),  # SUPER_ADMIN only
):
    """Diagnostic endpoint — returns aggregate counts only (no user PII)."""
    import sqlalchemy

    tables = db.execute(
        sqlalchemy.text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        )
    ).fetchall() if not settings.is_sqlite else db.execute(
        sqlalchemy.text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    ).fetchall()

    # SECURITY: Return only aggregate counts, never individual user PII
    total_users = db.query(User).count()
    active_users = db.query(User).filter(getattr(User, 'is_active', True) == True).count() if hasattr(User, 'is_active') else total_users
    total_roles = db.query(UserRole).count()
    tenants_count = db.query(db.query(User.tenant_id).distinct().subquery()).count() if hasattr(User, 'tenant_id') else 0

    return {
        "tables": [t[0] for t in tables],
        "stats": {
            "total_users": total_users,
            "active_users": active_users,
            "total_role_assignments": total_roles,
            "tenants_with_users": tenants_count,
        },
    }


# ─── TEMPORARY: Hard Reset Endpoint (REMOVE AFTER USE) ───────────────────
@router.post("/hard-reset/")
async def hard_reset_database(request: Request, db: Session = Depends(get_db)):
    """TEMPORARY endpoint — drops ALL data and recreates fresh admin.

    SECURITY: This endpoint MUST be removed after initial setup.
    It is only intended for development/testing database reset.
    """
    import sqlalchemy
    import uuid as _uuid
    from app.core.security import get_password_hash

    try:
        # 1. Drop all tables except alembic_version
        tables = db.execute(sqlalchemy.text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )).fetchall()
        for (table,) in tables:
            if table != "alembic_version":
                db.execute(sqlalchemy.text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
        db.commit()
        logger.warning("HARD RESET: All tables dropped")

        # 2. Recreate all tables via SQLAlchemy
        from app.core.database import Base, engine
        import app.models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        logger.warning("HARD RESET: All tables recreated via create_all")

        # 3. Ensure operational tables
        try:
            from app.main import _ensure_operational_tables
            _ensure_operational_tables(engine)
        except Exception as e:
            logger.warning("HARD RESET: operational tables failed: %s", e)

        # 4. Ensure is_superuser column
        try:
            if not settings.is_sqlite:
                db.execute(sqlalchemy.text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT FALSE"
                ))
                db.commit()
        except Exception:
            db.rollback()

        # 5. Ensure user_roles tenant_id nullable
        try:
            if not settings.is_sqlite:
                nullable_check = db.execute(sqlalchemy.text(
                    "SELECT is_nullable FROM information_schema.columns "
                    "WHERE table_name='user_roles' AND column_name='tenant_id'"
                )).first()
                if nullable_check and nullable_check[0] == "NO":
                    db.execute(sqlalchemy.text(
                        "ALTER TABLE user_roles ALTER COLUMN tenant_id DROP NOT NULL"
                    ))
                    db.commit()
        except Exception:
            db.rollback()

        # 6. Create admin with KNOWN credentials
        admin_id = str(_uuid.uuid4())
        admin_email = "admin@academyguinee.com"
        admin_password = "Admin@2026!"

        db.execute(sqlalchemy.text(
            "INSERT INTO users (id, email, username, password_hash, first_name, last_name, "
            "is_active, is_superuser, tenant_id, created_at, updated_at, is_verified, mfa_enabled) "
            "VALUES (:id, :email, :username, :pw, 'Super', 'Admin', TRUE, TRUE, NULL, NOW(), NOW(), FALSE, FALSE)"
        ), {"id": admin_id, "email": admin_email, "username": "admin", "pw": get_password_hash(admin_password)})
        db.commit()

        db.execute(sqlalchemy.text(
            "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
            "VALUES (:id, :uid, 'SUPER_ADMIN', NULL, NOW(), NOW())"
        ), {"id": str(_uuid.uuid4()), "uid": admin_id})
        db.commit()

        logger.warning("HARD RESET: Admin created — %s", admin_email)

        return {
            "status": "ok",
            "message": "Base de données réinitialisée avec succès",
            "admin": {
                "email": admin_email,
                "password": admin_password,
            },
            "dropped_tables": len(tables),
        }
    except Exception as e:
        db.rollback()
        logger.error("HARD RESET failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reset failed: {e}")


# NOTE: /auth/me/ is deprecated — use /users/me/ instead.
# Kept for backward compatibility with older frontend versions.
@router.get("/me/", response_model=UserInfo, deprecated=True)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Legacy endpoint — prefer GET /users/me/ which returns richer profile data."""
    return UserInfo(
        id=current_user.get("id", ""),
        email=current_user.get("email", ""),
        username=current_user.get("username", ""),
        roles=current_user.get("roles", []),
        tenant_id=current_user.get("tenant_id"),
    )
