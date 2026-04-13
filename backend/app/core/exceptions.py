"""Standardized exception hierarchy for SchoolFlow Pro."""
from typing import Any, Optional
import logging

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.requests import Request

logger = logging.getLogger(__name__)


# ─── Base Exception ────────────────────────────────────────────────────────────

class SchoolFlowException(Exception):
    """Base exception for all SchoolFlow business logic errors."""

    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    message: str = "An unexpected error occurred"

    def __init__(
        self,
        message: Optional[str] = None,
        error_code: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        self.message = message or self.__class__.message
        self.error_code = error_code or self.__class__.error_code
        self.details = details
        super().__init__(self.message)

    def to_dict(self) -> dict:
        payload: dict = {
            "error": self.error_code,
            "message": self.message,
            "detail": self.message,  # Added for frontend compatibility
        }
        if self.details is not None:
            payload["details"] = self.details
        return payload


# ─── Typed Subclasses ──────────────────────────────────────────────────────────

class NotFoundError(SchoolFlowException):
    status_code = 404
    error_code = "NOT_FOUND"
    message = "Resource not found"


class ForbiddenError(SchoolFlowException):
    status_code = 403
    error_code = "FORBIDDEN"
    message = "You do not have permission to perform this action"


class UnauthorizedError(SchoolFlowException):
    status_code = 401
    error_code = "UNAUTHORIZED"
    message = "Authentication required"


class ValidationError(SchoolFlowException):
    status_code = 422
    error_code = "VALIDATION_ERROR"
    message = "Invalid input data"


class ConflictError(SchoolFlowException):
    status_code = 409
    error_code = "CONFLICT"
    message = "Resource already exists or conflicts with existing data"


class QuotaExceededError(SchoolFlowException):
    status_code = 429
    error_code = "QUOTA_EXCEEDED"
    message = "Tenant quota limit exceeded"


class ServiceUnavailableError(SchoolFlowException):
    status_code = 503
    error_code = "SERVICE_UNAVAILABLE"
    message = "Service temporarily unavailable"


# ─── FastAPI Exception Handlers ───────────────────────────────────────────────

def _cors_headers(request: Request) -> dict:
    """Return CORS headers so the browser can read error responses.

    SECURITY: Only echo back the request Origin if it matches an allowed
    origin. Never use wildcard '*' which bypasses all CORS restrictions.
    """
    origin = request.headers.get("origin", "")
    allowed_origins = getattr(request.app.state, "_cors_allowed_origins", [])

    if origin and origin in allowed_origins:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    # No matching origin — return empty dict (no CORS headers on errors from
    # untrusted origins). The CORSMiddleware already handles normal requests.
    return {}


async def schoolflow_exception_handler(
    request: Request, exc: SchoolFlowException
) -> JSONResponse:
    """Handle all SchoolFlowException subclasses with a unified JSON format."""
    request_id = getattr(request.state, "request_id", "-")
    logger.warning(
        exc.message,
        extra={
            "error_code": exc.error_code,
            "status_code": exc.status_code,
            "request_id": request_id,
            "path": str(request.url.path),
        },
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={**exc.to_dict(), "request_id": request_id},
        headers=_cors_headers(request),
    )


async def http_exception_handler(
    request: Request, exc: HTTPException
) -> JSONResponse:
    """Handle FastAPI/Starlette HTTPException with a unified JSON format."""
    request_id = getattr(request.state, "request_id", "-")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTP_ERROR",
            "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "detail": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "request_id": request_id,
        },
        headers=_cors_headers(request),
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Catch-all handler for unexpected exceptions."""
    request_id = getattr(request.state, "request_id", "-")
    logger.error(
        "Unhandled exception: %s",
        type(exc).__name__,
        exc_info=exc,
        extra={"request_id": request_id, "path": str(request.url.path)},
    )
    # Include error type and message in response for easier debugging.
    # In production, this helps identify issues without server log access.
    error_msg = f"{type(exc).__name__}: {str(exc)}"
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "detail": error_msg,
            "request_id": request_id,
        },
        headers=_cors_headers(request),
    )
