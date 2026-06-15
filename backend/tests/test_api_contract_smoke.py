"""API contract smoke tests.

These tests are intentionally lightweight: they do not start the full FastAPI
lifespan and do not require a running database. Their goal is to catch accidental
removal of public route prefixes that the frontend and deployment probes depend
on.
"""
from __future__ import annotations

from app.api.v1.router import api_router


def _registered_prefixes() -> set[str]:
    prefixes: set[str] = set()
    for route in api_router.routes:
        path = getattr(route, "path", "") or ""
        parts = [part for part in path.split("/") if part]
        if parts:
            prefixes.add(f"/{parts[0]}")
    return prefixes


def test_core_route_prefixes_are_registered() -> None:
    prefixes = _registered_prefixes()

    expected = {
        "/auth",
        "/health",
        "/users",
        "/tenants",
        "/students",
        "/grades",
        "/attendance",
        "/payments",
        "/billing",
        "/platform",
        "/analytics",
        "/audit",
        "/audit-logs",
        "/notifications",
        "/storage",
        "/search",
    }

    missing = expected - prefixes
    assert not missing, f"Missing API route prefixes: {sorted(missing)}"
