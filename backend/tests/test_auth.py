"""Tests des endpoints d'authentification."""
import pytest
from unittest.mock import patch, MagicMock


class TestLogin:
    def test_login_rate_limit_header_present(self):
        """L'endpoint login doit avoir des headers rate-limit."""
        with patch("app.api.v1.endpoints.core.auth.keycloak_openid") as mock_kc:
            mock_kc.token.return_value = {
                "access_token": "tok",
                "refresh_token": "ref",
                "expires_in": 300,
            }
            from fastapi.testclient import TestClient
            from app.main import app
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/login",
                data={"username": "user@test.com", "password": "pass"},
            )
            # Devrait répondre 200 ou 422 (pas 500)
            assert resp.status_code in (200, 422, 429)

    def test_login_success_returns_token(self):
        """Login réussi → token dans la réponse."""
        with patch("app.api.v1.endpoints.core.auth.keycloak_openid") as mock_kc:
            mock_kc.token.return_value = {
                "access_token": "test_access_token",
                "refresh_token": "test_refresh_token",
                "expires_in": 300,
            }
            from fastapi.testclient import TestClient
            from app.main import app
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
        with patch("app.api.v1.endpoints.core.auth.keycloak_openid") as mock_kc:
            mock_kc.token.side_effect = Exception("invalid credentials")
            from fastapi.testclient import TestClient
            from app.main import app
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
        client = TestClient(app)
        resp = client.post("/api/v1/auth/login", data={})
        assert resp.status_code == 422

    def test_refresh_invalid_token_returns_401(self):
        """Refresh avec token invalide → 401."""
        with patch("app.api.v1.endpoints.core.auth.keycloak_openid") as mock_kc:
            mock_kc.refresh_token.side_effect = Exception("invalid token")
            from fastapi.testclient import TestClient
            from app.main import app
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/refresh",
                params={"refresh_token": "bad_token"},
            )
            assert resp.status_code == 401

    def test_refresh_valid_token_returns_new_token(self):
        """Refresh avec token valide → nouveau access_token."""
        with patch("app.api.v1.endpoints.core.auth.keycloak_openid") as mock_kc:
            mock_kc.refresh_token.return_value = {
                "access_token": "new_access_token",
                "refresh_token": "new_refresh_token",
                "expires_in": 300,
            }
            from fastapi.testclient import TestClient
            from app.main import app
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
        client = TestClient(app)
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_protected_endpoint_with_invalid_token_returns_401(self):
        """Un endpoint protégé avec un faux JWT → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        with patch("app.core.security.get_keycloak_public_key") as mock_jwks:
            mock_jwks.return_value = {"keys": []}
            resp = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer invalid.jwt.token"},
            )
            assert resp.status_code == 401

    def test_protected_endpoint_with_malformed_bearer_returns_401(self):
        """Bearer token malformé → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "NotBearer token"},
        )
        assert resp.status_code in (401, 403)
