"""Tests du health check endpoint."""
from unittest.mock import AsyncMock, PropertyMock, patch

from conftest import get_test_client

client = get_test_client()


def test_health_returns_200():
    """Le health check doit retourner 200."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_healthy():
    """Le health check doit indiquer status=healthy."""
    response = client.get("/health")
    data = response.json()
    assert data["status"] == "healthy"


def test_health_returns_version():
    """Le health check doit retourner la version de l'app."""
    response = client.get("/health")
    data = response.json()
    assert "version" in data


def test_health_has_components():
    """Le health check doit inclure les composants database, cache et rls."""
    response = client.get("/health")
    data = response.json()
    assert "components" in data
    components = data["components"]
    assert "database" in components
    assert "cache" in components
    assert "rls" in components


def test_health_rls_not_disabled():
    """RLS ne doit pas être explicitement désactivé sur les tables tenant."""
    response = client.get("/health")
    data = response.json()
    rls = data["components"].get("rls", "skipped")
    # Acceptable values: "active", "skipped" (SQLite), "unknown"
    # "disabled" means RLS was created but then disabled — a security regression
    assert rls != "disabled", f"RLS is disabled on tenant-scoped tables! Got: {rls}"


def test_liveness_does_not_touch_external_dependencies():
    """La liveness doit rester disponible même pendant une panne DB/Redis."""
    with (
        patch("app.main._check_database_and_rls") as database_check,
        patch("app.main._check_cache_readiness", new=AsyncMock()) as cache_check,
    ):
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "alive"
    database_check.assert_not_called()
    cache_check.assert_not_awaited()


def test_readiness_rejects_an_unreachable_database():
    with (
        patch("app.main._check_database_and_rls", return_value=("unreachable", "unknown")),
        patch("app.main._check_cache_readiness", new=AsyncMock(return_value="connected")),
    ):
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["components"]["database"] == "unreachable"


def test_production_readiness_requires_redis_and_active_rls():
    from app.main import settings

    with (
        patch.object(type(settings), "is_sqlite", new_callable=PropertyMock, return_value=False),
        patch("app.main._check_database_and_rls", return_value=("connected", "active")),
        patch("app.main._check_cache_readiness", new=AsyncMock(return_value="unreachable")),
    ):
        redis_failure = client.get("/health/ready")

    with (
        patch.object(type(settings), "is_sqlite", new_callable=PropertyMock, return_value=False),
        patch("app.main._check_database_and_rls", return_value=("connected", "disabled")),
        patch("app.main._check_cache_readiness", new=AsyncMock(return_value="connected")),
    ):
        rls_failure = client.get("/health/ready")

    assert redis_failure.status_code == 503
    assert redis_failure.json()["components"]["cache"] == "unreachable"
    assert rls_failure.status_code == 503
    assert rls_failure.json()["components"]["rls"] == "disabled"


def test_production_readiness_accepts_all_critical_dependencies():
    from app.main import settings

    with (
        patch.object(type(settings), "is_sqlite", new_callable=PropertyMock, return_value=False),
        patch("app.main._check_database_and_rls", return_value=("connected", "active")),
        patch("app.main._check_cache_readiness", new=AsyncMock(return_value="connected")),
    ):
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.headers["cache-control"] == "no-store"


def test_root_returns_200():
    """L'endpoint racine doit retourner 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_root_has_message():
    """L'endpoint racine doit retourner un message."""
    response = client.get("/")
    data = response.json()
    assert "message" in data
