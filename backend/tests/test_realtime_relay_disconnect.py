"""La boucle de relais WebSocket doit s'arrêter dès que le client se déconnecte.

Régression (2026-11-02) : la boucle ne lisait jamais la socket — elle ne
voyait donc jamais la déconnexion — et interrogeait Redis sans délai
d'attente (``get_message`` rend la main immédiatement) : chaque connexion
fermée laissait une tâche tourner indéfiniment à pleine vitesse, avec son
abonnement Redis. Symptôme en CI : ``CancelledError`` intermittent dans
``test_realtime_websocket_revocation_2026_09_28.py`` après plus de 2 min
d'attente à la fermeture.

Ces tests n'ont besoin ni de Redis ni de base : la socket et l'abonnement
sont simulés, seul le comportement de la boucle est vérifié.
"""
import asyncio

import pytest

from app.api.v1.endpoints.core.realtime import _relay_tenant_events


class _FakePubSub:
    def __init__(self, messages=None):
        self._messages = list(messages or [])
        self.calls = 0
        self.timeouts = []

    async def get_message(self, ignore_subscribe_messages=False, timeout=0.0):
        self.calls += 1
        self.timeouts.append(timeout)
        if self._messages:
            return {"type": "message", "data": self._messages.pop(0)}
        # Comme redis-py : attendre au plus `timeout` puis rendre None.
        await asyncio.sleep(timeout or 0)
        return None


class _FakeWebSocket:
    def __init__(self, disconnect_after: float):
        self._disconnect_after = disconnect_after
        self.sent = []

    async def receive(self):
        await asyncio.sleep(self._disconnect_after)
        return {"type": "websocket.disconnect", "code": 1000}

    async def send_text(self, data):
        self.sent.append(data)


def _run(coro, limit: float):
    return asyncio.run(asyncio.wait_for(coro, timeout=limit))


def test_relay_returns_when_client_disconnects():
    ws = _FakeWebSocket(disconnect_after=0.05)
    pubsub = _FakePubSub()
    # Avant correctif : boucle infinie → TimeoutError.
    _run(_relay_tenant_events(ws, pubsub, tenant_id="t", user_id="u"), limit=3)


def test_relay_waits_on_redis_instead_of_spinning():
    ws = _FakeWebSocket(disconnect_after=0.3)
    pubsub = _FakePubSub()
    _run(_relay_tenant_events(ws, pubsub, tenant_id="t", user_id="u"), limit=3)
    assert all(t and t > 0 for t in pubsub.timeouts), pubsub.timeouts
    # Avec une attente bornée, quelques appels en 0,3 s — pas des milliers.
    assert pubsub.calls < 50, pubsub.calls


def test_relay_forwards_published_messages():
    ws = _FakeWebSocket(disconnect_after=0.2)
    pubsub = _FakePubSub(messages=["a", "b"])
    _run(_relay_tenant_events(ws, pubsub, tenant_id="t", user_id="u"), limit=3)
    assert ws.sent == ["a", "b"]


def test_relay_stops_when_sending_fails():
    """Socket fermée côté serveur pendant un envoi : la boucle s'arrête
    au lieu de tourner indéfiniment."""
    class _BrokenSendWebSocket(_FakeWebSocket):
        async def send_text(self, data):
            raise RuntimeError("socket closed")

    ws = _BrokenSendWebSocket(disconnect_after=60)
    pubsub = _FakePubSub(messages=["x"])
    with pytest.raises(RuntimeError):
        _run(_relay_tenant_events(ws, pubsub, tenant_id="t", user_id="u"), limit=3)
