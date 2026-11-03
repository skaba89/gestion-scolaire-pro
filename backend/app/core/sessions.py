"""Registre serveur des sessions de connexion (Redis).

Une *session* naît à une connexion complète (mot de passe + MFA si requise)
et porte un identifiant stable ``sid``, inscrit dans le JWT et **conservé**
par ``/auth/refresh/`` : les jetons successifs d'un même appareil restent la
même session. Elle meurt à la déconnexion, à sa révocation (par l'utilisateur
ou un administrateur), à une déconnexion globale, ou d'elle-même après
``SESSION_IDLE_TIMEOUT_HOURS`` d'inactivité / ``SESSION_MAX_AGE_DAYS``.

Clés (préfixe ``sfp:`` comme le reste de l'application) :

- ``sfp:session:{sid}`` — hash : user_id, tenant_id, created_at,
  last_seen_at, ip_address, user_agent. Expire avec la durée maximale.
- ``sfp:user_sessions:{user_id}`` — zset sid → last_seen_at (epoch).
- ``sfp:session_revoked:{sid}`` — marqueur lu à chaque requête
  (``security._evaluate_revocation``) : un jeton dont la session est révoquée
  est refusé, y compris au rafraîchissement.

Remplace l'ancien ensemble ``sfp:active_sessions:{user_id}`` : TTL de 30 min
pour des sessions de 7 jours et un jti ajouté à chaque refresh sans retirer
l'ancien — le plafond de 5 sessions n'y mesurait rien de réel et pouvait
refuser un rafraîchissement légitime (audit 2026-11-02, BUG-SESS-03).

Panne Redis : même politique que la révocation existante — création et
lecture journalisées en WARNING sans bloquer la connexion ; la révocation,
elle, échoue bruyamment (l'appelant ne doit jamais annoncer un succès).
"""
from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_CONCURRENT_SESSIONS = 5

_SESSION_KEY = "sfp:session:{sid}"
_USER_SESSIONS_KEY = "sfp:user_sessions:{user_id}"
_REVOKED_KEY = "sfp:session_revoked:{sid}"
# Sans préfixe : lu via redis_client.exists(), qui ajoute "sfp:".
REVOKED_MARKER_UNPREFIXED = "session_revoked:{sid}"


class SessionStoreUnavailable(RuntimeError):
    """Redis injoignable pendant une opération qui ne doit pas échouer en silence."""


@dataclass
class SessionInfo:
    sid: str
    user_id: str
    tenant_id: Optional[str]
    created_at: float
    last_seen_at: float
    ip_address: Optional[str]
    user_agent: Optional[str]

    def to_public_dict(self, current_sid: Optional[str] = None) -> dict:
        device = describe_user_agent(self.user_agent)
        return {
            "id": self.sid,
            "user_id": self.user_id,
            "created_at": _iso(self.created_at),
            "last_activity_at": _iso(self.last_seen_at),
            "ip_address": self.ip_address,
            "browser": device["browser"],
            "os": device["os"],
            "device_type": device["device_type"],
            "is_current": current_sid is not None and self.sid == current_sid,
        }


def _iso(ts: float) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()


def _now() -> float:
    # Milliseconde : deux connexions dans la même seconde restent ordonnées
    # (l'éviction ferme toujours la plus ancienne).
    return round(time.time(), 3)


def _max_age_seconds() -> int:
    return settings.SESSION_MAX_AGE_DAYS * 86400


def _idle_seconds() -> int:
    return settings.SESSION_IDLE_TIMEOUT_HOURS * 3600


def new_session_id() -> str:
    return secrets.token_urlsafe(18)


