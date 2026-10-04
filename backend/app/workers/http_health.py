"""Sonde HTTP minimale du worker ARQ — uniquement pour les hébergeurs qui l'exigent.

Le worker n'est pas un serveur HTTP : sa santé réelle est le heartbeat Redis
(``app/workers/heartbeat.py``, lu par l'API sur ``/health/deep``). Mais Azure
App Service (conteneur Linux) considère un conteneur qui ne répond à aucune
requête HTTP comme « non démarré » et le redémarre en boucle.

Activée SEULEMENT si ``WORKER_HEALTH_PORT`` est défini (App Service : même
valeur que ``WEBSITES_PORT``). Ailleurs (Container Apps sans ingress, Docker
Compose), rien n'est ouvert. Aucune dépendance : ``asyncio.start_server``.

- ``GET /health/live`` : 200 tant que le dernier heartbeat a réussi il y a
  moins de 3 intervalles (ou pendant la période de grâce au démarrage), sinon
  503 — un worker qui ne peut plus écrire dans Redis ne traite plus de job.
- tout autre chemin : 404 (aucune information exposée).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from app.workers.heartbeat import HEARTBEAT_INTERVAL_SECONDS

logger = logging.getLogger(__name__)

_LIVENESS_WINDOW_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3
_started_at = time.monotonic()
_last_heartbeat_ok: Optional[float] = None


def mark_heartbeat_ok() -> None:
    """Appelé après chaque écriture de heartbeat réussie."""
    global _last_heartbeat_ok
    _last_heartbeat_ok = time.monotonic()


def is_live(now: Optional[float] = None) -> bool:
    now = time.monotonic() if now is None else now
    if _last_heartbeat_ok is None:
        return now - _started_at < _LIVENESS_WINDOW_SECONDS  # grâce au démarrage
    return now - _last_heartbeat_ok < _LIVENESS_WINDOW_SECONDS


async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        request_line = await asyncio.wait_for(reader.readline(), timeout=5)
        parts = request_line.decode("latin-1").split()
        path = parts[1] if len(parts) >= 2 else ""
        if parts[:1] == ["GET"] and path.split("?", 1)[0] == "/health/live":
            status, body = ("200 OK", b"ok") if is_live() else ("503 Service Unavailable", b"stale")
        else:
            status, body = "404 Not Found", b""
        writer.write(
            f"HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n".encode("latin-1") + body
        )
        await writer.drain()
    except (asyncio.TimeoutError, ConnectionError):
        pass
    finally:
        writer.close()


def configured_port() -> Optional[int]:
    raw = os.getenv("WORKER_HEALTH_PORT", "").strip()
    if not raw:
        return None
    port = int(raw)  # une valeur invalide doit faire échouer le démarrage, pas être ignorée
    if not 0 < port < 65536:
        raise ValueError(f"WORKER_HEALTH_PORT hors plage : {port}")
    return port


async def start_http_health_server(port: int, host: str = "0.0.0.0") -> asyncio.base_events.Server:
    server = await asyncio.start_server(_handle, host=host, port=port)
    logger.info("Worker HTTP health probe listening on %s:%s (/health/live)", host, port)
    return server
