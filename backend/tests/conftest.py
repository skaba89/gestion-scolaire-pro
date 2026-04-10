"""
Fixtures pytest pour les tests SchoolFlow Pro.
Utilise une base SQLite en mémoire pour isolation totale.
"""
import pytest
import uuid
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Patcher les dépendances externes avant l'import de l'app
import sys
import os
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-32chars")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")


SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test_schoolflow.db"

# ─── Base de données test ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(
        SQLALCHEMY_TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    return engine


@pytest.fixture(scope="session")
def test_session_factory(test_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


# ─── Données fictives ───────────────────────────────────────────────────────────

MOCK_TENANT_ID = str(uuid.uuid4())
MOCK_USER_ID = str(uuid.uuid4())

MOCK_TENANT = {
    "id": MOCK_TENANT_ID,
    "name": "École Test",
    "slug": "ecole-test",
    "type": "SCHOOL",
    "country": "GN",
    "currency": "GNF",
    "timezone": "Africa/Conakry",
    "email": "contact@ecole-test.gn",
    "phone": "+224 123 456 789",
    "address": "Conakry, Guinée",
    "website": "https://ecole-test.gn",
    "is_active": True,
    "settings": {
        "landing": {
            "description": "Une école d'excellence",
            "tagline": "Former les leaders de demain",
            "primary_color": "#1e3a5f",
            "secondary_color": "#4a90d9",
        }
    },
}

MOCK_USER = {
    "id": MOCK_USER_ID,
    "email": "admin@ecole-test.gn",
    "first_name": "Admin",
    "last_name": "Test",
    "username": "admin.test",
    "roles": ["TENANT_ADMIN"],
    "tenant_id": MOCK_TENANT_ID,
}

MOCK_SUPER_ADMIN = {
    "id": str(uuid.uuid4()),
    "email": "superadmin@schoolflow.com",
    "first_name": "Super",
    "last_name": "Admin",
    "username": "superadmin",
    "roles": ["SUPER_ADMIN"],
    "tenant_id": None,
}

MOCK_STUDENT_USER = {
    "id": str(uuid.uuid4()),
    "email": "student@ecole-test.gn",
    "first_name": "Etudiant",
    "last_name": "Test",
    "username": "student.test",
    "roles": ["STUDENT"],
    "tenant_id": MOCK_TENANT_ID,
}

MOCK_JWT_TOKEN = {
    "sub": MOCK_USER_ID,
    "email": "admin@ecole-test.gn",
    "given_name": "Admin",
    "family_name": "Test",
    "preferred_username": "admin.test",
    "realm_access": {"roles": ["TENANT_ADMIN"]},
    "tenant_id": MOCK_TENANT_ID,
}


# ─── Client HTTP test ───────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    """Client FastAPI de test avec toutes les dépendances externes mockées."""
    with patch("app.core.database.create_engine"), \
         patch("app.core.cache.redis.Redis"):

        from app.main import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def auth_headers():
    """En-têtes d'authentification pour un TENANT_ADMIN."""
    return {
        "Authorization": "Bearer mock-valid-token",
        "X-Tenant-ID": MOCK_TENANT_ID,
    }


@pytest.fixture
def super_admin_headers():
    """En-têtes d'authentification pour un SUPER_ADMIN."""
    return {
        "Authorization": "Bearer mock-super-admin-token",
        "X-Tenant-ID": MOCK_TENANT_ID,
    }


@pytest.fixture
def student_headers():
    """En-têtes d'authentification pour un STUDENT."""
    return {
        "Authorization": "Bearer mock-student-token",
        "X-Tenant-ID": MOCK_TENANT_ID,
    }


@pytest.fixture
def mock_current_user():
    """Mock de get_current_user retournant un TENANT_ADMIN."""
    return MOCK_USER


@pytest.fixture
def mock_super_admin_user():
    """Mock de get_current_user retournant un SUPER_ADMIN."""
    return MOCK_SUPER_ADMIN