def describe_user_agent(user_agent: Optional[str]) -> dict:
    """Libellé d'appareil lisible, sans dépendance : suffisant pour qu'un
    utilisateur reconnaisse « Chrome · Android · mobile »."""
    ua = (user_agent or "").lower()
    if not ua:
        return {"browser": None, "os": None, "device_type": None}
    if "edg/" in ua:
        browser = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser = "Opera"
    elif "samsungbrowser" in ua:
        browser = "Samsung Internet"
    elif "chrome/" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua:
        browser = "Safari"
    else:
        browser = "Autre"
    if "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua or "ios" in ua:
        os_name = "iOS"
    elif "windows" in ua:
        os_name = "Windows"
    elif "mac os" in ua or "macintosh" in ua:
        os_name = "macOS"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Autre"
    if "ipad" in ua or "tablet" in ua:
        device_type = "tablet"
    elif "mobile" in ua or "iphone" in ua or ("android" in ua and "mobile" in ua):
        device_type = "mobile"
    else:
        device_type = "desktop"
    return {"browser": browser, "os": os_name, "device_type": device_type}


async def _client():
    from app.core.cache import redis_client

    return await redis_client.client


async def _load(client, sid: str) -> Optional[SessionInfo]:
    raw = await client.hgetall(_SESSION_KEY.format(sid=sid))
    if not raw:
        return None
    return SessionInfo(
        sid=sid,
        user_id=raw.get("user_id", ""),
        tenant_id=raw.get("tenant_id") or None,
        created_at=float(raw.get("created_at") or 0),
        last_seen_at=float(raw.get("last_seen_at") or 0),
        ip_address=raw.get("ip_address") or None,
        user_agent=raw.get("user_agent") or None,
    )


async def _live_sessions(client, user_id: str) -> list[SessionInfo]:
    """Sessions vivantes de l'utilisateur, les plus récentes d'abord ; purge
    au passage les entrées expirées, révoquées ou inactives."""
    now = _now()
    key = _USER_SESSIONS_KEY.format(user_id=user_id)
    live: list[SessionInfo] = []
    for sid in await client.zrange(key, 0, -1):
        info = await _load(client, sid)
        if info is None or info.user_id != user_id or now - info.last_seen_at > _idle_seconds():
            await client.zrem(key, sid)
            if info is not None:
                await client.delete(_SESSION_KEY.format(sid=sid))
            continue
        live.append(info)
    live.sort(key=lambda s: (s.last_seen_at, s.created_at), reverse=True)
    return live


async def _mark_revoked(client, sid: str, user_id: str) -> None:
    pipe = client.pipeline()
    pipe.set(_REVOKED_KEY.format(sid=sid), "1", ex=_max_age_seconds())
    pipe.delete(_SESSION_KEY.format(sid=sid))
    pipe.zrem(_USER_SESSIONS_KEY.format(user_id=user_id), sid)
    await pipe.execute()


async def create_session(
    user_id: str,
    tenant_id: Optional[str],
    ip_address: Optional[str],
    user_agent: Optional[str],
    *,
    sid: Optional[str] = None,
) -> tuple[str, list[str]]:
    """Enregistre une nouvelle session et applique le plafond de sessions
    simultanées en **fermant les plus anciennes** (décision produit
    2026-11-02 : jamais de refus de connexion pour « trop de sessions »).

    Retourne ``(sid, sids_évincés)``. Redis injoignable : la session n'est pas
    enregistrée (WARNING) mais la connexion n'est pas bloquée — même
    politique que le reste de la révocation.
    """
    sid = sid or new_session_id()
    now = _now()
    evicted: list[str] = []
    try:
        client = await _client()
        live = await _live_sessions(client, user_id)
        # live est trié du plus récent au plus ancien.
        while len(live) >= MAX_CONCURRENT_SESSIONS:
            oldest = live.pop()
            await _mark_revoked(client, oldest.sid, user_id)
            evicted.append(oldest.sid)
        pipe = client.pipeline()
        pipe.hset(
            _SESSION_KEY.format(sid=sid),
            mapping={
                "user_id": user_id,
                "tenant_id": tenant_id or "",
                "created_at": now,
                "last_seen_at": now,
                "ip_address": (ip_address or "")[:45],
                "user_agent": (user_agent or "")[:512],
            },
        )
        pipe.expire(_SESSION_KEY.format(sid=sid), _max_age_seconds())
        pipe.zadd(_USER_SESSIONS_KEY.format(user_id=user_id), {sid: now})
        pipe.expire(_USER_SESSIONS_KEY.format(user_id=user_id), _max_age_seconds())
        await pipe.execute()
    except Exception as exc:
        logger.warning("Session registry unavailable, session %s not recorded: %s", sid, exc)
    return sid, evicted


