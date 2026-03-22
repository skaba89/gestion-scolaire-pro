import logging
import time
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from app.core.config import settings
import requests
from keycloak import KeycloakOpenID

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

keycloak_openid = KeycloakOpenID(
    server_url=settings.KEYCLOAK_URL,
    client_id=settings.KEYCLOAK_CLIENT_ID,
    realm_name=settings.KEYCLOAK_REALM,
    client_secret_key=settings.KEYCLOAK_CLIENT_SECRET,
)

_jwks_cache: dict = {
    "data": None,
    "last_fetched": 0,
    "ttl": 600,        # 10 minutes de cache valide
    "stale_max": 1800, # 30 minutes : au-delà, refus du cache périmé pour éviter tokens révoqués
}


def get_keycloak_public_key():
    """
    Fetch and cache the Keycloak JWKS (JSON Web Key Set).
    - Returns cached data if within TTL (10 min).
    - On fetch failure: allows stale cache up to 30 minutes (network hiccup tolerance).
    - After 30 minutes of staleness: raises 503 to prevent accepting revoked tokens.
    """
    current_time = time.time()

    # Cache valide → retourner directement
    if _jwks_cache["data"] and (current_time - _jwks_cache["last_fetched"] < _jwks_cache["ttl"]):
        return _jwks_cache["data"]

    jwks_url = (
        settings.KEYCLOAK_JWKS_URL
        or f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/certs"
    )

    try:
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        jwks_data = response.json()
        _jwks_cache["data"] = jwks_data
        _jwks_cache["last_fetched"] = current_time
        logger.info("JWKS cache refreshed from %s", jwks_url)
        return jwks_data
    except Exception as exc:
        stale_age = current_time - _jwks_cache["last_fetched"]
        if _jwks_cache["data"] and stale_age < _jwks_cache["stale_max"]:
            logger.warning(
                "JWKS fetch failed (%s), using stale cache (age: %.0fs). URL: %s",
                exc, stale_age, jwks_url,
            )
            return _jwks_cache["data"]
        if _jwks_cache["data"]:
            logger.error(
                "JWKS fetch failed and cache is too stale (%.0fs > %ss). Refusing authentication. URL: %s",
                stale_age, _jwks_cache["stale_max"], jwks_url,
            )
        else:
            logger.error("JWKS fetch failed and no cache available. URL: %s — %s", jwks_url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity provider unavailable. Please try again shortly.",
        )


def verify_token(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    jwks = get_keycloak_public_key()

    try:
        header = jwt.get_unverified_header(token)

        rsa_key = {}
        for key in jwks.get("keys", []):
            if key.get("kid") == header.get("kid"):
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"],
                }
                break

        if not rsa_key:
            available_kids = [k.get("kid") for k in jwks.get("keys", [])]
            logger.warning(
                "JWT kid '%s' not found in JWKS. Available: %s",
                header.get("kid"), available_kids,
            )
            raise credentials_exception

        # En production, vérifier l'audience ; en dev, mode souple
        audience = settings.KEYCLOAK_AUDIENCE if not settings.DEBUG else None
        decode_options: dict = {"verify_sub": True}

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=audience,
            options=decode_options,
        )
        return payload

    except JWTError as exc:
        logger.info("JWT validation failed: %s", exc)
        raise credentials_exception
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error during token verification: %s", exc)
        raise credentials_exception


def get_current_user(token: dict = Depends(verify_token)) -> dict:
    """
    Dependency that returns the current authenticated user from JWT payload.
    Enriched with database roles and tenant_id for hybrid authorization.
    """
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.models.user_role import UserRole

    user = {
        "id": token.get("sub"),
        "email": token.get("email"),
        "first_name": token.get("given_name"),
        "last_name": token.get("family_name"),
        "username": token.get("preferred_username"),
        "roles": list(token.get("realm_access", {}).get("roles", [])),
        "tenant_id": token.get("tenant_id"),
    }

    try:
        with SessionLocal() as db:
            user_db = db.query(User).filter(User.keycloak_id == user["id"]).first()
            if user_db:
                if not user["tenant_id"]:
                    user["tenant_id"] = str(user_db.tenant_id) if user_db.tenant_id else None
                db_roles = db.query(UserRole.role).filter(UserRole.user_id == user_db.id).all()
                for (r,) in db_roles:
                    if r not in user["roles"]:
                        user["roles"].append(r)
    except Exception as exc:
        logger.warning("Failed to enrich user with DB info: %s", exc)

    return user


# Cartographie rôle → permissions
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
    """
    Dependency factory to check for specific permissions based on roles.
    Usage: Depends(require_permission("students:write"))
    """
    def decorator(current_user: dict = Depends(get_current_user)):
        user_roles = current_user.get("roles", [])
        user_permissions: set = set()

        for role in user_roles:
            perms = ROLE_PERMISSIONS.get(role, [])
            user_permissions.update(perms)

        if "*" in user_permissions:
            return current_user

        if permission in user_permissions:
            return current_user

        resource = permission.split(":")[0]
        if f"{resource}:*" in user_permissions:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission refusée: {permission}",
        )
    return decorator
