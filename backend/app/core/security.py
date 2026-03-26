import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

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
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verify_token(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_sub": True},
        )
    except JWTError as exc:
        logger.info("JWT validation failed: %s", exc)
        raise credentials_exception

def get_current_user(token: dict = Depends(verify_token)) -> dict:
    """
    Dependency that returns the current authenticated user from the native JWT payload.
    Enriched with database roles and tenant_id for authorization.
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

        return {
            "id": str(user_db.id),
            "email": user_db.email,
            "first_name": user_db.first_name,
            "last_name": user_db.last_name,
            "username": user_db.username,
            "roles": roles,
            "tenant_id": str(user_db.tenant_id) if user_db.tenant_id else None,
        }

ROLE_PERMISSIONS: dict = {
    "SUPER_ADMIN": ["*"],
    "TENANT_ADMIN": ["*"],
    "DIRECTOR": [
        "users:read", "students:read", "students:write",
        "analytics:read", "reports:read", "finance:read",
    ],
    "TEACHER": [
        "students:read", "grades:read", "grades:write",
        "attendance:read", "attendance:write",
    ],
    "STUDENT": ["me:read", "grades:read", "attendance:read"],
    "PARENT": ["me:read", "students:read", "grades:read", "attendance:read"],
    "ALUMNI": ["me:read"],
    "STAFF": ["students:read", "attendance:read"],
    "ACCOUNTANT": ["finance:read", "finance:write", "students:read"],
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
