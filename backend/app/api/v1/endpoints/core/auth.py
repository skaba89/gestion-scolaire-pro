import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.security import get_current_user, keycloak_openid

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
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """Login with username/password via Keycloak (5 tentatives/minute par IP)."""
    try:
        token = keycloak_openid.token(
            username=form_data.username,
            password=form_data.password,
        )
        return Token(
            access_token=token["access_token"],
            token_type="bearer",
            refresh_token=token.get("refresh_token"),
            expires_in=token.get("expires_in", 300),
        )
    except Exception as exc:
        logger.info("Login failed for user '%s': %s", form_data.username, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/refresh/", response_model=Token)
@limiter.limit("20/minute")
async def refresh_token(request: Request, refresh_token: str):
    """Refresh access token (20 req/minute par IP)."""
    try:
        token = keycloak_openid.refresh_token(refresh_token)
        return Token(
            access_token=token["access_token"],
            token_type="bearer",
            refresh_token=token.get("refresh_token"),
            expires_in=token.get("expires_in", 300),
        )
    except Exception as exc:
        logger.info("Token refresh failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )


@router.post("/logout/")
async def logout(refresh_token: str, current_user: dict = Depends(get_current_user)):
    """Logout user and invalidate refresh token in Keycloak."""
    try:
        keycloak_openid.logout(refresh_token)
        logger.info("User '%s' logged out", current_user.get("email"))
        return {"message": "Successfully logged out"}
    except Exception as exc:
        logger.warning("Logout failed for user '%s': %s", current_user.get("email"), exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logout failed",
        )


@router.get("/me/", response_model=UserInfo)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user information."""
    return UserInfo(
        id=current_user.get("id", ""),
        email=current_user.get("email", ""),
        username=current_user.get("username", ""),
        roles=current_user.get("roles", []),
        tenant_id=current_user.get("tenant_id"),
    )
