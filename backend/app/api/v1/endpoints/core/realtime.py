from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.core.cache import redis_client
import json

router = APIRouter()

@router.websocket("/ws/{tenant_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str, user_id: str):
    await websocket.accept()
    pubsub = await redis_client.subscribe(f"tenant:{tenant_id}")
    
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True)
            if message:
                await websocket.send_text(message['data'])
    except WebSocketDisconnect:
        await pubsub.unsubscribe(f"tenant:{tenant_id}")
