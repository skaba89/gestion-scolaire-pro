import redis.asyncio as redis
from app.core.config import settings

# Prefix for all SchoolFlow Redis keys to avoid collisions
REDIS_KEY_PREFIX = "sfp:"

class RedisClient:
    def __init__(self):
        self.redis_url = settings.REDIS_URL
        self._client = None

    @property
    async def client(self):
        if self._client is None:
            # SECURITY: Enable SSL/TLS for Redis connections in production.
            # Detect production by checking if the URL uses rediss:// (TLS) or if
            # the connection is not to localhost (external Redis provider).
            ssl_required = False
            redis_url = self.redis_url
            if redis_url.startswith("rediss://"):
                ssl_required = True
            elif not redis_url.startswith("redis://localhost") and not redis_url.startswith("redis://127.0.0.1"):
                # External Redis — force TLS
                ssl_required = True
                if not redis_url.startswith("rediss://"):
                    redis_url = redis_url.replace("redis://", "rediss://", 1)

            self._client = redis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                ssl=ssl_required,
                ssl_cert_reqs="required" if ssl_required else "none",
            )
        return self._client

    async def get(self, key: str):
        client = await self.client
        return await client.get(f"{REDIS_KEY_PREFIX}{key}")

    async def set(self, key: str, value: str, expire: int = None):
        client = await self.client
        return await client.set(f"{REDIS_KEY_PREFIX}{key}", value, ex=expire)

    async def delete(self, key: str):
        """Delete a specific key."""
        client = await self.client
        return await client.delete(f"{REDIS_KEY_PREFIX}{key}")

    async def exists(self, key: str) -> bool:
        """Check if a key exists."""
        client = await self.client
        return bool(await client.exists(f"{REDIS_KEY_PREFIX}{key}"))

    async def keys(self, pattern: str) -> list:
        """Return keys matching a pattern (use sparingly)."""
        client = await self.client
        return await client.keys(f"{REDIS_KEY_PREFIX}{pattern}")

    async def publish(self, channel: str, message: str):
        client = await self.client
        return await client.publish(channel, message)

    async def subscribe(self, channel: str):
        client = await self.client
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

redis_client = RedisClient()