async def touch_session(
    sid: str, user_id: str, tenant_id: Optional[str], ip_address: Optional[str], user_agent: Optional[str]
) -> None:
    """Rafraîchissement : met à jour la dernière activité. Une session
    absente du registre (Redis vidé) est réinscrite sous le même sid."""
    now = _now()
    try:
        client = await _client()
        key = _SESSION_KEY.format(sid=sid)
        if not await client.exists(key):
            await create_session(user_id, tenant_id, ip_address, user_agent, sid=sid)
            return
        pipe = client.pipeline()
        pipe.hset(key, mapping={"last_seen_at": now, "ip_address": (ip_address or "")[:45]})
        pipe.zadd(_USER_SESSIONS_KEY.format(user_id=user_id), {sid: now})
        pipe.expire(_USER_SESSIONS_KEY.format(user_id=user_id), _max_age_seconds())
        await pipe.execute()
    except Exception as exc:
        logger.warning("Session registry unavailable, session %s not refreshed: %s", sid, exc)


async def list_sessions(user_id: str) -> list[SessionInfo]:
    try:
        client = await _client()
        return await _live_sessions(client, user_id)
    except Exception as exc:
        logger.warning("Session registry unavailable while listing sessions: %s", exc)
        raise SessionStoreUnavailable("Registre des sessions indisponible") from exc


async def get_session(sid: str) -> Optional[SessionInfo]:
    try:
        client = await _client()
        return await _load(client, sid)
    except Exception as exc:
        raise SessionStoreUnavailable("Registre des sessions indisponible") from exc


async def revoke_session(user_id: str, sid: str) -> bool:
    """Révoque une session de *cet* utilisateur. False si le sid ne lui
    appartient pas (ou n'existe plus) — l'appelant répond 404, jamais un
    succès. Redis injoignable : SessionStoreUnavailable."""
    try:
        client = await _client()
        info = await _load(client, sid)
        if info is None or info.user_id != user_id:
            return False
        await _mark_revoked(client, sid, user_id)
        return True
    except SessionStoreUnavailable:
        raise
    except Exception as exc:
        raise SessionStoreUnavailable("Registre des sessions indisponible") from exc


async def revoke_all_sessions(user_id: str, except_sid: Optional[str] = None) -> list[str]:
    """Révoque toutes les sessions de l'utilisateur (sauf ``except_sid``) et
    retourne leurs sid. Utilisé par la déconnexion globale, le changement de
    mot de passe et la désactivation d'un compte."""
    try:
        client = await _client()
        revoked = []
        for sid in await client.zrange(_USER_SESSIONS_KEY.format(user_id=user_id), 0, -1):
            if sid == except_sid:
                continue
            await _mark_revoked(client, sid, user_id)
            revoked.append(sid)
        return revoked
    except Exception as exc:
        raise SessionStoreUnavailable("Registre des sessions indisponible") from exc


async def is_session_revoked(sid: Optional[str]) -> bool:
    """Contrôle utilisé par /auth/refresh/. Redis injoignable : False avec
    WARNING — même politique fail-open que is_token_blacklisted()."""
    if not sid:
        return False
    try:
        client = await _client()
        return bool(await client.exists(_REVOKED_KEY.format(sid=sid)))
    except Exception as exc:
        logger.warning("Redis unavailable during session revocation check at refresh (fail-open): %s", exc)
        return False
