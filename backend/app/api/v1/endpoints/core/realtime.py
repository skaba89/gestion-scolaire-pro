import logging
import jwt

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.cache import redis_client
from app.core.config import settings

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

    # 2. Verify the token belongs to the claimed user and tenant
    token_sub = payload.get("sub")
    token_tenant = payload.get("tenant_id")
    token_roles = payload.get("roles", [])

    if token_sub != user_id:
        logger.warning("WebSocket auth failed: token sub=%s != path user_id=%s", token_sub, user_id)
        await websocket.close(code=4003, reason="Token does not match user")
        return

    # For SUPER_ADMIN, allow cross-tenant access via X-Tenant-ID logic
    if token_tenant != tenant_id and "SUPER_ADMIN" not in token_roles:
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
