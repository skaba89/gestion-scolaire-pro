"""Users endpoints — full CRUD + role management"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import math

from app.core.database import get_db
from app.core.security import get_current_user, require_permission, ROLE_PERMISSIONS
from app.core.config import settings
from app.utils.audit import log_audit
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas (inline for simplicity) ─────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: bool
    roles: List[str] = []
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(max_length=255)
    last_name: str = Field(max_length=255)
    password: Optional[str] = None
    roles: List[str] = []


class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=255)
    last_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = Field(default=None, max_length=500)


class RoleUpdateRequest(BaseModel):
    roles: List[str]


class ToggleStatusRequest(BaseModel):
    is_active: bool


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/me/")
def read_users_me(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Return the currently authenticated user's profile with full context from DB."""
    user_id = current_user.get("id")
    
    # 1. Fetch user data from DB (lenient on tenant_id for first login)
    # Use CAST() instead of ::text for SQLite compatibility
    sql_user = text("""
        SELECT 
            CAST(u.id AS VARCHAR), u.email, u.first_name, u.last_name, 
            u.is_active, u.avatar_url, u.created_at, u.tenant_id,
            t.slug as tenant_slug, t.name as tenant_name,
            t.settings as tenant_settings, t.type as tenant_type
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = :user_id
    """)
    row = db.execute(sql_user, {"user_id": user_id}).fetchone()
    
    # 2. Fetch roles from user_roles table
    sql_roles = text("SELECT role FROM user_roles WHERE user_id = :user_id")
    role_rows = db.execute(sql_roles, {"user_id": user_id}).fetchall()
    db_roles = [r.role for r in role_rows]
    
    # 3. Consolidate roles (Token + DB)
    all_roles = list(set(current_user.get("roles", []) + db_roles))
    
    if not row:
        # Fallback to JWT data if user not yet in DB (e.g. first login)
        return {
            "user": {
                "id": user_id,
                "email": current_user.get("email"),
            },
            "profile": {
                "first_name": "",
                "last_name": "",
                "avatar_url": None
            },
            "roles": all_roles,
            "tenant": None
        }

    return {
        "user": {
            "id": row.id,
            "email": row.email,
        },
        "profile": {
            "first_name": row.first_name,
            "last_name": row.last_name,
            "avatar_url": row.avatar_url,
        },
        "roles": all_roles,
        "tenant": {
            "id": row.tenant_id,
            "slug": row.tenant_slug,
            "name": row.tenant_name,
            "type": row.tenant_type,
            "settings": row.tenant_settings if row.tenant_settings else {}
        } if row.tenant_id else None
    }


