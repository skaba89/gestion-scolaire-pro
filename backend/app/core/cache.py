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
            # SECURITY: SSL/TLS is determined exclusively by the URL scheme.
            #   rediss:// → TLS enabled  (managed Redis on Render/Railway/Upstash)
            #   redis://  → no TLS       (Docker internal network, localhost)
            #
            # We intentionally avoid hostname-based auto-detection: service names
            # like "redis" (Docker Compose) are not localhost but also not external,
            # and auto-forcing TLS for them causes "SSL WRONG_VERSION_NUMBER" errors.
            # Cloud providers always supply rediss:// URLs when TLS is required.
            redis_url = self.redis_url
            ssl_required = redis_url.startswith("rediss://")

            # IMPORTANT: do NOT pass ssl=False for plain redis:// URLs.
            # redis.asyncio.from_url infers the connection class from the scheme;
            # passing ssl=False (or ssl_cert_reqs) to a non-SSL connection raises
            # TypeError: unexpected keyword argument 'ssl'.
            client_kwargs: dict = {
                "encoding": "utf-8",
                "decode_responses": True,
            }
            if ssl_required:
                client_kwargs["ssl"] = True
                client_kwargs["ssl_cert_reqs"] = "required"

            self._client = redis.from_url(redis_url, **client_kwargs)
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
