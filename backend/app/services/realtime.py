"""WebSocket manager for real-time communication"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import redis.asyncio as redis
from app.core.config import settings


class ConnectionManager:
    """Manage WebSocket connections and broadcasting"""
    
    def __init__(self):
        # Store connections by tenant_id
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Redis client for PubSub
        self.redis_client: redis.Redis = None
    
    async def init_redis(self):
        """Initialize Redis connection"""
        if not self.redis_client:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
    
    async def connect(self, websocket: WebSocket, tenant_id: str, user_id: str):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        
        # Add to tenant's connections
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)
        
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "tenant_id": tenant_id,
            "user_id": user_id,
            "message": "Connected to SchoolFlow Realtime"
        })
    
    def disconnect(self, websocket: WebSocket, tenant_id: str):
        """Remove a WebSocket connection"""
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)
            
            # Clean up empty tenant groups
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific connection"""
        await websocket.send_json(message)
    
    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        """Broadcast a message to all connections in a tenant"""
        if tenant_id in self.active_connections:
            disconnected = set()
            
            for connection in self.active_connections[tenant_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    # Mark for removal if send fails
                    disconnected.add(connection)
            
            # Remove disconnected connections
            for connection in disconnected:
                self.active_connections[tenant_id].discard(connection)
    
    async def publish_event(self, tenant_id: str, event_type: str, data: dict):
        """
        Publish an event to Redis PubSub
        This allows multiple backend instances to share events
        """
        await self.init_redis()
        
        event = {
            "type": event_type,
            "tenant_id": tenant_id,
            "data": data
        }
        
        channel = f"schoolflow:{tenant_id}"
        await self.redis_client.publish(channel, json.dumps(event))
    
    async def subscribe_to_events(self, tenant_id: str):
        """
        Subscribe to Redis PubSub for a tenant
        This is called when the first connection for a tenant is established
        """
        await self.init_redis()
        
        channel = f"schoolflow:{tenant_id}"
        pubsub = self.redis_client.pubsub()
        await pubsub.subscribe(channel)
        
        # Listen for messages in background
        async for message in pubsub.listen():
            if message["type"] == "message":
                event = json.loads(message["data"])
                await self.broadcast_to_tenant(tenant_id, event)


# Singleton instance
manager = ConnectionManager()