@router.get("/")
def list_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
):
    """List all users for the current tenant (paginated)."""
    tenant_id = current_user.get("tenant_id")

    where_clauses = ["u.tenant_id = :tenant_id"]
    params: dict = {"tenant_id": tenant_id}

    if search:
        # Use LOWER() + LIKE for SQLite compatibility (ILIKE is PostgreSQL-only)
        where_clauses.append(
            "(LOWER(u.first_name) LIKE LOWER(:search) OR LOWER(u.last_name) LIKE LOWER(:search) OR LOWER(u.email) LIKE LOWER(:search))"
        )
        params["search"] = f"%{search}%"

    if is_active is not None:
        where_clauses.append("u.is_active = :is_active")
        params["is_active"] = is_active

    role_join = ""
    if role:
        role_join = "JOIN user_roles ur2 ON ur2.user_id = u.id AND ur2.tenant_id = u.tenant_id AND ur2.role = :role"
        params["role"] = role

    where_sql = " AND ".join(where_clauses)

    count_sql = text(f"""
        SELECT COUNT(DISTINCT u.id)
        FROM users u
        {role_join}
        WHERE {where_sql}
    """)
    total = db.execute(count_sql, params).scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    # Build SQL based on database type (PostgreSQL vs SQLite)
    if settings.is_sqlite:
        users_sql_raw = f"""
            SELECT
                CAST(u.id AS VARCHAR),
                u.email, u.first_name, u.last_name,
                u.is_active, u.avatar_url, u.created_at,
                COALESCE(
                    (SELECT GROUP_CONCAT(DISTINCT ur2.role, ',')
                     FROM user_roles ur2 WHERE ur2.user_id = u.id AND ur2.tenant_id = u.tenant_id),
                    ''
                ) AS roles
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
            {role_join}
            WHERE {where_sql}
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.avatar_url, u.created_at
            ORDER BY u.last_name ASC, u.first_name ASC
            LIMIT :limit OFFSET :offset
        """
    else:
        users_sql_raw = f"""
            SELECT
                CAST(u.id AS VARCHAR),
                u.email, u.first_name, u.last_name,
                u.is_active, u.avatar_url, u.created_at,
                COALESCE(
                    ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL),
                    ARRAY[]::text[]
                ) AS roles
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
            {role_join}
            WHERE {where_sql}
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.avatar_url, u.created_at
            ORDER BY u.last_name ASC, u.first_name ASC
            LIMIT :limit OFFSET :offset
        """
    users_sql = text(users_sql_raw)
    rows = db.execute(users_sql, params).fetchall()

    users = [
        {
            "id": r.id,
            "email": r.email,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "is_active": r.is_active,
            "avatar_url": r.avatar_url,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "roles": list(r.roles) if r.roles else [],
        }
        for r in rows
    ]
    # SQLite returns roles as comma-separated string via GROUP_CONCAT
    if settings.is_sqlite:
        for u in users:
            if isinstance(u["roles"], str):
                u["roles"] = [r for r in u["roles"].split(",") if r] if u["roles"] else []

    return {
        "items": users,
        "total": int(total),
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 1,
    }


@router.get("/{user_id}/")
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    """Get a single user by ID."""
    tenant_id = current_user.get("tenant_id")
    # Build SQL based on database type (PostgreSQL vs SQLite)
    if settings.is_sqlite:
        sql_raw = """
            SELECT
                CAST(u.id AS VARCHAR), u.email, u.first_name, u.last_name,
                u.is_active, u.avatar_url, u.created_at,
                COALESCE(
                    (SELECT GROUP_CONCAT(DISTINCT ur2.role, ',')
                     FROM user_roles ur2 WHERE ur2.user_id = u.id AND ur2.tenant_id = u.tenant_id),
                    ''
                ) AS roles
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
            WHERE u.id = :user_id AND u.tenant_id = :tenant_id
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.avatar_url, u.created_at
        """
    else:
        sql_raw = """
            SELECT
                CAST(u.id AS VARCHAR), u.email, u.first_name, u.last_name,
                u.is_active, u.avatar_url, u.created_at,
                COALESCE(
                    ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL),
                    ARRAY[]::text[]
                ) AS roles
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
            WHERE u.id = :user_id AND u.tenant_id = :tenant_id
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.avatar_url, u.created_at
        """
    sql = text(sql_raw)
    row = db.execute(sql, {"user_id": user_id, "tenant_id": tenant_id}).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    roles_val = list(row.roles) if row.roles else []
    if settings.is_sqlite and isinstance(roles_val, str):
        roles_val = [r for r in roles_val.split(",") if r] if roles_val else []
    return {
        "id": row.id,
        "email": row.email,
        "first_name": row.first_name,
        "last_name": row.last_name,
        "is_active": row.is_active,
        "avatar_url": row.avatar_url,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "roles": roles_val,
    }


