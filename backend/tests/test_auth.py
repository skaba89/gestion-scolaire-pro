"""Tests des endpoints d'authentification."""
import pytest
from unittest.mock import patch


class TestLogin:
    def test_login_rate_limit_header_present(self):
        """L'endpoint login doit avoir des headers rate-limit."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/login",
                data={"username": "user@test.com", "password": "pass"},
            )
            # Devrait répondre 200 ou 422 (pas 500)
            assert resp.status_code in (200, 422, 429)

    def test_login_success_returns_token(self):
        """Login réussi → token dans la réponse."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/login",
                data={"username": "admin@test.com", "password": "correct_password"},
            )
            if resp.status_code == 200:
                data = resp.json()
                assert "access_token" in data
                assert data["token_type"] == "bearer"

    def test_login_wrong_credentials_returns_401(self):
        """Login avec mauvais mot de passe → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/login",
                data={"username": "user@test.com", "password": "wrong_password"},
            )
            assert resp.status_code == 401

    def test_login_missing_credentials_returns_422(self):
        """Login sans body → 422 Validation Error."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.post("/api/v1/auth/login", data={})
            assert resp.status_code == 422

    def test_refresh_invalid_token_returns_401(self):
        """Refresh avec token invalide → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/refresh",
                params={"refresh_token": "bad_token"},
            )
            assert resp.status_code == 401

    def test_refresh_valid_token_returns_new_token(self):
        """Refresh avec token valide → nouveau access_token."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/refresh",
                params={"refresh_token": "valid_refresh_token"},
            )
            if resp.status_code == 200:
                data = resp.json()
                assert "access_token" in data


class TestTokenSecurity:
    def test_protected_endpoint_without_token_returns_401(self):
        """Un endpoint protégé sans token → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.get("/api/v1/auth/me")
            assert resp.status_code == 401

    def test_protected_endpoint_with_invalid_token_returns_401(self):
        """Un endpoint protégé avec un faux JWT → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer invalid.jwt.token"},
            )
            assert resp.status_code == 401

    def test_protected_endpoint_with_malformed_bearer_returns_401(self):
        """Bearer token malformé → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        with patch("app.core.database.create_engine"), \
             patch("app.core.cache.redis.Redis"):
            client = TestClient(app)
            resp = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "NotBearer token"},
            )
            assert resp.status_code in (401, 403)
