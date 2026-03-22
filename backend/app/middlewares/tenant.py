from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings
from app.core.database import tenant_context

class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip tenant check for public endpoints, health checks, CORS preflight, or auth endpoints
        path = request.url.path
        
        # Strip API prefix for easier matching
        check_path = path
        if path.startswith(settings.API_V1_STR):
            check_path = path[len(settings.API_V1_STR):]
            
        public_paths = ["/docs", "/openapi.json", "/health", "/health/", "/", "/auth/login", "/auth/refresh", "/auth/logout", "/users/me", "/favicon.ico", "/favicon.png", "/webhooks/keycloak", "/redoc"]

        if (request.method == "OPTIONS" or
            check_path in public_paths or
            check_path.startswith("/health") or
            check_path.startswith("/auth/") or
            check_path.startswith("/tenants/slug/") or
            check_path.startswith("/tenants/public/") or
            (request.method == "POST" and (check_path == "/tenants" or check_path == "/tenants/")) or
            any(check_path.endswith(ext) for ext in [".ico", ".png", ".jpg", ".jpeg", ".svg", ".css", ".js"])):
            return await call_next(request)

        # Try to get tenant from X-Tenant-ID header
        tenant_id = request.headers.get("X-Tenant-ID")
        
        # Try to get tenant from JWT claim (Auth context authority)
        auth_header = request.headers.get("Authorization")
        if not tenant_id and auth_header and auth_header.startswith("Bearer "):
            try:
                from jose import jwt
                token = auth_header.split(" ")[1]
                payload = jwt.get_unverified_claims(token)
                if payload.get("tenant_id"):
                    tenant_id = payload.get("tenant_id")
            except Exception:
                pass

        if not tenant_id:
            # Final attempt: Check if we can proceed without it (e.g. user is logged in and we can get it later)
            if auth_header and auth_header.startswith("Bearer "):
                # Allow proceeding, the endpoint will handle missing tenant_id via current_user
                return await call_next(request)

            return JSONResponse(
                status_code=400,
                content={"detail": "Identification du tenant manquante (X-Tenant-ID ou JWT claim)"}
            )

        request.state.tenant_id = tenant_id
        
        # Set the context for Row Level Security (RLS)
        token = tenant_context.set(tenant_id)
        try:
            response = await call_next(request)
            return response
        finally:
            tenant_context.reset(token)
