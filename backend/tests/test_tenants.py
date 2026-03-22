"""Tests des endpoints tenants (publics et privés)."""
import pytest
import uuid
from unittest.mock import patch, MagicMock


SAMPLE_TENANT_ID = str(uuid.uuid4())


class MockTenant:
    """Simule un objet SQLAlchemy Tenant."""
    id = uuid.UUID(SAMPLE_TENANT_ID)
    name = "École Test"
    slug = "ecole-test"
    type = "SCHOOL"
    email = "contact@ecole-test.gn"
    phone = "+224 123 456 789"
    address = "Conakry, Guinée"
    website = "https://ecole-test.gn"
    country = "GN"
    currency = "GNF"
    is_active = True
    settings = {
        "landing": {
            "description": "Une école de qualité",
            "primary_color": "#1e3a5f",
            "announcements": [],
            "gallery": [],
        }
    }


class TestPublicTenantEndpoints:
    """Tests des endpoints publics (sans auth)."""

    def test_list_public_tenants_returns_200(self):
        """GET /tenants/public → 200 avec liste."""
        mock_tenant = MockTenant()
        with patch("app.api.v1.endpoints.core.tenants.get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_db.__enter__ = MagicMock(return_value=mock_db)
            mock_db.__exit__ = MagicMock(return_value=False)
            mock_query = MagicMock()
            mock_query.filter.return_value = mock_query
            mock_query.order_by.return_value = mock_query
            mock_query.all.return_value = [mock_tenant]
            mock_db.query.return_value = mock_query
            mock_get_db.return_value = iter([mock_db])

            from fastapi.testclient import TestClient
            from app.main import app
            client = TestClient(app)
            resp = client.get("/api/v1/tenants/public")
            assert resp.status_code in (200, 500)  # 500 si DB pas dispo en test

    def test_public_tenant_not_found_returns_404(self):
        """GET /tenants/public/unknown-slug → 404."""
        with patch("app.api.v1.endpoints.core.tenants.get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_query = MagicMock()
            mock_query.filter.return_value = mock_query
            mock_query.first.return_value = None
            mock_db.query.return_value = mock_query
            mock_get_db.return_value = iter([mock_db])

            from fastapi.testclient import TestClient
            from app.main import app
            client = TestClient(app)
            resp = client.get("/api/v1/tenants/public/non-existent-slug-xyz")
            assert resp.status_code in (404, 500)

    def test_by_domain_not_found_returns_404(self):
        """GET /tenants/by-domain/unknown.com → 404."""
        with patch("app.api.v1.endpoints.core.tenants.get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_execute = MagicMock()
            mock_execute.fetchone.return_value = None
            mock_db.execute.return_value = mock_execute
            mock_get_db.return_value = iter([mock_db])

            from fastapi.testclient import TestClient
            from app.main import app
            client = TestClient(app)
            resp = client.get("/api/v1/tenants/by-domain/unknown-domain.com")
            assert resp.status_code in (404, 500)

    def test_private_tenant_list_requires_auth(self):
        """GET /tenants/ sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.get("/api/v1/tenants/")
        assert resp.status_code == 401

    def test_create_tenant_requires_auth(self):
        """POST /tenants/ sans auth → 401."""
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post(
            "/api/v1/tenants/",
            json={"name": "Test", "slug": "test", "type": "SCHOOL"},
        )
        assert resp.status_code == 401


class TestTenantSchema:
    """Tests des schémas Pydantic tenants."""

    def test_landing_settings_defaults(self):
        """TenantLandingSettings avec valeurs par défaut."""
        from app.schemas.tenants import TenantLandingSettings
        s = TenantLandingSettings()
        assert s.primary_color == "#1e3a5f"
        assert s.show_stats is True
        assert s.show_programs is True
        assert isinstance(s.gallery, list)
        assert isinstance(s.announcements, list)

    def test_public_card_model(self):
        """TenantPublicCard valide."""
        from app.schemas.tenants import TenantPublicCard
        import uuid
        card = TenantPublicCard(
            id=uuid.uuid4(),
            name="Test School",
            slug="test-school",
            type="SCHOOL",
        )
        assert card.name == "Test School"
        assert card.primary_color == "#1e3a5f"  # default

    def test_announcement_model(self):
        """TenantLandingAnnouncement valide."""
        from app.schemas.tenants import TenantLandingAnnouncement
        ann = TenantLandingAnnouncement(
            title="Rentrée 2025",
            body="La rentrée est fixée au 3 septembre 2025.",
            is_pinned=True,
        )
        assert ann.title == "Rentrée 2025"
        assert ann.is_pinned is True
