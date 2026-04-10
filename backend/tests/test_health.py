"""Tests du health check endpoint."""
import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(scope="module")
def health_client():
    """Client isolé pour les tests health (minimal mock)."""
    with patch("app.core.database.create_engine"), \
         patch("app.core.cache.redis.Redis"):

        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as c:
            yield c


def test_health_returns_200(health_client):
    """Le health check doit retourner 200."""
    response = health_client.get("/health")
    assert response.status_code == 200


def test_health_returns_healthy(health_client):
    """Le health check doit indiquer status=healthy."""
    response = health_client.get("/health")
    data = response.json()
    assert data["status"] == "healthy"


def test_health_returns_version(health_client):
    """Le health check doit retourner la version de l'app."""
    response = health_client.get("/health")
    data = response.json()
    assert "version" in data


def test_root_returns_200(health_client):
    """L'endpoint racine doit retourner 200."""
    response = health_client.get("/")
    assert response.status_code == 200


def test_root_has_message(health_client):
    """L'endpoint racine doit retourner un message."""
    response = health_client.get("/")
    data = response.json()
    assert "message" in data
