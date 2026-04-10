"""Tenant quota enforcement middleware for SchoolFlow Pro."""
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Routes where quota should be checked (POST = resource creation)
QUOTA_ROUTES: dict[str, str] = {
    "/api/v1/students": "max_students",
    "/api/v1/teachers": "max_teachers",
    "/api/v1/staff": "max_staff",
}

DEFAULT_QUOTAS: dict[str, int] = {
    "max_students": 1000,
    "max_teachers": 100,
    "max_staff": 50,
    "max_storage_mb": 5120,
}


class QuotaMiddleware(BaseHTTPMiddleware):
    """
    Enforce per-tenant resource quotas on POST (creation) requests.

    Quota limits are read from ``tenant.settings.quotas`` JSON field.
    If the field is absent, the DEFAULT_QUOTAS are used.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Only enforce on resource-creation requests
        if request.method != "POST":
            return await call_next(request)

        quota_key: str | None = None
        for route_prefix, key in QUOTA_ROUTES.items():
            if request.url.path.startswith(route_prefix):
                quota_key = key
                break

        if not quota_key:
            return await call_next(request)

        tenant = getattr(request.state, "tenant", None)
        if not tenant:
            return await call_next(request)

        try:
            exceeded, current, limit = await self._check_quota(request, tenant, quota_key)
            if exceeded:
                request_id = getattr(request.state, "request_id", "-")
                tenant_id = str(getattr(tenant, "id", "-"))
                logger.warning(
                    "Quota exceeded",
                    extra={
                        "tenant_id": tenant_id,
                        "quota_key": quota_key,
                        "current": current,
                        "limit": limit,
                        "request_id": request_id,
                    },
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "QUOTA_EXCEEDED",
                        "message": (
                            f"Tenant quota exceeded for {quota_key}: "
                            f"{current}/{limit}"
                        ),
                        "quota_key": quota_key,
                        "current": current,
                        "limit": limit,
                    },
                )
        except Exception as exc:  # noqa: BLE001
            # Fail open: allow request if quota check fails
            logger.warning("Quota check failed (allowing request): %s", exc)

        return await call_next(request)

    # ------------------------------------------------------------------
    async def _check_quota(
        self, request: Request, tenant: object, quota_key: str
    ) -> tuple[bool, int, int]:
        """Return ``(is_exceeded, current_count, limit)``."""
        settings: dict = {}
        raw = getattr(tenant, "settings", None)
        if isinstance(raw, dict):
            settings = raw

        quotas: dict = settings.get("quotas", {})
        limit: int = int(quotas.get(quota_key, DEFAULT_QUOTAS.get(quota_key, 99_999)))

        db = getattr(request.state, "db", None)
        if db is None:
            return False, 0, limit

        current = await self._count_resources(db, tenant, quota_key)
        return current >= limit, current, limit

    @staticmethod
    async def _count_resources(db: object, tenant: object, quota_key: str) -> int:
        """Count existing tenant resources for the given quota key."""
        from sqlalchemy import select, func  # noqa: PLC0415

        tenant_id = getattr(tenant, "id", None)
        if tenant_id is None:
            return 0

        try:
            if quota_key == "max_students":
                from app.models.student import Student  # noqa: PLC0415

                result = await db.execute(  # type: ignore[union-attr]
                    select(func.count()).where(Student.tenant_id == tenant_id)
                )
                return int(result.scalar() or 0)

            if quota_key == "max_teachers":
                # No Teacher model exists yet; return 0
                return 0

        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not count resources for quota check: %s", exc)

        return 0
