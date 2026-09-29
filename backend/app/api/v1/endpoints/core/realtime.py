import logging
import jwt
from fastapi import HTTPException

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.cache import redis_client
from app.core.config import settings
from app.core.security import _evaluate_revocation

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/{tenant_id}/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    tenant_id: str,
    user_id: str,
    token: str = Query(None),
):
    """Authenticated WebSocket endpoint.

    SECURITY: Requires a valid JWT token as a query parameter.
    The token must belong to the user_id in the URL path AND match the tenant_id.
    """
    # 1. Verify JWT token before accepting the connection
    if not token:
        await websocket.close(code=4001, reason="Authentication required: token query param missing")
        return

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience="schoolflow-api",
            issuer="schoolflow-pro",
        )
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4001, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # SECURITY (national-readiness audit, 2026-09, P1-5 follow-up): a
    # mfa_pending token (see app/core/security.py verify_token()) proves
    # only a correct password, not a completed second factor — it must
    # never authenticate anything beyond POST /mfa/login/verify/.
    if payload.get("mfa_pending"):
        await websocket.close(code=4003, reason="MFA verification required")
        return

    # 2. Verify the token belongs to the claimed user and tenant
    token_sub = payload.get("sub")
    token_tenant = payload.get("tenant_id")

    if token_sub != user_id:
        logger.warning("WebSocket auth failed: token sub=%s != path user_id=%s", token_sub, user_id)
        await websocket.close(code=4003, reason="Token does not match user")
        return

    # SECURITY (institutional-readiness audit, 2026-09, 8th sweep): this
    # endpoint used to trust the JWT's own "roles" claim and skip every
    # revocation check get_current_user() enforces on every REST route
    # (blacklist, logout-all token-version, is_active, and re-reading
    # roles from the DB rather than the token — see the matching comments
    # in core/security.py::get_current_user for why each of those exists).
    # A still-unexpired token from a deactivated account, a logged-out
    # session, or a role since revoked in the DB kept authenticating here
    # with none of those checks applied.
    try:
        await _evaluate_revocation(token_sub, payload.get("jti"), payload.get("tv", 0))
    except HTTPException:
        await websocket.close(code=4001, reason="Token has been revoked")
        return

    from app.core.database import SessionLocal, resolve_authenticated_user_row
    from app.models.user_role import UserRole

    # SECURITY (restricted-DB-role auth fix, docs/POSTGRES_APP_ROLE.md):
    # TenantMiddleware (BaseHTTPMiddleware) never runs for a WebSocket
    # connection, so nothing positions app.current_tenant_id here the way
    # it does for an HTTP request — this session's RLS context must be set
    # explicitly. Previously this ran with whatever context happened to be
    # left on the pooled connection from a prior request/connection (never
    # reset at all), which under a role that actually enforces RLS
    # (NOSUPERUSER NOBYPASSRLS) could make this lookup fail unpredictably
    # depending on pool state. resolve_authenticated_user_row() positions
    # it explicitly from token_tenant (this token's own tenant_id claim,
    # signed and set at login from the DB - never client-suppliable) and
    # falls back to "no tenant" only for a genuinely platform-level account
    # (e.g. SUPER_ADMIN, tenant_id IS NULL) - see its docstring.
    with SessionLocal() as db:
        user_db = resolve_authenticated_user_row(db, token_sub, token_tenant)
        if not user_db or not user_db.is_active:
            await websocket.close(code=4001, reason="Account inactive")
            return
        db_roles = [role for (role,) in db.query(UserRole.role).filter(UserRole.user_id == user_db.id).all()]

    # For SUPER_ADMIN, allow cross-tenant access via X-Tenant-ID logic.
    # db_roles (not the token's roles claim) so a revoked SUPER_ADMIN role
    # loses cross-tenant access on the very next connection attempt.
    if token_tenant != tenant_id and "SUPER_ADMIN" not in db_roles:
        logger.warning("WebSocket auth failed: token tenant=%s != path tenant_id=%s", token_tenant, tenant_id)
        await websocket.close(code=4003, reason="Token does not match tenant")
        return

    # 3. Accept the connection — authentication passed
    await websocket.accept()
    pubsub = await redis_client.subscribe(f"tenant:{tenant_id}")

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True)
            if message:
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user=%s tenant=%s", user_id, tenant_id)
    finally:
        try:
            await pubsub.unsubscribe(f"tenant:{tenant_id}")
        except Exception:
            pass
