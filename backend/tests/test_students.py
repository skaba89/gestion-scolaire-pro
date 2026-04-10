"""Tests des endpoints étudiants — isolation multi-tenant."""
import pytest
import uuid
from unittest.mock import patch, MagicMock


class TestStudentEndpointsSecurity:
    """Vérifie que les endpoints /students nécessitent une authentification."""

    def test_list_students_without_auth_returns_401(self):
        """GET /students/ sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.get("/api/v1/students/")
        assert resp.status_code == 401

    def test_create_student_without_auth_returns_401(self):
        """POST /students/ sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post(
            "/api/v1/students/",
            json={
                "first_name": "Jean",
                "last_name": "Dupont",
                "email": "jean.dupont@test.com",
            },
        )
        assert resp.status_code == 401

    def test_get_student_without_auth_returns_401(self):
        """GET /students/{id} sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.get(f"/api/v1/students/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_delete_student_without_auth_returns_401(self):
        """DELETE /students/{id} sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.delete(f"/api/v1/students/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_update_student_without_auth_returns_401(self):
        """PATCH /students/{id} sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.patch(
            f"/api/v1/students/{uuid.uuid4()}",
            json={"first_name": "Jean-Pierre"},
        )
        assert resp.status_code == 401


class TestTenantIsolation:
    """Vérifie l'isolation multi-tenant au niveau applicatif."""

    def test_request_without_tenant_header_gets_rejected(self):
        """Requête sans X-Tenant-ID sur endpoint tenant-aware → rejet."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        # Pas de header X-Tenant-ID, pas de token
        resp = client.get("/api/v1/students/")
        assert resp.status_code in (400, 401, 422)

    def test_role_permissions_mapping_complete(self):
        """Tous les rôles ont des permissions définies."""
        from app.core.security import ROLE_PERMISSIONS
        expected_roles = {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "TEACHER",
                         "STUDENT", "PARENT", "ALUMNI", "STAFF", "ACCOUNTANT"}
        for role in expected_roles:
            assert role in ROLE_PERMISSIONS, f"Role {role} manquant dans ROLE_PERMISSIONS"

    def test_student_cannot_access_finance(self):
        """STUDENT ne doit pas avoir de permission finance."""
        from app.core.security import ROLE_PERMISSIONS
        student_perms = ROLE_PERMISSIONS.get("STUDENT", [])
        assert "finance:read" not in student_perms
        assert "finance:write" not in student_perms

    def test_accountant_has_finance_permissions(self):
        """ACCOUNTANT doit avoir accès finance."""
        from app.core.security import ROLE_PERMISSIONS
        accountant_perms = ROLE_PERMISSIONS.get("ACCOUNTANT", [])
        assert "finance:read" in accountant_perms
        assert "finance:write" in accountant_perms
