"""Tests du health check endpoint."""
from unittest.mock import AsyncMock, PropertyMock, patch

import pytest

from conftest import get_test_client

client = get_test_client()


@pytest.fixture(autouse=True)
def deterministic_cache_readiness():
    """Keep HTTP unit tests independent from Redis and event-loop ownership."""
    with patch(
        "app.main._check_cache_readiness",
        new=AsyncMock(return_value="connected"),
    ):
        yield


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


def test_health_has_storage_component():
    """National audit Phase 6: MinIO readiness must be reported too."""
    response = client.get("/health")
    data = response.json()
    assert "storage" in data["components"]


def test_readiness_accepts_storage_disabled():
    """A dev/staging environment deliberately not configured for MinIO
    (local-disk fallback, see app/core/storage.py) must not be reported
    unhealthy for a dependency it isn't even using."""
    from app.main import settings

    with (
        patch.object(type(settings), "is_sqlite", new_callable=PropertyMock, return_value=False),
        patch("app.main._check_database_and_rls", return_value=("connected", "active")),
        patch("app.main._check_cache_readiness", new=AsyncMock(return_value="connected")),
        patch("app.main._check_storage_readiness", new=AsyncMock(return_value="disabled")),
    ):
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["components"]["storage"] == "disabled"


def test_readiness_rejects_unreachable_storage_when_minio_is_configured():
    """Unlike "disabled", "unreachable" means MinIO IS configured but the
    endpoint can't actually be reached — that must fail readiness, since
    uploads (signatures, documents, receipts) would silently break."""
    from app.main import settings

    with (
        patch.object(type(settings), "is_sqlite", new_callable=PropertyMock, return_value=False),
        patch("app.main._check_database_and_rls", return_value=("connected", "active")),
        patch("app.main._check_cache_readiness", new=AsyncMock(return_value="connected")),
        patch("app.main._check_storage_readiness", new=AsyncMock(return_value="unreachable")),
    ):
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["components"]["storage"] == "unreachable"


def test_root_returns_200():
    """L'endpoint racine doit retourner 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_root_has_message():
    """L'endpoint racine doit retourner un message."""
    response = client.get("/")
    data = response.json()
    assert "message" in data


# ─── /health/deep (Phase 3, issue #19, PR1) ─────────────────────────────────

def test_deep_health_open_in_debug_mode():
    """DEBUG=true (the test suite's setting) must not require a secret —
    matches the same convention as /metrics/."""
    response = client.get("/health/deep")
    assert response.status_code == 200
    data = response.json()
    assert set(["version", "environment", "components", "disk", "db_pool", "alembic"]) <= set(data.keys())


def test_deep_health_disabled_without_secret_in_production():
    """DEBUG=false and no HEALTH_DEEP_SECRET configured must deny access
    (fail closed), not silently allow open diagnostic access."""
    from app.main import settings
    import os as _os

    with patch.object(settings, "DEBUG", False):
        _os.environ.pop("HEALTH_DEEP_SECRET", None)
        response = client.get("/health/deep")

    assert response.status_code == 403


def test_deep_health_rejects_wrong_secret_in_production():
    from app.main import settings
    import os as _os

    with patch.object(settings, "DEBUG", False):
        _os.environ["HEALTH_DEEP_SECRET"] = "correct-secret-for-test"
        try:
            response = client.get("/health/deep?secret=wrong-secret")
        finally:
            _os.environ.pop("HEALTH_DEEP_SECRET", None)

    assert response.status_code == 401


def test_deep_health_accepts_correct_secret_in_production():
    from app.main import settings
    import os as _os

    with patch.object(settings, "DEBUG", False):
        _os.environ["HEALTH_DEEP_SECRET"] = "correct-secret-for-test"
        try:
            response = client.get("/health/deep?secret=correct-secret-for-test")
        finally:
            _os.environ.pop("HEALTH_DEEP_SECRET", None)

    assert response.status_code == 200
    assert "disk" in response.json()


