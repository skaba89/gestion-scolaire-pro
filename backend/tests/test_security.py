"""Tests de sécurité : validation JWT, permissions."""
import pytest


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
