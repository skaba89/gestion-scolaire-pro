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

        # "Public" here means: this middleware skips JWT-based tenant_id
        # extraction / RLS context setup for the path. It does NOT mean the
        # endpoint itself is unauthenticated — every route below (except the
        # genuinely public ones, commented individually) enforces its own
        # Depends(get_current_user)/Depends(require_permission(...)) and
        # resolves its tenant via resolve_current_tenant_id() instead of RLS
        # context. Kept as an explicit exact-path list (rather than broad
        # prefixes) so a *future* endpoint added under e.g. "/tenants/..."
        # doesn't silently inherit an exemption meant for a specific route.
        public_paths = [
            "/docs", "/openapi.json", "/health", "/health/", "/", "/auth/login",
            "/tenants/public", "/tenants/public/",
            "/auth/refresh", "/auth/logout", "/users/me", "/users/me/",
            "/favicon.ico", "/favicon.png", "/redoc",
            # Prometheus scrape — the endpoint enforces its own METRICS_SECRET
            # in production (see app/main.py), no JWT/tenant context involved.
            "/metrics", "/metrics/",

            # --- Authenticated, but resolve their own tenant (not via RLS
            # context from this middleware) — see resolve_current_tenant_id()
            # in tenants.py. Exact paths, not prefixes: a new route under
            # /tenants/ must opt in explicitly, not inherit this by accident.
            "/tenants/settings", "/tenants/settings/",                     # GET/PATCH — Depends(get_current_user)
            "/tenants/security-settings", "/tenants/security-settings/",   # GET/PATCH — Depends(get_current_user)
            "/tenants/onboarding/levels", "/tenants/onboarding/levels/",
            "/tenants/onboarding/subjects", "/tenants/onboarding/subjects/",
            "/tenants/onboarding/complete", "/tenants/onboarding/complete/",

            # --- File storage — each route requires Depends(get_current_user)
            # individually (see storage.py). Upload has a fixed path; the
            # presigned-url GET needs a prefix below because object_name is a
            # ":path" converter (can contain slashes).
            "/storage/upload", "/storage/upload/",

            # --- Genuinely public, single fixed path, no dynamic segment.
            "/webhooks/events", "/webhooks/events/",
        ]

        # Public prefixes — kept ONLY where the route has a dynamic path
        # segment ({slug}, {domain}, {object_name:path}, ...) and therefore
        # cannot be listed as an exact path above.
        public_prefixes = [
            "/health",
            "/auth/",
            "/tenants/slug/",            # /tenants/slug/{slug}/ — public tenant lookup
            "/tenants/public/",
            "/tenants/by-domain/",       # /tenants/by-domain/{domain}/
            "/storage/presigned-url/",   # /storage/presigned-url/{object_name:path}/ — auth enforced in-route
            # Public enrollment portal — genuinely unauthenticated by design
            # (candidates have no account yet). 5 fixed sub-routes + one with
            # a {slug} segment (tenant-info); kept as a prefix rather than
            # listing all 6 to avoid missing a future addition to this
            # deliberately-public portal (unlike the tenant-scoped routes
            # above, accidentally exempting a new /admissions/public/* route
            # doesn't leak cross-tenant data — it's public by design).
            "/admissions/public/",
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

            # A protected route without a bearer token is an authentication
            # failure. Return 401 here instead of leaking tenant-resolution details
            # or allowing a potentially unguarded endpoint to execute.
            cors_hdrs["WWW-Authenticate"] = "Bearer"
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentification requise"},
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
