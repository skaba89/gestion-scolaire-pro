"""Worker heartbeat — Azure probes pass (docs/AZURE_OBSERVABILITY.md).

The ARQ worker has no HTTP server (see WorkerSettings in tasks.py — it is
`python -m arq app.workers.tasks.WorkerSettings`, nothing else listens on
any port), and this PR deliberately does not bolt one on just to satisfy a
health probe (a FastAPI instance whose only route is "/health" would be
pure overhead running code nobody else calls). Azure Container Apps also
has no `exec`-style probe (only httpGet/tcpSocket), so there is no way to
wire ARQ's own `--check` CLI flag into a Container App probe field either.

Instead: each worker replica writes a small, TTL'd JSON heartbeat to Redis
(already a hard dependency of this app) on a fixed interval. The API's own
`GET /health/deep` (already Redis-connected, already operator-only) reads
it back — reusing infrastructure that exists on both sides instead of
inventing a new communication channel. This mirrors ARQ's own built-in
`record_health()` (see WORKER_HEALTH_CHECK_INTERVAL_SECONDS below, which
tunes ARQ's own separate health-check key for queue stats) but adds the
two fields ARQ's own mechanism does not carry: worker identity and release
SHA — both explicitly required by the observability spec this implements.

Per-replica keys (never one shared key): a single global key would let one
live worker's heartbeat mask a second, crashed worker's death the moment
this repo scales beyond one replica (see docstring on WORKER_ID below) —
so every worker writes under its own identity, and a lightweight index set
(no TTL, pruned on graceful shutdown) is how the reader enumerates "which
worker ids have ever announced themselves" without needing to already
know replica names in advance or SCAN Redis on every request.
"""
from __future__ import annotations

import json
import os
import socket
import time
from typing import Optional

from app.core.cache import redis_client
from app.core.config import settings

# Written every HEARTBEAT_INTERVAL_SECONDS; expires after HEARTBEAT_TTL_SECONDS
# (3x the interval — tolerates two missed writes, e.g. a slow job blocking
# the event loop briefly, before being reported MISSING instead of RUNNING).
HEARTBEAT_INTERVAL_SECONDS = 30
HEARTBEAT_TTL_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3

# STALE band: the heartbeat key is still present (not yet TTL-expired) but
# its own embedded timestamp is older than one interval — the worker is
# either about to be reported MISSING or briefly behind (a slow job
# blocking the event loop). Distinct from MISSING (key gone entirely).
_STALE_AFTER_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 1.5

_HEARTBEAT_KEY_PREFIX = "worker:heartbeat:"
_HEARTBEAT_INDEX_KEY = "worker:heartbeat:index"


def worker_id() -> str:
    """Stable identity for this replica.

    CONTAINER_APP_REPLICA_NAME is a reserved env var Azure Container Apps
    injects into every replica automatically — unique per running
    instance, which is exactly what per-replica keys need. Falls back to
    the container hostname (always unique per container, including local
    docker-compose) when not running in Container Apps.
    """
    return os.environ.get("CONTAINER_APP_REPLICA_NAME") or socket.gethostname()


async def write_heartbeat() -> None:
    """Called on a fixed interval from the worker process — see
    WorkerSettings.on_startup/on_shutdown in tasks.py for the loop."""
    client = await redis_client.client
    key = f"{_HEARTBEAT_KEY_PREFIX}{worker_id()}"
    payload = json.dumps({
        "worker_id": worker_id(),
        "timestamp": time.time(),
        "release_sha": settings.RELEASE_SHA,
    })
    # SADD has no expiry of its own — pruned explicitly on graceful
    # shutdown (clear_heartbeat), and tolerated as a harmless stale entry
    # (reads as MISSING once its heartbeat key expires) after a crash.
    await client.sadd(_HEARTBEAT_INDEX_KEY, worker_id())
    await client.setex(key, HEARTBEAT_TTL_SECONDS, payload)


async def clear_heartbeat() -> None:
    """Called on graceful shutdown — removes this replica from the index
    immediately rather than waiting for an operator to notice a MISSING
    entry that was actually just a clean scale-down/redeploy."""
    client = await redis_client.client
    await client.srem(_HEARTBEAT_INDEX_KEY, worker_id())
    await client.delete(f"{_HEARTBEAT_KEY_PREFIX}{worker_id()}")


async def read_all_heartbeats() -> list[dict]:
    """Operator-facing read (GET /health/deep only — never the hot
    /health/ready path, per the "avoid an expensive check on every probe"
    rule: this is one SMEMBERS plus a handful of GETs, bounded by the
    number of worker replicas, not a Redis-wide SCAN).

    Returns one entry per worker id ever seen, each classified RUNNING
    (heartbeat fresh), STALE (heartbeat present but aging), or MISSING
    (heartbeat key expired — crashed, or never wrote one)."""
    client = await redis_client.client
    ids = await client.smembers(_HEARTBEAT_INDEX_KEY)
    now = time.time()
    results = []
    for wid in sorted(ids):
        raw = await client.get(f"{_HEARTBEAT_KEY_PREFIX}{wid}")
        if raw is None:
            results.append({"worker_id": wid, "status": "missing"})
            continue
        try:
            data = json.loads(raw)
            age = now - float(data.get("timestamp", 0))
            status = "running" if age <= _STALE_AFTER_SECONDS else "stale"
            results.append({
                "worker_id": wid,
                "status": status,
                "age_seconds": round(age, 1),
                "release_sha": data.get("release_sha"),
            })
        except (ValueError, TypeError, json.JSONDecodeError):
            results.append({"worker_id": wid, "status": "unknown"})
    return results
