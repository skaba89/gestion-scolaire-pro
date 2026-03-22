"""Tests de sécurité : validation JWT, JWKS, rate limiting."""
import pytest
import time
from unittest.mock import patch, MagicMock


class TestJWKSCacheLogic:
    """Tests de la logique de cache JWKS."""

    def test_fresh_cache_is_used(self):
        """Un cache valide (< TTL) doit être retourné sans fetch."""
        from app.core import security

        # Injecter un cache frais
        security._jwks_cache["data"] = {"keys": [{"kid": "test-key"}]}
        security._jwks_cache["last_fetched"] = time.time()

        with patch("app.core.security.requests.get") as mock_get:
            result = security.get_keycloak_public_key()
            mock_get.assert_not_called()
            assert result == {"keys": [{"kid": "test-key"}]}

    def test_stale_cache_fetches_fresh(self):
        """Un cache périmé doit déclencher un nouveau fetch."""
        from app.core import security

        security._jwks_cache["data"] = {"keys": []}
        security._jwks_cache["last_fetched"] = time.time() - 700  # > TTL 600s

        with patch("app.core.security.requests.get") as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = {"keys": [{"kid": "fresh-key"}]}
            mock_response.raise_for_status.return_value = None
            mock_get.return_value = mock_response

            result = security.get_keycloak_public_key()
            mock_get.assert_called_once()
            assert result["keys"][0]["kid"] == "fresh-key"

    def test_fetch_failure_with_fresh_stale_cache_uses_cache(self):
        """Si fetch échoue mais cache < 30min, le cache périmé est utilisé."""
        from app.core import security
        from fastapi import HTTPException

        security._jwks_cache["data"] = {"keys": [{"kid": "stale-key"}]}
        security._jwks_cache["last_fetched"] = time.time() - 700  # > TTL mais < stale_max

        with patch("app.core.security.requests.get") as mock_get:
            mock_get.side_effect = ConnectionError("Network down")
            result = security.get_keycloak_public_key()
            assert result["keys"][0]["kid"] == "stale-key"

    def test_fetch_failure_with_very_stale_cache_raises_503(self):
        """Si fetch échoue et cache > 30min, doit lever 503."""
        from app.core import security
        from fastapi import HTTPException

        security._jwks_cache["data"] = {"keys": []}
        security._jwks_cache["last_fetched"] = time.time() - 2000  # > stale_max 1800s

        with patch("app.core.security.requests.get") as mock_get:
            mock_get.side_effect = ConnectionError("Network down")
            with pytest.raises(HTTPException) as exc_info:
                security.get_keycloak_public_key()
            assert exc_info.value.status_code == 503

    def test_no_cache_and_fetch_failure_raises_503(self):
        """Sans cache du tout et fetch échoue, doit lever 503."""
        from app.core import security
        from fastapi import HTTPException

        security._jwks_cache["data"] = None
        security._jwks_cache["last_fetched"] = 0

        with patch("app.core.security.requests.get") as mock_get:
            mock_get.side_effect = ConnectionError("Network down")
            with pytest.raises(HTTPException) as exc_info:
                security.get_keycloak_public_key()
            assert exc_info.value.status_code == 503


class TestRolePermissions:
    """Tests du système de permissions basé sur les rôles."""

    def test_super_admin_has_all_permissions(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "*" in ROLE_PERMISSIONS["SUPER_ADMIN"]

    def test_tenant_admin_has_all_permissions(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "*" in ROLE_PERMISSIONS["TENANT_ADMIN"]

    def test_teacher_has_grade_write(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "grades:write" in ROLE_PERMISSIONS["TEACHER"]

    def test_student_cannot_write_grades(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "grades:write" not in ROLE_PERMISSIONS["STUDENT"]

    def test_parent_can_read_grades(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "grades:read" in ROLE_PERMISSIONS["PARENT"]

    def test_alumni_role_exists(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "ALUMNI" in ROLE_PERMISSIONS

    def test_accountant_role_exists(self):
        from app.core.security import ROLE_PERMISSIONS
        assert "ACCOUNTANT" in ROLE_PERMISSIONS
        assert "finance:write" in ROLE_PERMISSIONS["ACCOUNTANT"]


class TestConfigValidation:
    """Tests de la validation de la configuration."""

    def test_debug_mode_allows_empty_secret(self):
        """En mode DEBUG, une clé vide doit être auto-générée (pas d'erreur)."""
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {"DEBUG": "True", "SECRET_KEY": ""}):
            # En mode debug, une clé temporaire est générée
            from app.core.config import Settings
            settings = Settings()
            assert len(settings.SECRET_KEY) >= 32

    def test_prod_mode_rejects_empty_secret(self):
        """En mode PRODUCTION, une clé vide doit lever ValueError."""
        import os
        from pydantic import ValidationError
        with patch.dict(os.environ, {"DEBUG": "False", "SECRET_KEY": ""}):
            with pytest.raises((ValueError, ValidationError)):
                from app.core.config import Settings
                Settings()
