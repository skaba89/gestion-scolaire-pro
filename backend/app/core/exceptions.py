"""Standardized exception hierarchy for SchoolFlow Pro."""
from typing import Any, Optional
import logging

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.requests import Request

logger = logging.getLogger(__name__)


# ─── Error Code Constants ─────────────────────────────────────────────────────

class ErrorCode:
    """Canonical error codes returned in API responses.

    Use these instead of hard-coding strings so that both backend handlers and
    frontend consumers can reference a single source of truth.
    """

    NOT_FOUND = "RESOURCE_NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    TENANT_REQUIRED = "TENANT_REQUIRED"
    DUPLICATE_ENTRY = "DUPLICATE_ENTRY"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


# ─── Structured Error Response Helper ─────────────────────────────────────────

def api_error(
    status_code: int,
    message: str,
    error_code: Optional[str] = None,
    details: Optional[dict] = None,
) -> HTTPException:
    """Create a consistent API error response.

    Returns a FastAPI ``HTTPException`` whose ``detail`` field is a structured
    dict so that the global ``http_exception_handler`` can forward it as-is.

    Usage::

        raise api_error(404, "Student not found", ErrorCode.NOT_FOUND)
        raise api_error(
            422,
            "Email already registered",
            ErrorCode.DUPLICATE_ENTRY,
            details={"field": "email"},
        )
    """
    content: dict[str, Any] = {"message": message}
    if error_code:
        content["error_code"] = error_code
    if details:
        content["details"] = details
    return HTTPException(status_code=status_code, detail=content)


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
    origin or if the allowed list contains the wildcard '*'.
    """
    origin = request.headers.get("origin", "")
    if not origin:
        return {}

    allowed_origins = getattr(request.app.state, "_cors_allowed_origins", [])

    # Wildcard: allow any origin (but browsers reject credentials with '*')
    if "*" in allowed_origins:
        return {
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
        }

    if origin in allowed_origins:
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
    """Handle FastAPI/Starlette HTTPException with a unified JSON format.

    If ``exc.detail`` is already a structured dict (e.g. produced by
    :func:`api_error`), it is merged into the response so that ``error_code``
    and ``details`` propagate to the client.
    """
    request_id = getattr(request.state, "request_id", "-")

    if isinstance(exc.detail, dict):
        # Structured detail produced by api_error() or similar
        message = exc.detail.get("message", str(exc.detail))
        error = exc.detail.get("error_code", "HTTP_ERROR")
        content: dict[str, Any] = {
            "error": error,
            "message": message,
            "detail": message,
            "request_id": request_id,
        }
        if "details" in exc.detail:
            content["details"] = exc.detail["details"]
    else:
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        content = {
            "error": "HTTP_ERROR",
            "message": message,
            "detail": message,
            "request_id": request_id,
        }

    return JSONResponse(
        status_code=exc.status_code,
        content=content,
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
    # SECURITY: In production, hide internal error details to prevent information leakage.
    # Only show the exception type and message when DEBUG is enabled.
    from app.core.config import settings
    if settings.DEBUG:
        error_msg = f"{type(exc).__name__}: {str(exc)}"
    else:
        # Include exception type (but NOT message) for easier debugging in production
        error_msg = f"{type(exc).__name__}. Contact support with request ID {request_id}."
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
