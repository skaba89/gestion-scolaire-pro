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
  Corps JSON ``{"status", "release_sha"}`` (même information que le
  ``/health/live`` public de l'API) pour vérifier la version déployée.
- tout autre chemin : 404 (aucune information exposée).
- requête bornée (1 Kio, 5 s, 8 connexions simultanées) ; toute requête
  invalide est fermée sans réponse ni trace.
"""
from __future__ import annotations

import asyncio
import json
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


_MAX_REQUEST_LINE = 1024
_MAX_CONCURRENT = 8


def _release_sha() -> str:
    return os.getenv("RELEASE_SHA", "unknown")


async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, slots: asyncio.Semaphore) -> None:
    if slots.locked():
        writer.close()  # trop de connexions simultanées : on ferme sans lire
        return
    async with slots:
        try:
            request_line = await asyncio.wait_for(reader.readline(), timeout=5)
            if len(request_line) > _MAX_REQUEST_LINE:
                raise ValueError("request line too long")
            parts = request_line.decode("latin-1").split()
            path = parts[1] if len(parts) >= 2 else ""
            if parts[:1] == ["GET"] and path.split("?", 1)[0] == "/health/live":
                live = is_live()
                status = "200 OK" if live else "503 Service Unavailable"
                body = json.dumps({"status": "alive" if live else "stale",
                                   "release_sha": _release_sha()}).encode("utf-8")
                ctype = "application/json"
            else:
                status, body, ctype = "404 Not Found", b"", "text/plain"
            writer.write(
                f"HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
                "Connection: close\r\n\r\n".encode("latin-1") + body
            )
            await writer.drain()
        except (asyncio.TimeoutError, ConnectionError, ValueError, asyncio.LimitOverrunError):
            # Requête lente, coupée, trop longue ou mal formée : fermeture sans trace.
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
    slots = asyncio.Semaphore(_MAX_CONCURRENT)  # créé dans la boucle du serveur
    server = await asyncio.start_server(lambda r, w: _handle(r, w, slots), host=host, port=port)
    logger.info("Worker HTTP health probe listening on %s:%s (/health/live)", host, port)
    return server
