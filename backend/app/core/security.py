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
    """Async helper to check current token version from Redis.

    SECURITY (audit 2026-08): fails open (returns 0, i.e. "no logout-all in
    effect") if Redis is unavailable — same documented trade-off as the
    blacklist check in is_token_blacklisted()/auth.py, which already logs a
    warning on this path. This one previously failed silently, so a Redis
    outage disabled logout-all enforcement platform-wide with no signal
    anywhere. Logging now so it shows up in log-based alerting instead of
    only being discoverable by reading this comment.
    """
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        current = await client.get(f"sfp:user_token_version:{user_id}")
        return int(current) if current else 0
    except Exception as exc:
        logger.warning(
            "Redis unavailable during token-version check (fail-open, "
            "logout-all enforcement disabled for this request): %s", exc
        )
        return 0


# ─── Differentiated JWT-revocation policy (P0) ───────────────────────────────
#
# Accounts whose EVERY request must be revocation-verified: if Redis (the
# blacklist / logout-all backend) is unreachable, these are refused with a
# controlled 503 rather than fail-open. Institutional/admin roles only.
PRIVILEGED_ROLES: set[str] = {
    "SUPER_ADMIN",
    "TENANT_ADMIN",
    "MINISTRY_ADMIN",
    "REGIONAL_DIRECTOR",
    "PREFECTURE_ADMIN",
    "COMMUNE_ADMIN",
}

# Operations that must be revocation-verified regardless of the caller's role
# (e.g. an ACCOUNTANT posting a payment, a DIRECTOR editing users). Keyed by
# the `resource:action` string passed to require_permission().
SENSITIVE_PERMISSIONS: set[str] = {
    # user & role administration
    "users:write", "users:delete", "auth:manage",
    # tenant administration
    "tenants:write", "tenants:delete",
    # sensitive financial operations
    "finance:write", "payments:write", "invoices:write", "fees:write",
    # security / compliance administration
    "mfa:manage", "audit:write", "rgpd:write", "rgpd:delete",
}


def _privileged_fail_closed() -> bool:
    """Indirection over settings.AUTH_PRIVILEGED_FAIL_CLOSED so tests can flip
    the policy deterministically without mutating the pydantic settings object."""
    return settings.AUTH_PRIVILEGED_FAIL_CLOSED


