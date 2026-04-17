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
            "/tenants/settings",       # endpoint handles its own auth + tenant resolution
            "/tenants/security-settings",
            "/tenants/onboarding",     # onboarding endpoints handle their own auth
            "/storage/",               # file upload/download handles its own auth
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

        # SECURITY: Always prefer JWT claim over the X-Tenant-ID header for tenant resolution.
        # The header is user-controlled and can be spoofed to set RLS context to another tenant.
        # Only use header as fallback for SUPER_ADMIN cross-tenant access.
        tenant_id = None
        auth_header = request.headers.get("Authorization")
        user_roles = []

        if auth_header and auth_header.startswith("Bearer "):
            try:
                token = auth_header.split(" ")[1]
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=[settings.ALGORITHM],
                    options={"verify_exp": False},  # Don't reject expired tokens here — let downstream auth handle 401
                    audience="schoolflow-api",
                    issuer="schoolflow-pro",
                )
                tenant_id = payload.get("tenant_id")
                user_roles = payload.get("roles", []) or []
            except jwt.InvalidTokenError as exc:
                # JWT decode failed (invalid signature, wrong key, etc.)
                # Pass through so downstream verify_token can return proper 401
                logger.warning("Tenant middleware: JWT decode failed, passing through: %s", exc)
                return await call_next(request)

        # SUPER_ADMIN cross-tenant: only trust X-Tenant-ID header for super admins
        if "SUPER_ADMIN" in user_roles and not tenant_id:
            header_tenant = request.headers.get("X-Tenant-ID")
            if header_tenant:
                tenant_id = header_tenant

        # SUPER_ADMIN bypass: no tenant required for platform-level operations
        # The endpoint will use X-Tenant-ID header if provided for cross-tenant access
        if "SUPER_ADMIN" in user_roles and not tenant_id:
            return await call_next(request)

        if not tenant_id:
            # SECURITY: Reject authenticated requests without tenant_id
            if auth_header and auth_header.startswith("Bearer "):
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
                    content={"detail": "Identifiant du tenant manquant dans le jeton JWT. Contactez un administrateur."},
                    headers=cors_hdrs,
                )

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
