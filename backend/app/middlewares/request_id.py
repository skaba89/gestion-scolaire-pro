"""Request ID middleware — attaches a UUID to every request/response."""
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Add a unique X-Request-ID to every request.

    - If the client sends an X-Request-ID header, that value is reused.
    - Otherwise a new UUID4 is generated.
    - The request_id is stored in request.state.request_id.
    - The same value is echoed back in the response header.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
