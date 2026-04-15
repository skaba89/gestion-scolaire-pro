"""Tests du health check endpoint."""
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


def test_root_returns_200():
    """L'endpoint racine doit retourner 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_root_has_message():
    """L'endpoint racine doit retourner un message."""
    response = client.get("/")
    data = response.json()
    assert "message" in data
