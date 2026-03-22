"""Users endpoints — full CRUD + role management"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import math

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

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
    first_name: str
    last_name: str
    roles: List[str] = []


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None


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
    sql_user = text("""
        SELECT 
            u.id::text, u.email, u.first_name, u.last_name, 
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
        where_clauses.append(
            "(u.first_name ILIKE :search OR u.last_name ILIKE :search OR u.email ILIKE :search)"
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

    users_sql = text(f"""
        SELECT
            u.id::text,
            u.email,
            u.first_name,
            u.last_name,
            u.is_active,
            u.avatar_url,
            u.created_at,
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
    """)
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
    sql = text("""
        SELECT
            u.id::text, u.email, u.first_name, u.last_name,
            u.is_active, u.avatar_url, u.created_at,
            COALESCE(
                ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL),
                ARRAY[]::text[]
            ) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
        WHERE u.id = :user_id AND u.tenant_id = :tenant_id
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.avatar_url, u.created_at
    """)
    row = db.execute(sql, {"user_id": user_id, "tenant_id": tenant_id}).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "id": row.id,
        "email": row.email,
        "first_name": row.first_name,
        "last_name": row.last_name,
        "is_active": row.is_active,
        "avatar_url": row.avatar_url,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "roles": list(row.roles) if row.roles else [],
    }


@router.patch("/{user_id}/")
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Update user profile fields (first_name, last_name, avatar_url, is_active)."""
    tenant_id = current_user.get("tenant_id")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    set_clauses = ", ".join([f"{k} = :{k}" for k in updates])
    updates["user_id"] = user_id
    updates["tenant_id"] = tenant_id

    sql = text(f"""
        UPDATE users SET {set_clauses}, updated_at = NOW()
        WHERE id = :user_id AND tenant_id = :tenant_id
    """)
    result = db.execute(sql, updates)
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    # Log audit
    log_audit(
        db, 
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE",
        resource_type="USER",
        resource_id=user_id,
        details=updates
    )
    
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
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    action = "activated" if body.is_active else "deactivated"
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
    db.commit()
    
    # Log audit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE_ROLES",
        resource_type="USER",
        resource_id=user_id,
        details={"roles": body.roles}
    )
    
    return {"message": "Roles updated successfully", "roles": body.roles}


@router.delete("/{user_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
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
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    # Log audit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="DELETE",
        resource_type="USER",
        resource_id=user_id
    )
    
    return None


@router.post("/{user_id}/reset-password/")
def reset_user_password(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """
    Trigger a password reset for the user via Keycloak admin API.
    Returns a reset link/status.
    """
    try:
        from app.core.config import settings
        import requests

        # Get admin token from Keycloak
        token_url = f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/token"
        token_resp = requests.post(token_url, data={
            "client_id": settings.KEYCLOAK_CLIENT_ID,
            "client_secret": settings.KEYCLOAK_CLIENT_SECRET,
            "grant_type": "client_credentials",
        }, timeout=10)
        token_resp.raise_for_status()
        admin_token = token_resp.json().get("access_token")

        # Send password reset email via Keycloak admin
        reset_url = (
            f"{settings.KEYCLOAK_URL}/admin/realms/{settings.KEYCLOAK_REALM}"
            f"/users/{user_id}/execute-actions-email"
        )
        reset_resp = requests.put(
            reset_url,
            json=["UPDATE_PASSWORD"],
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        reset_resp.raise_for_status()
        return {"message": "Password reset email sent"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send password reset: {str(e)}"
        )
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """
    Create a new user account:
    1. Create the user in Keycloak (mocked logic or actual API).
    2. Create the user in the local users table.
    3. Link roles.
    """
    tenant_id = current_user.get("tenant_id")
    # In a real scenario, we'd call Keycloak admin API here.
    # For now, we'll create the record in our 'users' and 'user_roles' tables.

    # Check if user exists
    check = db.execute(
        text("SELECT id FROM users WHERE email = :email"), {"email": body.email}
    ).fetchone()
    if check:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Create user
    import uuid
    new_id = str(uuid.uuid4())
    sql = text("""
        INSERT INTO users (id, email, username, keycloak_id, first_name, last_name, tenant_id, is_active, created_at, updated_at)
        VALUES (:id, :email, :email, :id, :first_name, :last_name, :tenant_id, true, NOW(), NOW())
    """)
    db.execute(sql, {
        "id": new_id,
        "email": body.email,
        "first_name": body.first_name,
        "last_name": body.last_name,
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
    
    db.commit()
    
    return {"id": new_id, "email": body.email}


@router.get("/pending/")
def list_pending_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:read")),
):
    """List students and parents who don't have a linked user account yet."""
    tenant_id = current_user.get("tenant_id")

    # Students without user_id
    students_sql = text("""
        SELECT id, first_name, last_name, email, registration_number, 'student' as type
        FROM students
        WHERE tenant_id = :tenant_id AND user_id IS NULL AND is_archived = false
    """)
    students = db.execute(students_sql, {"tenant_id": tenant_id}).fetchall()

    # Parents without user_id
    parents_sql = text("""
        SELECT id, first_name, last_name, email, NULL as registration_number, 'parent' as type
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

@router.post("/convert/")
def convert_to_account(
    body: ConvertRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("users:write")),
):
    """Convert a student or parent entry into a full user account."""
    tenant_id = current_user.get("tenant_id")
    
    # 1. Create User
    import uuid
    new_user_id = str(uuid.uuid4())
    role = 'STUDENT' if body.type == 'student' else 'PARENT'
    
    db.execute(
        text("""
            INSERT INTO users (id, email, username, keycloak_id, first_name, last_name, tenant_id, is_active, created_at)
            VALUES (:id, :email, :email, :id, :first_name, :last_name, :tenant_id, true, NOW())
        """),
        {"id": new_user_id, "email": body.email, "first_name": body.first_name, "last_name": body.last_name, "tenant_id": tenant_id}
    )
    
    db.execute(
        text("INSERT INTO user_roles (user_id, tenant_id, role) VALUES (:user_id, :tenant_id, :role)"),
        {"user_id": new_user_id, "tenant_id": tenant_id, "role": role}
    )
    
    # 2. Update Student/Parent record
    table = "students" if body.type == "student" else "parents"
    db.execute(
        text(f"UPDATE {table} SET user_id = :user_id WHERE id = :id AND tenant_id = :tenant_id"),
        {"user_id": new_user_id, "id": body.id, "tenant_id": tenant_id}
    )
    
    db.commit()
    return {"userId": new_user_id, "email": body.email}
