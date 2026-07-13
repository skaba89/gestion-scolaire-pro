"""Users endpoints — full CRUD + role management"""
from typing import Literal, Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from uuid import UUID
import math

from app.core.database import get_db
from app.core.security import get_current_user, require_permission, ROLE_PERMISSIONS
from app.core.config import settings
from app.utils.audit import log_audit
from app.models import Student, User, UserRole
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
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    password: Optional[str] = None
    roles: List[str] = Field(min_length=1)


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
    # NOTE: must_change_password may not exist yet (pending Alembic migration).
    # Try full query first; fall back to query without that column.
    try:
        sql_user = text("""
            SELECT 
                CAST(u.id AS VARCHAR), u.email, u.first_name, u.last_name, 
                u.is_active, u.avatar_url, u.created_at, u.tenant_id,
                t.slug as tenant_slug, t.name as tenant_name,
                t.settings as tenant_settings, t.type as tenant_type,
                u.mfa_enabled,
                COALESCE(u.must_change_password, false) as must_change_password
            FROM users u
            LEFT JOIN tenants t ON t.id = u.tenant_id
            WHERE u.id = :user_id
        """)
        row = db.execute(sql_user, {"user_id": user_id}).fetchone()
    except Exception:
        logger.warning("must_change_password column missing, using fallback query for /users/me/")
        sql_user = text("""
            SELECT 
                CAST(u.id AS VARCHAR), u.email, u.first_name, u.last_name, 
                u.is_active, u.avatar_url, u.created_at, u.tenant_id,
                t.slug as tenant_slug, t.name as tenant_name,
                t.settings as tenant_settings, t.type as tenant_type,
                u.mfa_enabled,
                false as must_change_password
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
                "mfa_enabled": False,
                "must_change_password": False,
            },
            "profile": {
                "first_name": "",
                "last_name": "",
                "avatar_url": None,
                "must_change_password": False,
            },
            "roles": all_roles,
            "tenant": None
        }

    return {
        "user": {
            "id": row.id,
            "email": row.email,
            "mfa_enabled": bool(row.mfa_enabled) if row.mfa_enabled is not None else False,
            "must_change_password": bool(row.must_change_password) if row.must_change_password is not None else False,
        },
        "profile": {
            "first_name": row.first_name,
            "last_name": row.last_name,
            "avatar_url": row.avatar_url,
            "must_change_password": bool(row.must_change_password) if row.must_change_password is not None else False,
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


# ─── GET /users/roles/ ─── List all role assignments for the tenant ──────────
# MUST be defined BEFORE /{user_id}/ to prevent "roles" being matched as user_id

@router.get("/roles/")
def list_user_roles(
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    """GET /users/roles/ — list all user-role assignments for the current tenant."""
    tid = tenant_id or current_user.get("tenant_id")
    rows = db.execute(text("""
        SELECT ur.user_id, ur.role, ur.tenant_id, ur.created_at,
               u.first_name, u.last_name, u.email,
               -- Synthetic id: user_id:role (no separate PK on user_roles)
               CONCAT(ur.user_id::text, ':', ur.role) AS id
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
        WHERE ur.tenant_id = :tid
        ORDER BY u.last_name, u.first_name, ur.role
        LIMIT 500
    """), {"tid": tid}).mappings().all()

    return [
        {
            "id": r["id"],
            "user_id": str(r["user_id"]),
            "role": r["role"],
            "created_at": r["created_at"],
            "profile": {
                "first_name": r["first_name"],
                "last_name": r["last_name"],
                "email": r["email"],
            },
        }
        for r in rows
    ]


class AssignRoleDirectRequest(BaseModel):
    user_id: str
    role: str
    tenant_id: Optional[str] = None


@router.post("/roles/", status_code=201)
def assign_role_direct(
    body: AssignRoleDirectRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """POST /users/roles/ — assign a role to a user for the current tenant."""
    tid = body.tenant_id or current_user.get("tenant_id")
    try:
        db.execute(text("""
            INSERT INTO user_roles (user_id, tenant_id, role, created_at)
            VALUES (:user_id, :tenant_id, :role, NOW())
            ON CONFLICT DO NOTHING
        """), {"user_id": body.user_id, "tenant_id": tid, "role": body.role})
        db.commit()
        return {
            "id": f"{body.user_id}:{body.role}",
            "user_id": body.user_id,
            "role": body.role,
            "tenant_id": tid,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/roles/{role_id}/", status_code=204)
def remove_role_direct(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """DELETE /users/roles/{role_id}/ — remove a role assignment.
    role_id format: '{user_id}:{role}'
    """
    tid = current_user.get("tenant_id")
    if ":" not in role_id:
        raise HTTPException(status_code=400, detail="Invalid role_id format (expected user_id:role)")
    user_id, role = role_id.split(":", 1)
    db.execute(text("""
        DELETE FROM user_roles WHERE user_id = :user_id AND role = :role AND tenant_id = :tid
    """), {"user_id": user_id, "role": role, "tid": tid})
    db.commit()


# ─── GET /users/profiles/ ─── List user profiles for the tenant ───────────────
# MUST be before /{user_id}/ to avoid "profiles" matching as a user_id param

@router.get("/profiles/")
def list_user_profiles(
    tenant_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    """GET /users/profiles/ — list user profiles for a tenant (supports ?search=email)."""
    tid = tenant_id or current_user.get("tenant_id")
    where = ["u.tenant_id = :tid"]
    params: dict = {"tid": tid}

    if search:
        where.append(
            "(LOWER(u.first_name) LIKE LOWER(:search) OR LOWER(u.last_name) LIKE LOWER(:search) OR LOWER(u.email) LIKE LOWER(:search))"
        )
        params["search"] = f"%{search}%"

    rows = db.execute(text(f"""
        SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, u.created_at,
               p.avatar_url, p.phone,
               COALESCE(
                   (SELECT array_agg(ur.role) FROM user_roles ur WHERE ur.user_id = u.id AND ur.tenant_id = u.tenant_id),
                   ARRAY[]::text[]
               ) AS roles
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE {' AND '.join(where)}
        ORDER BY u.last_name, u.first_name
        LIMIT 200
    """), params).mappings().all()

    return [
        {
            "id": str(r["id"]),
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "email": r["email"],
            "is_active": r["is_active"],
            "avatar_url": r["avatar_url"],
            "phone": r["phone"],
            "roles": list(r["roles"]) if r["roles"] else [],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


# ─── GET /users/pending/ ─── MUST be before /{user_id}/ ─────────────────────
# Moved up from the bottom of the file — FastAPI matches routes in registration
# order, so "/pending/" must come before "/{user_id}/" or "pending" is captured
# as a UUID param and causes an InvalidTextRepresentation DB error.

@router.get("/pending/")
def list_pending_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1),
):
    """List students who don't have a linked user account yet (matched by email)."""
    tenant_id = current_user.get("tenant_id")

    # Students whose email doesn't match any user in the same tenant
    students_sql = text("""
        SELECT s.id, s.first_name, s.last_name, s.email, s.phone,
               s.registration_number, 'student' as type
        FROM students s
        WHERE s.tenant_id = :tenant_id
          AND s.user_id IS NULL
          AND (
              s.email IS NULL
              OR s.email NOT IN (
                  SELECT u.email FROM users u
                  WHERE u.tenant_id = :tenant_id AND u.email IS NOT NULL
              )
          )
        ORDER BY s.last_name, s.first_name
    """)
    students = db.execute(students_sql, {"tenant_id": tenant_id}).fetchall()

    # Pending parent identities are inactive users with the PARENT role. Their
    # stable user ID can already be linked to children before portal activation.
    parents_sql = text("""
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
               NULL AS registration_number, 'parent' AS type
        FROM users u
        JOIN user_roles ur
          ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
        WHERE u.tenant_id = :tenant_id
          AND ur.role = 'PARENT'
          AND u.is_active = false
        ORDER BY u.last_name, u.first_name
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

    if page_size >= 100:
        return combined

    total = len(combined)
    start = (page - 1) * page_size
    end = start + page_size
    return {"items": combined[start:end], "total": total}


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
async def reset_user_password(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Invalidate the current password and email a single-use reset link."""
    import secrets
    from app.core.security import get_password_hash
    from app.api.v1.endpoints.core.auth import blacklist_all_user_tokens
    from app.services.account_provisioning import (
        PasswordSetupDeliveryError,
        delete_password_setup_token,
        deliver_password_setup_link,
    )

    tenant_id = current_user.get("tenant_id")

    # Verify user exists
    row = db.execute(
        text("""
            SELECT id, email, first_name, last_name
            FROM users
            WHERE id = :user_id AND tenant_id = :tenant_id
        """),
        {"user_id": user_id, "tenant_id": tenant_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    target_email = row.email
    target_name = f"{row.first_name or ''} {row.last_name or ''}".strip() or target_email
    # Replace the old password before delivery so compromised credentials stop working.
    password_hash = get_password_hash(secrets.token_urlsafe(32))

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :pw, must_change_password = true, updated_at = NOW()
            WHERE id = :user_id AND tenant_id = :tenant_id
        """),
        {"pw": password_hash, "user_id": user_id, "tenant_id": tenant_id}
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

    delivery = None
    try:
        delivery = await deliver_password_setup_link(
            user_id=user_id,
            email=target_email,
            user_name=target_name,
            purpose="reset",
            expires_in=900,
        )
        db.commit()
    except PasswordSetupDeliveryError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email could not be delivered. No account change was made.",
        ) from exc
    except Exception:
        db.rollback()
        if delivery:
            await delete_password_setup_token(delivery.token)
        raise

    await blacklist_all_user_tokens(user_id)
    return {
        "message": "Password reset link sent",
        "email_sent": True,
        "expires_in": delivery.expires_in,
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
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
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

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

    import secrets
    from app.core.security import get_password_hash
    from app.services.account_provisioning import (
        PasswordSetupDeliveryError,
        delete_password_setup_token,
        deliver_password_setup_link,
    )

    normalized_email = str(body.email).strip().lower()
    if db.query(User).filter(func.lower(User.email) == normalized_email).first():
        raise HTTPException(status_code=409, detail="User with this email already exists")

    if body.password:
        raw_password = body.password
        from app.api.v1.endpoints.core.auth import validate_password_strength
        validate_password_strength(raw_password)
    else:
        # The random value is never disclosed; the user chooses a password via email.
        raw_password = secrets.token_urlsafe(32)

    account = User(
        tenant_id=tenant_id,
        email=normalized_email,
        username=normalized_email,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        password_hash=get_password_hash(raw_password),
        is_active=True,
        is_verified=False,
        must_change_password=True,
    )
    delivery = None
    try:
        db.add(account)
        db.flush()
        for role in body.roles:
            db.add(UserRole(tenant_id=tenant_id, user_id=account.id, role=role))

        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="CREATE",
            resource_type="USER",
            resource_id=str(account.id),
            details={"email": normalized_email, "roles": body.roles},
        )
        if not body.password:
            delivery = await deliver_password_setup_link(
                user_id=str(account.id),
                email=normalized_email,
                user_name=f"{account.first_name} {account.last_name}".strip(),
                purpose="invitation",
                expires_in=86400,
            )
        db.commit()
    except PasswordSetupDeliveryError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitation email could not be delivered. No account was created.",
        ) from exc
    except IntegrityError as exc:
        db.rollback()
        if delivery:
            await delete_password_setup_token(delivery.token)
        raise HTTPException(status_code=409, detail="User with this email already exists") from exc
    except Exception:
        db.rollback()
        if delivery:
            await delete_password_setup_token(delivery.token)
        raise

    return {
        "id": str(account.id),
        "email": normalized_email,
        "invitation_sent": bool(delivery),
        "expires_in": delivery.expires_in if delivery else None,
    }


class ConvertRequest(BaseModel):
    id: str
    email: EmailStr
    first_name: str
    last_name: str
    type: Literal["student", "parent"]
    password: Optional[str] = None

@router.post("/convert/")
async def convert_to_account(
    body: ConvertRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Convert a student or parent entry into a full user account."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

    import secrets
    from app.core.security import get_password_hash
    from app.services.account_provisioning import (
        PasswordSetupDeliveryError,
        delete_password_setup_token,
        deliver_password_setup_link,
    )

    role = 'STUDENT' if body.type == 'student' else 'PARENT'

    # Generate password if not provided
    if body.password:
        raw_password = body.password
        from app.api.v1.endpoints.core.auth import validate_password_strength
        validate_password_strength(raw_password)
    else:
        raw_password = secrets.token_urlsafe(32)

    password_hash = get_password_hash(raw_password)
    normalized_email = str(body.email).strip().lower()

    delivery = None
    try:
        if body.type == "parent":
            account = db.query(User).join(
                UserRole,
                (UserRole.user_id == User.id) & (UserRole.tenant_id == User.tenant_id),
            ).filter(
                User.id == body.id,
                User.tenant_id == tenant_id,
                UserRole.role == "PARENT",
            ).first()
            if not account:
                raise HTTPException(status_code=404, detail="Pending parent not found")
            if account.is_active:
                raise HTTPException(status_code=409, detail="Parent account is already active")

            email_owner = db.query(User).filter(func.lower(User.email) == normalized_email).first()
            if email_owner and email_owner.id != account.id:
                raise HTTPException(status_code=409, detail="An account already exists for this email")

            account.email = normalized_email
            account.username = normalized_email
            account.first_name = body.first_name.strip()
            account.last_name = body.last_name.strip()
            account.password_hash = password_hash
            account.is_active = True
            account.must_change_password = True
        else:
            student = db.query(Student).filter(
                Student.id == body.id,
                Student.tenant_id == tenant_id,
            ).first()
            if not student:
                raise HTTPException(status_code=404, detail="Student not found")
            if student.user_id:
                raise HTTPException(status_code=409, detail="Student already has a portal account")
            if db.query(User).filter(func.lower(User.email) == normalized_email).first():
                raise HTTPException(status_code=409, detail="An account already exists for this email")

            account = User(
                tenant_id=tenant_id,
                email=normalized_email,
                username=normalized_email,
                first_name=body.first_name.strip(),
                last_name=body.last_name.strip(),
                password_hash=password_hash,
                is_active=True,
                is_verified=False,
                must_change_password=True,
            )
            db.add(account)
            db.flush()
            db.add(UserRole(
                tenant_id=tenant_id,
                user_id=account.id,
                role="STUDENT",
            ))
            student.user_id = account.id
            student.email = normalized_email

        db.flush()
        new_user_id = str(account.id)

        # Log audit BEFORE commit
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="CONVERT",
            resource_type="USER",
            resource_id=new_user_id,
            details={"email": normalized_email, "role": role, "source_type": body.type, "source_id": body.id}
        )

        if not body.password:
            delivery = await deliver_password_setup_link(
                user_id=new_user_id,
                email=normalized_email,
                user_name=f"{account.first_name} {account.last_name}".strip(),
                purpose="invitation",
                expires_in=86400,
            )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except PasswordSetupDeliveryError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitation email could not be delivered. No account was activated.",
        ) from exc
    except IntegrityError:
        db.rollback()
        if delivery:
            await delete_password_setup_token(delivery.token)
        raise HTTPException(status_code=409, detail="Account conversion conflicts with existing data")
    except Exception as exc:
        db.rollback()
        if delivery:
            await delete_password_setup_token(delivery.token)
        logger.error("Account conversion failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail="Account conversion failed")

    return {
        "userId": new_user_id,
        "email": normalized_email,
        "invitation_sent": bool(delivery),
        "expires_in": delivery.expires_in if delivery else None,
    }


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
