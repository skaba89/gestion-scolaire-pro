import logging
import jwt

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.database import tenant_context

logger = logging.getLogger(__name__)


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip tenant check for public endpoints, health checks, CORS preflight, or auth endpoints
        path = request.url.path

        # Strip API prefix for easier matching
        check_path = path
        if path.startswith(settings.API_V1_STR):
            check_path = path[len(settings.API_V1_STR):]

        public_paths = [
            "/docs", "/openapi.json", "/health", "/health/", "/", "/auth/login",
            "/auth/refresh", "/auth/logout", "/users/me", "/users/me/",
            "/favicon.ico", "/favicon.png", "/redoc"
        ]

        # Public prefixes that never require tenant identification
        public_prefixes = [
            "/health",
            "/auth/",
            "/tenants/slug/",
            "/tenants/public/",
            "/tenants/by-domain/",
        ]

        is_public = (
            request.method == "OPTIONS"
            or check_path in public_paths
            or check_path.rstrip("/") in public_paths
            or any(check_path.startswith(p) for p in public_prefixes)
        )

        if (is_public or
            (request.method == "POST" and (check_path == "/tenants" or check_path == "/tenants/")) or
            (request.method == "POST" and check_path.startswith("/tenants/create-with-admin")) or
            (request.method == "GET" and check_path.startswith("/tenants/super-admin")) or
            any(check_path.endswith(ext) for ext in [".ico", ".png", ".jpg", ".jpeg", ".svg", ".css", ".js"])):
            return await call_next(request)

        # Try to get tenant from X-Tenant-ID header
        tenant_id = request.headers.get("X-Tenant-ID")

        # Try to get tenant from JWT claim (Auth context authority)
        # SECURITY: Always verify the JWT signature to prevent token forgery
        auth_header = request.headers.get("Authorization")
        user_roles = []

        if not tenant_id and auth_header and auth_header.startswith("Bearer "):
            try:
                token = auth_header.split(" ")[1]
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=[settings.ALGORITHM],
                )
                if payload.get("tenant_id"):
                    tenant_id = payload.get("tenant_id")
                user_roles = payload.get("roles", []) or []
            except jwt.ExpiredSignatureError:
                # Token expired — allow downstream to handle 401
                pass
            except jwt.InvalidTokenError as exc:
                logger.warning("Tenant middleware: invalid JWT skipped: %s", exc)
                pass

        # SUPER_ADMIN bypass: no tenant required for platform-level operations
        # The endpoint will use X-Tenant-ID header if provided for cross-tenant access
        if "SUPER_ADMIN" in user_roles and not tenant_id:
            return await call_next(request)

        if not tenant_id:
            # Final attempt: Check if we can proceed without it (e.g. user is logged in and we can get it later)
            if auth_header and auth_header.startswith("Bearer "):
                # Allow proceeding, the endpoint will handle missing tenant_id via current_user
                return await call_next(request)

            # Include CORS headers so the browser can read the error response.
            # BaseHTTPMiddleware returning directly may bypass CORSMiddleware.
            origin = request.headers.get("origin", "")
            allowed_origins = getattr(request.app.state, "_cors_allowed_origins", [])
            cors_hdrs = {}
            if origin:
                if "*" in allowed_origins or origin in allowed_origins:
                    cors_hdrs = {
                        "Access-Control-Allow-Origin": origin,
                        "Vary": "Origin",
                    }

            return JSONResponse(
                status_code=400,
                content={"detail": "Identification du tenant manquante (X-Tenant-ID ou JWT claim)"},
                headers=cors_hdrs,
            )

        request.state.tenant_id = tenant_id

        # Set the context for Row Level Security (RLS)
        token = tenant_context.set(tenant_id)
        try:
            response = await call_next(request)
            return response
        finally:
            tenant_context.reset(token)
