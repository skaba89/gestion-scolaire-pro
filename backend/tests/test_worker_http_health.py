"""Sonde HTTP minimale du worker (app/workers/http_health.py)."""
import asyncio
import json

import pytest

from app.workers import http_health


async def _get(port: int, path: str) -> tuple[int, bytes]:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(f"GET {path} HTTP/1.1\r\nHost: x\r\n\r\n".encode())
    await writer.drain()
    raw = await reader.read()
    writer.close()
    head, _, body = raw.partition(b"\r\n\r\n")
    return int(head.split()[1]), body


def _serve_and_get(path: str) -> tuple[int, bytes]:
    async def scenario():
        server = await http_health.start_http_health_server(0, host="127.0.0.1")
        port = server.sockets[0].getsockname()[1]
        try:
            return await _get(port, path)
        finally:
            server.close()
            await server.wait_closed()
    return asyncio.run(scenario())


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
    monkeypatch.setattr(http_health, "_last_heartbeat_ok", None)
    monkeypatch.setattr(http_health, "_started_at", http_health.time.monotonic())


def test_live_after_recent_heartbeat(monkeypatch):
    monkeypatch.setenv("RELEASE_SHA", "a" * 40)
    http_health.mark_heartbeat_ok()
    status, body = _serve_and_get("/health/live")
    assert status == 200
    assert json.loads(body) == {"status": "alive", "release_sha": "a" * 40}


def test_live_during_startup_grace_period():
    assert _serve_and_get("/health/live")[0] == 200


def test_stale_heartbeat_returns_503(monkeypatch):
    old = http_health.time.monotonic() - http_health._LIVENESS_WINDOW_SECONDS - 1
    monkeypatch.setattr(http_health, "_started_at", old)
    monkeypatch.setattr(http_health, "_last_heartbeat_ok", old)
    assert _serve_and_get("/health/live")[0] == 503


def test_stale_body_reports_stale(monkeypatch):
    old = http_health.time.monotonic() - http_health._LIVENESS_WINDOW_SECONDS - 1
    monkeypatch.setattr(http_health, "_started_at", old)
    monkeypatch.setattr(http_health, "_last_heartbeat_ok", old)
    assert json.loads(_serve_and_get("/health/live")[1])["status"] == "stale"


def test_oversized_request_line_is_closed_without_response():
    async def scenario():
        server = await http_health.start_http_health_server(0, host="127.0.0.1")
        port = server.sockets[0].getsockname()[1]
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.write(b"GET /" + b"a" * 100_000 + b" HTTP/1.1\r\n\r\n")
            await writer.drain()
            data = await reader.read()
            writer.close()
            return data
        finally:
            server.close()
            await server.wait_closed()
    assert asyncio.run(scenario()) == b""


def test_no_heartbeat_after_grace_period_returns_503(monkeypatch):
    monkeypatch.setattr(http_health, "_started_at", http_health.time.monotonic() - http_health._LIVENESS_WINDOW_SECONDS - 1)
    assert _serve_and_get("/health/live")[0] == 503


@pytest.mark.parametrize("path", ["/", "/health/deep", "/metrics/", "/robots933456.txt"])
def test_other_paths_expose_nothing(path):
    assert _serve_and_get(path) == (404, b"")


def test_disabled_unless_port_configured(monkeypatch):
    monkeypatch.delenv("WORKER_HEALTH_PORT", raising=False)
    assert http_health.configured_port() is None
    monkeypatch.setenv("WORKER_HEALTH_PORT", "8000")
    assert http_health.configured_port() == 8000


@pytest.mark.parametrize("bad", ["abc", "0", "70000"])
def test_invalid_port_fails_loudly(monkeypatch, bad):
    monkeypatch.setenv("WORKER_HEALTH_PORT", bad)
    with pytest.raises(ValueError):
        http_health.configured_port()
