"""API contract smoke tests.

These tests are intentionally lightweight: they do not start the full FastAPI
lifespan and do not require a running database. Their goal is to catch accidental
removal of public route prefixes that the frontend and deployment probes depend
on.
"""
from __future__ import annotations

from app.core.config import settings
from app.main import app


def _registered_prefixes() -> set[str]:
    prefixes: set[str] = set()
    # OpenAPI is the documented public contract. Legacy aliases intentionally
    # hidden from the schema (for example /audit-logs) are outside this check.
    for path in app.openapi().get("paths", {}):
        # Most routers are mounted under /api/v1; health probes stay at root.
        api_path = path.removeprefix(settings.API_V1_STR)
        parts = [part for part in api_path.split("/") if part]
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
        "/notifications",
        "/storage",
        "/search",
    }

    missing = expected - prefixes
    assert not missing, f"Missing API route prefixes: {sorted(missing)}"