async def _evaluate_revocation(user_id: str, token_jti: str | None, token_version: int) -> bool:
    """Perform the two revocation checks (per-token blacklist + logout-all
    token-version) against Redis.

    Returns True when the revocation status was verified reliably (Redis
    reachable), False when Redis was unavailable for either check so the
    status is UNKNOWN. Raises HTTP 401 when the token is actually revoked
    (blacklisted or a stale logout-all version). It never raises on Redis
    unavailability — the caller applies the differentiated fail-open (normal
    accounts) / fail-closed (privileged) policy based on this return value.

    This replaces the previous unconditional fail-open, which returned the
    same "not revoked" signal whether the token was verified-clean or simply
    unverifiable — collapsing exactly the distinction this policy needs.
    """
    reliable = True

    # 1) Per-token blacklist (logout / password change). A token with no jti
    #    predates per-token revocation and can only be covered by logout-all
    #    below; its absence is not a Redis failure, so it doesn't flip reliable.
    if token_jti:
        try:
            from app.core.cache import redis_client
            blacklisted = await redis_client.exists(f"token_blacklist:{token_jti}")
        except Exception as exc:
            logger.warning(
                "Redis unavailable during blacklist check (revocation status UNVERIFIED): %s", exc
            )
            reliable = False
            blacklisted = False
        if blacklisted:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 2) logout-all (global token-version counter). redis_client.get() prefixes
    #    "sfp:", matching the key blacklist_all_user_tokens() increments
    #    (sfp:user_token_version:{user_id}).
    try:
        from app.core.cache import redis_client
        raw = await redis_client.get(f"user_token_version:{user_id}")
        current_version = int(raw) if raw else 0
    except Exception as exc:
        logger.warning(
            "Redis unavailable during token-version check (revocation status UNVERIFIED): %s", exc
        )
        return False  # cannot evaluate logout-all → status unknown

    # Reliable read: apply the same stale-token logic as validate_token_version.
    if current_version > 0 and (not token_version or token_version <= 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated (logged out from all devices)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if token_version and token_version > 0 and current_version > token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated (logged out from all devices)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return reliable


async def get_current_user(
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

    SECURITY: Rejects tokens blacklisted via /auth/logout/, /auth/logout-all/,
    or a password change. Previously the blacklist was only checked in
    /auth/refresh/, so a logged-out token stayed valid on every other
    authenticated route until it naturally expired.
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

    # SECURITY (P0 — differentiated revocation policy): run the blacklist
    # (logout / password change) and logout-all (token-version) checks and
    # learn whether Redis could be reached. A genuinely revoked token still
    # raises 401 here. If Redis was UNREACHABLE the status is unknown; the
    # fail-open (normal accounts) vs fail-closed (privileged) decision is
    # taken AFTER roles are loaded, below. `token_version` (tv claim) is read
    # here so an outage on the version read is reflected in reliability.
    revocation_verified = await _evaluate_revocation(
        user_id, token.get("jti"), token.get("tv", 0)
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

        # SECURITY (audit P0-2): the database is the single source of truth
        # for a user's roles. Roles are NOT unioned with the token's own
        # "roles" claim any more — that union let a role REVOKED in the DB
        # keep granting access until the (attacker-uncontrollable but still
        # lingering) token expired. The token's roles claim is issued from
        # this very same user_roles table at login/refresh, so db_roles is
        # always the authoritative, current set: a role added in the DB is
        # already picked up here, and a role removed in the DB now takes
        # effect immediately on the very next request.
        roles = list(dict.fromkeys(db_roles))

        # SECURITY (P0 — differentiated revocation policy): a PRIVILEGED account
        # must never be admitted on an unverifiable revocation status. If the
        # blacklist/logout-all checks could not reach Redis and this user holds
        # a privileged role, refuse with a controlled 503 (retryable) instead of
        # fail-open. Non-privileged accounts fall through (fail-open) so a Redis
        # blip never causes a platform-wide outage. Gated by
        # AUTH_PRIVILEGED_FAIL_CLOSED (strict in production, relaxed under DEBUG).
        if (
            not revocation_verified
            and _privileged_fail_closed()
            and any(r in PRIVILEGED_ROLES for r in roles)
        ):
            logger.error(
                "Revocation status unverifiable (Redis down) for privileged user %s roles=%s "
                "— refusing with 503 (fail-closed).", user_id, roles,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Le contrôle de révocation du jeton est momentanément indisponible pour un compte privilégié. Réessayez plus tard.",
                headers={"Retry-After": "5"},
            )

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
            # Whether the JWT revocation status was verified reliably this
            # request. Consumed by require_permission() to fail-close
            # SENSITIVE_PERMISSIONS operations regardless of the caller's role.
            "_revocation_verified": revocation_verified,
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
        "audit:read", "audit:write",
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
        # Academic structure — frontend already shows DIRECTOR these as
        # levels:manage/subjects:manage/academic_years:manage/terms:manage/
        # classrooms:manage (src/lib/permissions.ts); backend previously had
        # no matching write permission, so those buttons 403'd on save.
        "levels:read", "levels:write",
        "subjects:read", "subjects:write",
        "academic_years:read", "academic_years:write",
        "terms:read", "terms:write",
        "classrooms:read", "classrooms:write",
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
        "homework:read", "homework:write",
        "school_life:read", "school_life:write",
    ],
    "STUDENT": ["me:read", "grades:read", "attendance:read", "schedule:read", "settings:read",
                "homework:read"],
    "PARENT": ["me:read", "students:read", "grades:read", "attendance:read", "settings:read",
               "payments:read", "homework:read"],
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
    # National audit Phase 2 — first institutional role above TENANT_ADMIN.
    # Deliberately narrow: a single permission for cross-tenant AGGREGATE
    # counts only (app/api/v1/endpoints/core/ministry.py). MINISTRY_ADMIN
    # never gets "*" or per-tenant permissions like students:read — it must
    # never be able to read one establishment's actual student/financial
    # records, only how many establishments/students exist per region/type.
    # Platform-level like SUPER_ADMIN (tenant_id NULL on its UserRole row).
    "MINISTRY_ADMIN": ["ministry:read"],
    # National audit Phase 7 — second institutional role. Unlike
    # MINISTRY_ADMIN, a REGIONAL_DIRECTOR is NOT platform-level: they keep
    # their normal tenant_id (they run one establishment) but are also
    # granted ministry:read so the /ministry/overview/ endpoint can identify
    # them and narrow the aggregate to their own tenant's region only —
    # enforced in ministry.py, not by this permission alone.
    "REGIONAL_DIRECTOR": ["ministry:read"],
    # National audit Phase 5 (préfecture/commune roadmap) — same pattern as
    # REGIONAL_DIRECTOR, one step narrower each: PREFECTURE_ADMIN keeps
    # their own tenant_id and is narrowed to their own tenant's prefecture,
    # COMMUNE_ADMIN to their own tenant's commune. Enforced in ministry.py,
    # not by this permission alone.
    "PREFECTURE_ADMIN": ["ministry:read"],
    "COMMUNE_ADMIN": ["ministry:read"],
}

def require_permission(permission: str):
    def decorator(current_user: dict = Depends(get_current_user)):
        user_roles = current_user.get("roles", [])
        user_permissions: set[str] = set()

        for role in user_roles:
            perms = ROLE_PERMISSIONS.get(role, [])
            user_permissions.update(perms)

        resource = permission.split(":")[0]
        granted = (
            "*" in user_permissions
            or permission in user_permissions
            or f"{resource}:*" in user_permissions
        )

        if not granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission refusée: {permission}",
            )

        # SECURITY (P0 — differentiated revocation policy): a SENSITIVE
        # operation must never proceed on an unverifiable revocation status,
        # even for a non-privileged role (e.g. an ACCOUNTANT posting a payment,
        # a DIRECTOR editing users). If the blacklist/logout-all check could
        # not reach Redis this request, refuse with a controlled 503 instead of
        # trusting a possibly-revoked token. Privileged ACCOUNTS are already
        # blocked upstream in get_current_user; this covers privileged
        # OPERATIONS performed by otherwise-normal accounts.
        if (
            permission in SENSITIVE_PERMISSIONS
            and _privileged_fail_closed()
            and not current_user.get("_revocation_verified", True)
        ):
            logger.error(
                "Revocation status unverifiable (Redis down) for sensitive operation %s "
                "by user %s — refusing with 503 (fail-closed).",
                permission, current_user.get("id"),
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Le contrôle de révocation du jeton est momentanément indisponible pour cette opération sensible. Réessayez plus tard.",
                headers={"Retry-After": "5"},
            )

        return current_user

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
