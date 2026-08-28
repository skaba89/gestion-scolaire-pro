"""Shared, proxy-aware client-IP resolution for every slowapi Limiter in
this app.

Extracted from app/main.py (2026-08-28) — that file already carried the
correct implementation (fixed after an earlier incident, see the
docstring on get_client_ip below and tests/test_client_ip_trust.py), but
only its own top-level `limiter` (default_limits=["100/minute"]) used it.
Eleven OTHER Limiter instances across the codebase — one per endpoint
module needing its own rate limit — each independently imported slowapi's
raw `get_remote_address` instead, because app/main.py cannot be imported
from an endpoint module (main.py imports app.api.v1.router, which
imports every endpoint module — importing back from main.py would be
circular). This module is the shared, leaf-level home both main.py and
every endpoint module can import from without that cycle.

Impact of the bug this fixes: behind Render's (or any) reverse proxy,
request.client.host is the same internal proxy connection for every
external visitor. get_remote_address() reads exactly that field, so
every one of those eleven limiters was bucketing ALL of a site's
visitors together under one shared rate-limit counter — enough ordinary
traffic (or the app's own cold-start retry logic) could 429 every
visitor at once, not just an abusive one.
"""
import ipaddress

from fastapi import Request
from slowapi.util import get_remote_address

# Render/Cloudflare proxy IPs — only trust X-Forwarded-For from these.
# These are CIDR *networks*, not literal address prefixes — a direct
# `str.startswith("10.0.0.0")` check (the original, buggy implementation)
# never matches a real internal address like "10.0.4.23" (only literal
# strings starting with "10.0.0.0" would), so it silently never trusted
# Render's actual proxy IPs. Every request then fell back to
# get_remote_address(), which behind Render/Cloudflare resolves to the
# same edge connection for all traffic — collapsing every client onto
# one shared rate-limit bucket (discovered when a single visitor
# exhausted the 5/minute bootstrap limit and it never reset until the
# in-memory limiter was restarted).
TRUSTED_PROXY_NETWORKS = [
    ipaddress.ip_network("127.0.0.1/32"),
    ipaddress.ip_network("::1/128"),
    # Render internal proxy ranges (RFC 1918 private space)
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]


def get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from trusted proxies.

    SECURITY: Only trust X-Forwarded-For when the direct connection comes from
    a known proxy. Otherwise, clients can spoof this header to bypass rate limiting.
    """
    client_host = request.client.host if request.client else None
    if client_host:
        try:
            addr = ipaddress.ip_address(client_host)
            is_trusted = any(addr in network for network in TRUSTED_PROXY_NETWORKS)
        except ValueError:
            is_trusted = False
        if is_trusted:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
    return get_remote_address(request)