def test_deep_health_accepts_bearer_token_secret():
    from app.main import settings
    import os as _os

    with patch.object(settings, "DEBUG", False):
        _os.environ["HEALTH_DEEP_SECRET"] = "correct-secret-for-test"
        try:
            response = client.get(
                "/health/deep",
                headers={"Authorization": "Bearer correct-secret-for-test"},
            )
        finally:
            _os.environ.pop("HEALTH_DEEP_SECRET", None)

    assert response.status_code == 200


def test_deep_health_disk_section_has_expected_shape():
    response = client.get("/health/deep")
    disk = response.json()["disk"]
    assert disk["status"] in ("ok", "low", "critical", "unknown")


def test_deep_health_db_pool_section_has_expected_shape():
    response = client.get("/health/deep")
    pool = response.json()["db_pool"]
    assert pool["status"] in ("ok", "degraded", "exhausted", "unknown")
    assert pool["capacity"] == pool["size"] + max(pool["overflow"], 0)


class TestDbPoolStatusReflectsOccupancy:
    """Audit finding (round 2, Medium): _check_db_pool() used to hardcode
    "status": "ok" regardless of actual occupancy — these exercise the
    function directly with a fake pool so the exhausted/degraded/ok
    thresholds are verified without needing to actually saturate the real
    connection pool in a test."""

    def _fake_engine(self, *, size, checked_out, overflow, checked_in=0):
        from unittest.mock import MagicMock
        pool = MagicMock()
        pool.size.return_value = size
        pool.checkedout.return_value = checked_out
        pool.overflow.return_value = overflow
        pool.checkedin.return_value = checked_in
        engine = MagicMock()
        engine.pool = pool
        return engine

    def test_reports_ok_when_pool_has_headroom(self, monkeypatch):
        from app.main import _check_db_pool
        engine = self._fake_engine(size=5, checked_out=1, overflow=0)
        monkeypatch.setattr("app.core.database.engine", engine)

        result = _check_db_pool()
        assert result["status"] == "ok"

    def test_reports_degraded_at_high_occupancy(self, monkeypatch):
        from app.main import _check_db_pool
        # 8/10 capacity = 80% — at the degraded threshold.
        engine = self._fake_engine(size=5, checked_out=8, overflow=5)
        monkeypatch.setattr("app.core.database.engine", engine)

        result = _check_db_pool()
        assert result["status"] == "degraded"

    def test_reports_exhausted_when_at_capacity(self, monkeypatch):
        from app.main import _check_db_pool
        engine = self._fake_engine(size=5, checked_out=10, overflow=5)
        monkeypatch.setattr("app.core.database.engine", engine)

        result = _check_db_pool()
        assert result["status"] == "exhausted"

    def test_zero_capacity_is_ok_not_a_false_exhausted(self, monkeypatch):
        """A pool that hasn't opened any connection yet (size=0,
        overflow=0) must not be misreported as exhausted just because
        checked_out / capacity is a division by zero."""
        from app.main import _check_db_pool
        engine = self._fake_engine(size=0, checked_out=0, overflow=0)
        monkeypatch.setattr("app.core.database.engine", engine)

        result = _check_db_pool()
        assert result["status"] == "ok"


def test_deep_health_alembic_section_matches_the_running_dialect():
    """CI runs this same test file against both SQLite (the "Backend" job)
    and real PostgreSQL with migrations actually applied (the "Backend
    Tests (PostgreSQL)" job) — this must behave correctly in both, not
    assume one dialect. On SQLite, alembic_version drift detection is
    skipped outright (PostgreSQL-only, see _check_alembic_revision's
    docstring). On PostgreSQL, the check actually runs and — since CI
    applies `alembic upgrade head` before pytest — should report the DB
    schema as up to date with the code that's running."""
    from app.main import settings

    response = client.get("/health/deep")
    alembic = response.json()["alembic"]

    if settings.is_sqlite:
        assert alembic["status"] == "skipped"
    else:
        assert alembic["status"] == "up_to_date", alembic


def test_deep_health_not_in_openapi_schema():
    """Deliberately excluded from the public OpenAPI schema
    (include_in_schema=False) — it's an operator tool, not a documented
    public API surface."""
    from app.main import app as fastapi_app

    schema = fastapi_app.openapi()
    assert "/health/deep" not in schema.get("paths", {})