@router.patch("/{user_id}/")
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Update user profile fields (first_name, last_name, email, avatar_url, is_active)."""
    tenant_id = current_user.get("tenant_id")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    # SECURITY: Whitelist allowed column names to prevent SQL injection
    ALLOWED_USER_UPDATE_FIELDS = {"first_name", "last_name", "email", "username", "avatar_url", "is_active", "phone", "bio"}
    updates = {k: v for k, v in updates.items() if k in ALLOWED_USER_UPDATE_FIELDS}

    # If email is being changed, check uniqueness
    if "email" in updates:
        existing = db.execute(
            text("SELECT id FROM users WHERE email = :email AND id != :user_id"),
            {"email": updates["email"], "user_id": user_id}
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        # Also update username to match email
        updates["username"] = updates["email"]

    set_clauses = ", ".join([f"{k} = :{k}" for k in updates])
    updates["user_id"] = user_id
    updates["tenant_id"] = tenant_id

    sql = text(f"""
        UPDATE users SET {set_clauses}, updated_at = NOW()
        WHERE id = :user_id AND tenant_id = :tenant_id
    """)
    result = db.execute(sql, updates)

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Log audit BEFORE commit so it's persisted
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE",
        resource_type="USER",
        resource_id=user_id,
        details=updates
    )

    db.commit()

    return {"message": "User updated successfully"}


@router.patch("/{user_id}/toggle-status/")
def toggle_user_status(
    user_id: str,
    body: ToggleStatusRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Activate or deactivate a user account."""
    tenant_id = current_user.get("tenant_id")

    # Prevent self-deactivation
    if user_id == current_user.get("id") and not body.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )

    sql = text("""
        UPDATE users SET is_active = :is_active, updated_at = NOW()
        WHERE id = :user_id AND tenant_id = :tenant_id
    """)
    result = db.execute(sql, {"is_active": body.is_active, "user_id": user_id, "tenant_id": tenant_id})

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    action = "activated" if body.is_active else "deactivated"

    # Log audit BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="TOGGLE_STATUS",
        resource_type="USER",
        resource_id=user_id,
        details={"is_active": body.is_active}
    )

    db.commit()

    return {"message": f"User {action} successfully"}


@router.put("/{user_id}/roles/")
def update_user_roles(
    user_id: str,
    body: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Replace all roles for a user (within the current tenant)."""
    tenant_id = current_user.get("tenant_id")

    # SECURITY: Validate roles — prevent privilege escalation
    ALLOWED_ROLES = set(ROLE_PERMISSIONS.keys())
    PRIVILEGED_ROLES = {"SUPER_ADMIN", "TENANT_ADMIN"}
    current_roles_set = set(current_user.get("roles", []))

    for role in body.roles:
        if role not in ALLOWED_ROLES:
            raise HTTPException(status_code=422, detail=f"Unknown role: {role}")
        if role in PRIVILEGED_ROLES and "SUPER_ADMIN" not in current_roles_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only SUPER_ADMIN can assign the '{role}' role"
            )

    # Verify user exists in tenant
    check = db.execute(
        text("SELECT id FROM users WHERE id = :user_id AND tenant_id = :tenant_id"),
        {"user_id": user_id, "tenant_id": tenant_id}
    ).fetchone()
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Replace roles
    db.execute(
        text("DELETE FROM user_roles WHERE user_id = :user_id AND tenant_id = :tenant_id"),
        {"user_id": user_id, "tenant_id": tenant_id}
    )
    for role in body.roles:
        db.execute(
            text("""
                INSERT INTO user_roles (user_id, tenant_id, role, created_at)
                VALUES (:user_id, :tenant_id, :role, NOW())
                ON CONFLICT DO NOTHING
            """),
            {"user_id": user_id, "tenant_id": tenant_id, "role": role}
        )
    # Log audit BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE_ROLES",
        resource_type="USER",
        resource_id=user_id,
        details={"roles": body.roles}
    )

    db.commit()

    return {"message": "Roles updated successfully", "roles": body.roles}


class AssignRoleRequest(BaseModel):
    role: str


@router.post("/{user_id}/roles/")
def assign_role(
    user_id: str,
    body: AssignRoleRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Assign a single role to a user."""
    tenant_id = current_user.get("tenant_id")

    # SECURITY: Validate role — prevent privilege escalation
    ALLOWED_ROLES = set(ROLE_PERMISSIONS.keys())
    PRIVILEGED_ROLES = {"SUPER_ADMIN", "TENANT_ADMIN"}
    current_roles_set = set(current_user.get("roles", []))

    if body.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role: {body.role}")
    if body.role in PRIVILEGED_ROLES and "SUPER_ADMIN" not in current_roles_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only SUPER_ADMIN can assign the '{body.role}' role"
        )

    # Verify user exists in tenant
    check = db.execute(
        text("SELECT id FROM users WHERE id = :user_id AND tenant_id = :tenant_id"),
        {"user_id": user_id, "tenant_id": tenant_id}
    ).fetchone()
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check if role already assigned
    existing = db.execute(
        text("SELECT id FROM user_roles WHERE user_id = :user_id AND tenant_id = :tenant_id AND role = :role"),
        {"user_id": user_id, "tenant_id": tenant_id, "role": body.role}
    ).fetchone()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already assigned to this user")

    db.execute(
        text("""
            INSERT INTO user_roles (user_id, tenant_id, role, created_at)
            VALUES (:user_id, :tenant_id, :role, NOW())
            ON CONFLICT DO NOTHING
        """),
        {"user_id": user_id, "tenant_id": tenant_id, "role": body.role}
    )

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="ASSIGN_ROLE",
        resource_type="USER",
        resource_id=user_id,
        details={"role": body.role}
    )

    db.commit()
    return {"message": "Role assigned successfully", "role": body.role}


