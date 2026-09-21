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
import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import Request
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

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


def is_load_test_bypass_active() -> bool:
    """True only when settings.LOAD_TEST_BYPASS_EXPIRES_AT is a valid ISO
    8601 timestamp strictly in the future. Logs a warning (not silence)
    on every rejection reason so a stale campaign secret left configured
    in production is visible rather than just quietly doing nothing.

    Shared by every rate-limit key function that honours the
    X-Load-Test-Token bypass (originally auth.py's login limiter only —
    see get_client_ip_or_load_test_bypass below for why this is now also
    the app-wide default limiter's key function)."""
    from app.core.config import settings

    expires_raw = settings.LOAD_TEST_BYPASS_EXPIRES_AT
    if not expires_raw:
        logger.warning(
            "LOAD_TEST_BYPASS_SECRET is configured but LOAD_TEST_BYPASS_EXPIRES_AT is not — "
            "bypass treated as expired/inert. Set both, or neither."
        )
        return False
    try:
        expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except ValueError:
        logger.warning(
            "LOAD_TEST_BYPASS_EXPIRES_AT=%r is not a valid ISO 8601 timestamp — "
            "bypass treated as expired/inert.", expires_raw,
        )
        return False
    if datetime.now(timezone.utc) >= expires_at:
        logger.warning(
            "LOAD_TEST_BYPASS_SECRET expired at %s (still configured!) — bypass inert. "
            "Unset LOAD_TEST_BYPASS_SECRET/LOAD_TEST_BYPASS_EXPIRES_AT now.", expires_raw,
        )
        return False
    return True


def get_client_ip_or_load_test_bypass(request: Request) -> str:
    """get_client_ip(), except a request carrying header X-Load-Test-Token
    equal to settings.LOAD_TEST_BYPASS_SECRET (while is_load_test_bypass_
    active()) is instead keyed on a fresh uuid4 per call, so it can never
    accumulate against anyone's real quota.

    national-readiness audit, 2026-09: a real k6 campaign run (see
    load-tests/campaign.js, docs/reports/PERF_CAMPAIGN_2026-09.md)
    generates every request from ONE source IP. app/main.py's app-wide
    default limiter (100/minute per IP) was already exempting nothing —
    a 5-VU smoke run alone produced ~49% 429s within a minute, drowning
    every other metric in rate-limit noise before the app's real capacity
    was ever tested. Extracted here (was auth.py-only, login endpoints
    only) so the SAME already-audited, already-expiring, constant-time-
    compared bypass now also covers the app-wide limiter — not a new,
    second bypass mechanism to independently secure and expire.

    Inert by default: LOAD_TEST_BYPASS_SECRET is empty unless a
    deployment operator deliberately sets it, and the comparison is
    constant-time (secrets.compare_digest) specifically so an unset/
    mismatched header can't be used to probe for the real value.
    """
    from app.core.config import settings

    if settings.LOAD_TEST_BYPASS_SECRET and is_load_test_bypass_active():
        presented = request.headers.get("X-Load-Test-Token", "")
        if presented and secrets.compare_digest(presented, settings.LOAD_TEST_BYPASS_SECRET):
            logger.info("Rate limit bypassed via X-Load-Test-Token (authorized load test)")
            return f"load-test-exempt-{uuid.uuid4()}"
    return get_client_ip(request)
