import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, verify_password
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: str | None = None
    expires_in: int


class UserInfo(BaseModel):
    id: str
    email: str
    username: str
    roles: list[str]
    tenant_id: str | None


@router.post("/login/", response_model=Token)
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(or_(User.email == form_data.username, User.username == form_data.username))
        .first()
    )

    if not user or not user.is_active or not verify_password(form_data.password, getattr(user, "password_hash", None)):
        logger.info("Native login failed for user '%s'", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    roles = [role for (role,) in db.query(UserRole.role).filter(UserRole.user_id == user.id).all()]
    access_token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "preferred_username": user.username,
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
            "roles": roles,
        }
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=None,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh/", response_model=Token)
@limiter.limit("20/minute")
async def refresh_token(request: Request, current_user: dict = Depends(get_current_user)):
    access_token = create_access_token(
        {
            "sub": current_user["id"],
            "email": current_user.get("email"),
            "preferred_username": current_user.get("username"),
            "tenant_id": current_user.get("tenant_id"),
            "roles": current_user.get("roles", []),
        }
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=None,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout/")
async def logout(current_user: dict = Depends(get_current_user)):
    logger.info("User '%s' logged out", current_user.get("email"))
    return {"message": "Successfully logged out"}


@router.get("/me/", response_model=UserInfo)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return UserInfo(
        id=current_user.get("id", ""),
        email=current_user.get("email", ""),
        username=current_user.get("username", ""),
        roles=current_user.get("roles", []),
        tenant_id=current_user.get("tenant_id"),
    )
