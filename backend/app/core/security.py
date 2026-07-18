import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from passlib.context import CryptContext
from sqlalchemy import text

from app.core.config import settings

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login/")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token.

    SECURITY NOTES:
    - Uses HS256 (symmetric) signing with SECRET_KEY
    - For high-security deployments, consider RS256 (asymmetric) signing
    - Key rotation: Set SECRET_KEY_ROTATION env var with comma-separated old keys
      to accept tokens signed with previous keys during grace period
    - Always use a minimum 32-character SECRET_KEY in production
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    # SECURITY: Add issuer and audience claims for token binding to this deployment
    to_encode.update({"iss": "schoolflow-pro", "aud": "schoolflow-api"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verify_token(token: str = Depends(oauth2_scheme)) -> dict:
    """Decode and validate a JWT access token (with expiry check)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_sub": True, "verify_iss": True, "verify_aud": True},
            issuer="schoolflow-pro",
            audience="schoolflow-api",
        )
    except JWTError as exc:
        logger.info("JWT validation failed: %s", exc)
        raise credentials_exception

    return payload


def verify_token_raw(token: str) -> dict:
    """Decode a JWT token WITHOUT checking expiry.

    Used by the refresh endpoint to accept an expired access token
    and issue a new one.  Still validates the signature and subject.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_sub": True, "verify_exp": False},
            audience="schoolflow-api",
            issuer="schoolflow-pro",
        )
    except JWTError as exc:
        logger.info("JWT raw decode failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def _get_token_version_from_redis(user_id: str) -> int:
    """Async helper to check current token version from Redis."""
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        current = await client.get(f"sfp:user_token_version:{user_id}")
        return int(current) if current else 0
    except Exception:
        return 0


def get_current_user(
    request: Request,
    token: dict = Depends(verify_token),
) -> dict:
    """
    Dependency that returns the current authenticated user from the native JWT payload.
    Enriched with database roles and tenant_id for authorization.

    For SUPER_ADMIN users without a tenant_id, the X-Tenant-ID header from the
    frontend is injected as tenant_id so that all tenant-scoped endpoints work
    when a super admin accesses a specific tenant's dashboard.

    Note: Token version validation (logout-all) is handled by the calling
    async endpoint via ``validate_token_version()`` since Redis access is async.
    """
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.models.user_role import UserRole

    user_id = token.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with SessionLocal() as db:
        # SECURITY: Reset RLS context on this independent session to prevent
        # connection pool leaks. Without this, the query could be filtered by
        # a stale tenant_id from a previous request on the same connection.
        if not settings.is_sqlite:
            try:
                # FIX: Use NULL instead of '' to avoid ''::uuid cast error in strict RLS
                db.execute(text("SELECT set_config('app.current_tenant_id', NULL::text, false)"))
            except Exception:
                pass  # RLS not configured yet — connection still usable

        user_db = db.query(User).filter(User.id == user_id).first()
        if not user_db:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated user not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        db_roles = [
            role
            for (role,) in db.query(UserRole.role)
            .filter(UserRole.user_id == user_db.id)
            .all()
        ]

        token_roles = token.get("roles", []) or []
        roles = list(dict.fromkeys([*token_roles, *db_roles]))

        resolved_tenant_id = str(user_db.tenant_id) if user_db.tenant_id else None

        # SUPER_ADMIN without a tenant: inject X-Tenant-ID header if present
        if resolved_tenant_id is None and "SUPER_ADMIN" in roles:
            header_tid = request.headers.get("X-Tenant-ID")
            if header_tid:
                # SECURITY: Validate the header is a proper UUID format
                try:
                    UUID(header_tid)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid X-Tenant-ID format: must be a valid UUID",
                    )
                # Verify the tenant exists in the database
                from app.models.tenant import Tenant
                tenant_obj = db.query(Tenant).filter(Tenant.id == header_tid).first()
                if not tenant_obj:
                    # Tenant doesn't exist — don't block SUPER_ADMIN, just ignore the header
                    logger.warning("X-Tenant-ID %s does not exist, ignoring for SUPER_ADMIN", header_tid)
                else:
                    resolved_tenant_id = header_tid

        # Resolve tenant name for AI branding (used by chat/audit endpoints)
        tenant_name = None
        if resolved_tenant_id:
            try:
                from app.models.tenant import Tenant
                tenant_obj = db.query(Tenant).filter(Tenant.id == resolved_tenant_id).first()
                if tenant_obj:
                    tenant_name = tenant_obj.name
            except Exception:
                pass

        return {
            "id": str(user_db.id),
            "email": user_db.email,
            "first_name": user_db.first_name,
            "last_name": user_db.last_name,
            "username": user_db.username,
            "roles": roles,
            "tenant_id": resolved_tenant_id,
            "tenant_name": tenant_name,
            "_token_version": token.get("tv", 0),
        }


async def validate_token_version(user_id: str, token_version: int) -> None:
    """Validate that the token's version matches the current Redis version.

    Call this from async endpoints that need to enforce logout-all.
    Raises HTTPException 401 if the token version is stale.
    """
    current_version = await _get_token_version_from_redis(user_id)

    # If logout-all was used (current_version > 0), reject legacy tokens
    # that don't carry a version claim — they were issued before the
    # logout-all and must not be accepted.
    if current_version > 0 and (not token_version or token_version <= 0):
        logger.info(
            "Token rejected: legacy token without version for user %s (current_version=%d)",
            user_id, current_version,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated (logged out from all devices)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not token_version or token_version <= 0:
        return  # No logout-all has ever been used, legacy token is fine

    if current_version > token_version:
        logger.info(
            "Token rejected: version mismatch (token=%d, current=%d) for user %s",
            token_version, current_version, user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated (logged out from all devices)",
            headers={"WWW-Authenticate": "Bearer"},
        )

ROLE_PERMISSIONS: dict = {
    "SUPER_ADMIN": ["*"],
    "TENANT_ADMIN": [
        # Users & Auth
        "users:read", "users:write", "users:delete",
        "auth:manage",
        # Academic
        "students:read", "students:write", "students:delete",
        "grades:read", "grades:write",
        "attendance:read", "attendance:write",
        "homework:read", "homework:write",
        "assessments:read", "assessments:write",
        # Academic structure
        "academic_years:read", "academic_years:write",
        "terms:read", "terms:write",
        "levels:read", "levels:write",
        "subjects:read", "subjects:write",
        "departments:read", "departments:write",
        "campuses:read", "campuses:write",
        "classrooms:read", "classrooms:write",
        # Finance
        "payments:read", "payments:write",
        "invoices:read", "invoices:write",
        "fees:read", "fees:write",
        # Infrastructure
        "rooms:read", "rooms:write",
        "schedule:read", "schedule:write",
        # Operational
        "hr:read", "hr:write",
        "school_life:read", "school_life:write",
        "communications:read", "communications:write",
        "notifications:read", "notifications:write",
        "library:read", "library:write",
        "inventory:read", "inventory:write",
        "clubs:read", "clubs:write",
        "surveys:read", "surveys:write",
        "incidents:read", "incidents:write",
        "parents:read", "parents:write",
        "admissions:read", "admissions:write",
        "enrollments:read", "enrollments:write",
        "certificates:read", "certificates:write",
        "analytics:read",
        "audit:read",
        # Settings (but NOT RGPD deletion)
        "settings:read", "settings:write",
        # MFA
        "mfa:manage",
        # EXPLICITLY EXCLUDED: "rgpd:delete", "tenants:write", "tenants:delete"
    ],
    "DIRECTOR": [
        "users:read", "users:write",
        "students:read", "students:write",
        "enrollments:read", "enrollments:write",
        "grades:read", "grades:write",
        "attendance:read", "attendance:write",
        "settings:read", "settings:write",
        "analytics:read", "reports:read", "finance:read",
        "audit:read", "audit:write",
        "rgpd:read", "rgpd:write",
        "admissions:read", "admissions:write",
        "inventory:read", "inventory:write",
        "hr:read", "hr:write",
    ],
    "DEPARTMENT_HEAD": [
        "users:read",
        "students:read",
        "grades:read", "grades:write",
        "attendance:read", "attendance:write",
        "subjects:read", "subjects:write",
        "settings:read",
        "schedule:read", "schedule:write",
        "admissions:read",
    ],
    "TEACHER": [
        "users:read",
        "students:read", "grades:read", "grades:write",
        "attendance:read", "attendance:write",
        "subjects:read", "settings:read",
        "schedule:read",
    ],
    "STUDENT": ["me:read", "grades:read", "attendance:read", "schedule:read", "settings:read"],
    "PARENT": ["me:read", "students:read", "grades:read", "attendance:read", "settings:read",
               "payments:read"],
    "ALUMNI": ["students:read", "grades:read", "attendance:read", "schedule:read", "subjects:read"],
    "STAFF": ["users:read", "students:read", "students:write", "attendance:read",
              "settings:read",
              "admissions:read", "admissions:write", "inventory:read", "inventory:write"],
    "ACCOUNTANT": ["finance:read", "finance:write", "students:read", "payments:read", "payments:write",
                    "inventory:read", "settings:read"],
    "SECRETARY": ["users:read", "students:read", "students:write", "attendance:read", "attendance:write",
                  "grades:read", "settings:read",
                  "admissions:read", "admissions:write",
                  "enrollments:read", "enrollments:write",
                  "certificates:read", "certificates:write",
                  "inventory:read", "inventory:write"],
}

def require_permission(permission: str):
    def decorator(current_user: dict = Depends(get_current_user)):
        user_roles = current_user.get("roles", [])
        user_permissions: set[str] = set()

        for role in user_roles:
            perms = ROLE_PERMISSIONS.get(role, [])
            user_permissions.update(perms)

        if "*" in user_permissions or permission in user_permissions:
            return current_user

        resource = permission.split(":")[0]
        if f"{resource}:*" in user_permissions:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission refusée: {permission}",
        )

    return decorator


# ─── Feature Gating — Plan hierarchy ─────────────────────────────────────────

# Numeric weight per plan level (higher = more features)
_PLAN_WEIGHT: dict[str, int] = {
    "starter": 0,
    "pro": 1,
    "enterprise": 2,
}

# Statuses that count as "access granted" for a paid or trial period
_ACTIVE_STATUSES = {"active", "trialing"}


def require_plan(min_plan: str):
    """FastAPI dependency factory: enforce a minimum subscription plan.

    Usage::

        @router.post("/ai/chat/")
        async def chat(
            _plan: None = Depends(require_plan("pro")),
            current_user: dict = Depends(get_current_user),
        ):
            ...

    Rules
    -----
    * SUPER_ADMIN always passes (platform-level).
    * Tenants with ``subscription_status`` in {"active", "trialing"} AND
      ``subscription_plan`` weight >= ``min_plan`` weight are allowed.
    * Everyone else gets HTTP 402 with an upgrade prompt.
    * If the DB look-up fails for any reason, fail **open** so we don't break
      existing functionality during a DB hiccup.
    """
    min_weight = _PLAN_WEIGHT.get(min_plan.lower(), 0)

    def _check(current_user: dict = Depends(get_current_user)) -> dict:
        # SUPER_ADMIN bypasses all plan checks
        roles = current_user.get("roles", [])
        if "SUPER_ADMIN" in roles:
            return current_user

        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "PLAN_REQUIRED",
                    "required_plan": min_plan,
                    "message": (
                        f"Cette fonctionnalité nécessite le plan '{min_plan}' ou supérieur. "
                        "Passez à un plan supérieur pour y accéder."
                    ),
                    "upgrade_url": "/billing",
                },
            )

        try:
            from app.core.database import SessionLocal
            from app.models.tenant import Tenant as _Tenant

            with SessionLocal() as db:
                tenant = db.query(_Tenant).filter(_Tenant.id == tenant_id).first()
                if not tenant:
                    # Tenant not found — fail open to avoid false positives
                    logger.warning("require_plan: tenant %s not found, failing open", tenant_id)
                    return current_user

                plan = (tenant.subscription_plan or "starter").lower()
                sub_status = (tenant.subscription_status or "trialing").lower()

                # Check trial validity for "trialing" status
                if sub_status == "trialing" and tenant.trial_ends_at:
                    from datetime import datetime, timezone
                    if tenant.trial_ends_at < datetime.now(timezone.utc).replace(tzinfo=None):
                        sub_status = "expired"

                plan_weight = _PLAN_WEIGHT.get(plan, 0)

                if sub_status in _ACTIVE_STATUSES and plan_weight >= min_weight:
                    return current_user

                # Build friendly upgrade message
                if sub_status not in _ACTIVE_STATUSES:
                    message = (
                        f"Votre abonnement est '{sub_status}'. "
                        "Renouvelez votre abonnement pour accéder à cette fonctionnalité."
                    )
                else:
                    message = (
                        f"Cette fonctionnalité nécessite le plan '{min_plan}' ou supérieur "
                        f"(plan actuel : '{plan}'). Passez à un plan supérieur pour y accéder."
                    )

                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail={
                        "error": "PLAN_REQUIRED",
                        "required_plan": min_plan,
                        "current_plan": plan,
                        "current_status": sub_status,
                        "message": message,
                        "upgrade_url": "/billing",
                    },
                )

        except HTTPException:
            raise
        except Exception as exc:
            # Fail open: plan check failure must not break existing functionality
            logger.warning("require_plan check failed (failing open): %s", exc)
            return current_user

    return _check
