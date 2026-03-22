import redis.asyncio as redis
from app.core.config import settings

class RedisClient:
    def __init__(self):
        self.redis_url = settings.REDIS_URL
        self._client = None

    @property
    async def client(self):
        if self._client is None:
            self._client = redis.from_url(self.redis_url, encoding="utf-8", decode_responses=True)
        return self._client

    async def get(self, key: str):
        client = await self.client
        return await client.get(key)

    async def set(self, key: str, value: str, expire: int = None):
        client = await self.client
        return await client.set(key, value, ex=expire)

    async def publish(self, channel: str, message: str):
        client = await self.client
        return await client.publish(channel, message)

    async def subscribe(self, channel: str):
        client = await self.client
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

redis_client = RedisClient()