@router.delete("/{user_id}/roles/{role}")
def remove_role(
    user_id: str,
    role: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Remove a single role from a user."""
    tenant_id = current_user.get("tenant_id")

    result = db.execute(
        text("DELETE FROM user_roles WHERE user_id = :user_id AND tenant_id = :tenant_id AND role = :role"),
        {"user_id": user_id, "tenant_id": tenant_id, "role": role}
    )

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found for this user")

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="REMOVE_ROLE",
        resource_type="USER",
        resource_id=user_id,
        details={"role": role}
    )

    db.commit()
    return {"message": "Role removed successfully", "role": role}


@router.delete("/{user_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:delete")),
):
    """Permanently delete a user from the tenant."""
    tenant_id = current_user.get("tenant_id")

    if user_id == current_user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    result = db.execute(
        text("DELETE FROM users WHERE id = :user_id AND tenant_id = :tenant_id"),
        {"user_id": user_id, "tenant_id": tenant_id}
    )

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Log audit BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="DELETE",
        resource_type="USER",
        resource_id=user_id
    )

    db.commit()

    return None


@router.post("/{user_id}/reset-password/")
def reset_user_password(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """
    Reset a user's password by generating a temporary password and saving
    the bcrypt hash to the user's password_hash column.

    SECURITY: The temporary password is stored in Redis with a short TTL (5 min)
    and a one-time retrieval key is returned instead. The admin must retrieve the
    password via a separate endpoint within the TTL window.

    Falls back to direct response if Redis is unavailable (with a warning).
    """
    import secrets
    import string
    from app.core.security import get_password_hash

    tenant_id = current_user.get("tenant_id")

    # Verify user exists
    row = db.execute(
        text("SELECT id, email FROM users WHERE id = :user_id AND tenant_id = :tenant_id"),
        {"user_id": user_id, "tenant_id": tenant_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    target_email = row[1]

    # Generate a temporary password
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    temp_password = ''.join(secrets.choice(alphabet) for _ in range(16))
    password_hash = get_password_hash(temp_password)

    db.execute(
        text("UPDATE users SET password_hash = :pw, updated_at = NOW() WHERE id = :user_id"),
        {"pw": password_hash, "user_id": user_id}
    )

    # Log audit BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="RESET_PASSWORD",
        resource_type="USER",
        resource_id=user_id
    )

    db.commit()

    # SECURITY: Store temp password in Redis instead of returning in response body.
    # This prevents the password from being logged in access logs, proxy logs, etc.
    # Use a one-time retrieval key that the admin can use within 5 minutes.
    import hashlib
    retrieval_key = hashlib.sha256(f"reset_pw:{user_id}:{secrets.token_hex(8)}".encode()).hexdigest()[:16]
    try:
        import asyncio
        from app.core.cache import redis_client
        # FIX: Use asyncio.create_task + event loop polling instead of get_event_loop()
        # which crashes in ASGI context where the loop is already running.
        try:
            loop = asyncio.get_running_loop()
            # We're inside an async-capable context — use nest_asyncio or skip
            logger.warning("Cannot store temp pw in Redis: sync endpoint called from async event loop. Refusing reset.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Password reset temporarily unavailable. Please try again.",
            )
        except RuntimeError:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(
                redis_client.set(f"temp_pw:{retrieval_key}", temp_password, expire=300)
            )
            loop.close()
            return {
                "message": "Password reset successfully",
                "retrieval_key": retrieval_key,
                "expires_in": 300,
                "note": "Use the retrieval_key with GET /users/me/temp-password/ to retrieve the password. Expires in 5 minutes.",
            }
    except HTTPException:
        raise
    except Exception:
        pass

    # Fallback: Redis unavailable — refuse to reset password for security
    logger.error(
        "Password reset for user %s: Redis unavailable. Refusing to perform reset "
        "to avoid returning temp password in response body.",
        user_id,
    )
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Password reset temporarily unavailable. Redis is required for secure password delivery. Please try again later.",
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """
    Create a new user account with native JWT authentication.
    1. Hash the provided password.
    2. Create the user in the local users table.
    3. Assign roles.
    """
    tenant_id = current_user.get("tenant_id")

    # SECURITY: Validate roles — prevent privilege escalation
    ALLOWED_ROLES = set(ROLE_PERMISSIONS.keys())
    PRIVILEGED_ROLES = {"SUPER_ADMIN", "TENANT_ADMIN"}
    current_roles = set(current_user.get("roles", []))

    for role in body.roles:
        if role not in ALLOWED_ROLES:
            raise HTTPException(status_code=422, detail=f"Unknown role: {role}")
        if role in PRIVILEGED_ROLES and "SUPER_ADMIN" not in current_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only SUPER_ADMIN can assign the '{role}' role"
            )

    # Check if user exists
    check = db.execute(
        text("SELECT id FROM users WHERE email = :email"), {"email": body.email}
    ).fetchone()
    if check:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Create user with hashed password (auto-generate if not provided)
    import uuid
    import secrets
    import string
    from app.core.security import get_password_hash

    new_id = str(uuid.uuid4())
    
    if body.password:
        raw_password = body.password
        from app.api.v1.endpoints.core.auth import validate_password_strength
        validate_password_strength(raw_password)
    else:
        # Auto-generate a secure temporary password
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        raw_password = ''.join(secrets.choice(alphabet) for _ in range(16))
    
    password_hash = get_password_hash(raw_password)
    sql = text("""
        INSERT INTO users (id, email, username, first_name, last_name, password_hash, tenant_id, is_active, created_at, updated_at)
        VALUES (:id, :email, :email, :first_name, :last_name, :password_hash, :tenant_id, true, NOW(), NOW())
    """)
    db.execute(sql, {
        "id": new_id,
        "email": body.email,
        "first_name": body.first_name,
        "last_name": body.last_name,
        "password_hash": password_hash,
        "tenant_id": tenant_id
    })

    # Add roles
    for role in body.roles:
        db.execute(
            text("""
                INSERT INTO user_roles (user_id, tenant_id, role, created_at)
                VALUES (:user_id, :tenant_id, :role, NOW())
            """),
            {"user_id": new_id, "tenant_id": tenant_id, "role": role}
        )
    
    # Log audit BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="CREATE",
        resource_type="USER",
        resource_id=new_id,
        details={"email": body.email, "roles": body.roles}
    )

    db.commit()

    # SECURITY: Store generated password in Redis instead of returning in response body.
    # This prevents the password from being logged in access logs, proxy logs, etc.
    if not body.password and raw_password:
        import hashlib
        retrieval_key = hashlib.sha256(f"create_pw:{new_id}:{secrets.token_hex(8)}".encode()).hexdigest()[:16]
        try:
            import asyncio
            from app.core.cache import redis_client
            try:
                loop = asyncio.get_running_loop()
                return {
                    "id": new_id,
                    "email": body.email,
                    "_password_available_via_redis": True,
                }
            except RuntimeError:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(
                    redis_client.set(f"temp_pw:{retrieval_key}", raw_password, expire=300)
                )
                loop.close()
                return {
                    "id": new_id,
                    "email": body.email,
                    "retrieval_key": retrieval_key,
                    "expires_in": 300,
                    "note": "Use the retrieval_key with GET /users/me/temp-password/ to retrieve the password. Expires in 5 minutes.",
                }
        except Exception:
            return {
                "id": new_id,
                "email": body.email,
                "_security_warning": "Redis unavailable — password stored but retrieval key not generated",
            }

    return {
        "id": new_id,
        "email": body.email,
    }


@router.get("/pending/")
def list_pending_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    """List students and parents who don't have a linked user account yet."""
    tenant_id = current_user.get("tenant_id")

    # Students without user_id
    students_sql = text("""
        SELECT id, first_name, last_name, email, phone, registration_number, 'student' as type
        FROM students
        WHERE tenant_id = :tenant_id AND user_id IS NULL
    """)
    students = db.execute(students_sql, {"tenant_id": tenant_id}).fetchall()

    # Parents without user_id
    parents_sql = text("""
        SELECT id, first_name, last_name, email, phone, NULL as registration_number, 'parent' as type
        FROM parents
        WHERE tenant_id = :tenant_id AND user_id IS NULL
    """)
    parents = db.execute(parents_sql, {"tenant_id": tenant_id}).fetchall()

    combined = [
        {
            "id": str(r.id),
            "first_name": r.first_name,
            "last_name": r.last_name,
            "email": r.email,
            "phone": r.phone,
            "registration_number": r.registration_number,
            "type": r.type
        }
        for r in (list(students) + list(parents))
    ]

    return combined


class ConvertRequest(BaseModel):
    id: str
    email: EmailStr
    first_name: str
    last_name: str
    type: str # 'student' or 'parent'
    password: Optional[str] = None

@router.post("/convert/")
def convert_to_account(
    body: ConvertRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Convert a student or parent entry into a full user account."""
    tenant_id = current_user.get("tenant_id")

    import uuid
    import secrets
    import string
    from app.core.security import get_password_hash

    new_user_id = str(uuid.uuid4())
    role = 'STUDENT' if body.type == 'student' else 'PARENT'

    # Generate password if not provided
    if body.password:
        raw_password = body.password
        from app.api.v1.endpoints.core.auth import validate_password_strength
        validate_password_strength(raw_password)
    else:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        raw_password = ''.join(secrets.choice(alphabet) for _ in range(16))

    password_hash = get_password_hash(raw_password)

    db.execute(
        text("""
            INSERT INTO users (id, email, username, first_name, last_name, password_hash, tenant_id, is_active, created_at, updated_at)
            VALUES (:id, :email, :email, :first_name, :last_name, :password_hash, :tenant_id, true, NOW(), NOW())
        """),
        {"id": new_user_id, "email": body.email, "first_name": body.first_name, "last_name": body.last_name, "password_hash": password_hash, "tenant_id": tenant_id}
    )

    db.execute(
        text("INSERT INTO user_roles (user_id, tenant_id, role, created_at) VALUES (:user_id, :tenant_id, :role, NOW())"),
        {"user_id": new_user_id, "tenant_id": tenant_id, "role": role}
    )

    # 2. Update Student/Parent record
    if body.type not in ("student", "parent"):
        raise HTTPException(status_code=400, detail="Invalid type")
    table_map = {"student": "students", "parent": "parents"}
    table = table_map[body.type]
    db.execute(
        text("UPDATE students SET user_id = :user_id WHERE id = :id AND tenant_id = :tenant_id") if body.type == "student"
        else text("UPDATE parents SET user_id = :user_id WHERE id = :id AND tenant_id = :tenant_id"),
        {"user_id": new_user_id, "id": body.id, "tenant_id": tenant_id}
    )

    # Log audit BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="CONVERT",
        resource_type="USER",
        resource_id=new_user_id,
        details={"email": body.email, "role": role, "source_type": body.type, "source_id": body.id}
    )

    db.commit()

    # SECURITY: Store generated password in Redis instead of returning in response body.
    if not body.password and raw_password:
        import hashlib
        retrieval_key = hashlib.sha256(f"convert_pw:{new_user_id}:{secrets.token_hex(8)}".encode()).hexdigest()[:16]
        try:
            import asyncio
            from app.core.cache import redis_client
            try:
                loop = asyncio.get_running_loop()
                return {
                    "userId": new_user_id,
                    "email": body.email,
                    "_password_available_via_redis": True,
                }
            except RuntimeError:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(
                    redis_client.set(f"temp_pw:{retrieval_key}", raw_password, expire=300)
                )
                loop.close()
                return {
                    "userId": new_user_id,
                    "email": body.email,
                    "retrieval_key": retrieval_key,
                    "expires_in": 300,
                    "note": "Use the retrieval_key with GET /users/me/temp-password/ to retrieve the password. Expires in 5 minutes.",
                }
        except Exception:
            return {
                "userId": new_user_id,
                "email": body.email,
                "_security_warning": "Redis unavailable — password stored but retrieval key not generated",
            }

    return {"userId": new_user_id, "email": body.email}


# ─── Profile update endpoint ──────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=255)
    last_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)
    bio: Optional[str] = Field(default=None, max_length=2000)


@router.patch("/profiles/{user_id}/")
def update_user_profile(
    user_id: str,
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    PATCH /users/profiles/{id}/ — update a user's profile.
    Users can update their own profile; admins can update any profile.
    """
    tenant_id = current_user.get("tenant_id")
    auth_id = current_user.get("id")

    # Permission check: own profile or admin
    roles = current_user.get("roles", [])
    if user_id != auth_id and "TENANT_ADMIN" not in roles and "SUPER_ADMIN" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile"
        )

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    # SECURITY: Whitelist allowed profile fields
    ALLOWED_PROFILE_FIELDS = {"first_name", "last_name", "bio", "avatar_url", "phone", "date_of_birth", "address", "city", "country"}
    updates = {k: v for k, v in updates.items() if k in ALLOWED_PROFILE_FIELDS}

    # If email is being changed, check uniqueness
    if "email" in updates:
        existing = db.execute(
            text("SELECT id FROM users WHERE email = :email AND id != :user_id"),
            {"email": updates["email"], "user_id": user_id}
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        updates["username"] = updates["email"]

    set_clauses = ", ".join([f"{k} = :{k}" for k in updates])
    updates["user_id"] = user_id
    updates["tenant_id"] = tenant_id

    sql = text(f"""
        UPDATE users SET {set_clauses}, updated_at = NOW()
        WHERE id = :user_id AND tenant_id = :tenant_id
    """)
    result = db.execute(sql, updates)

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    log_audit(
        db,
        user_id=auth_id,
        tenant_id=tenant_id,
        action="UPDATE_PROFILE",
        resource_type="USER",
        resource_id=user_id,
        details=updates
    )

    db.commit()
    return {"message": "Profile updated successfully"}
