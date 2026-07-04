"""Tests de l'endpoint /auth/bootstrap/ (création super-admin).

Régression couverte : la requête de garde utilisait `users.role` (colonne
inexistante — les rôles vivent dans user_roles) → 500 systématique.
"""
import os
import uuid

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")

import pytest
from conftest import get_test_client

client = get_test_client()

BOOTSTRAP_URL = "/api/v1/auth/bootstrap/"
GOOD_SECRET = os.environ["BOOTSTRAP_SECRET"]
STRONG_PASSWORD = "Sup3r@dmin!2026-Guinee"


@pytest.fixture(scope="module", autouse=True)
def _create_schema():
    """Crée les tables sur la base SQLite de test (le lifespan noop ne le fait pas)
    et désactive le rate-limiter (5/min sur bootstrap → 429 dès le 6e appel du module)."""
    from app.core.database import Base, engine
    # auth.py possède sa propre instance de Limiter (pas app.state.limiter)
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    import app.models  # noqa: F401 — register all models

    Base.metadata.create_all(bind=engine)
    previous = auth_limiter.enabled
    auth_limiter.enabled = False
    yield
    auth_limiter.enabled = previous


def _delete_all_super_admins():
    """Nettoie users/user_roles pour retrouver l'état 'aucun super admin'."""
    from app.core.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM user_roles WHERE role = 'SUPER_ADMIN'"))
        db.execute(text("DELETE FROM users"))
        db.commit()
    finally:
        db.close()


class TestBootstrapSecurity:
    def test_bootstrap_refuses_wrong_secret(self):
        """Mauvais secret → 403, sans toucher à la base."""
        resp = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": "wrong-secret", "new_password": STRONG_PASSWORD},
        )
        assert resp.status_code == 403

    def test_bootstrap_refuses_empty_secret(self):
        """Secret vide → 403."""
        resp = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": "", "new_password": STRONG_PASSWORD},
        )
        assert resp.status_code == 403

    def test_bootstrap_refuses_weak_password(self):
        """Bon secret mais mot de passe faible → 400 (jamais 500)."""
        _delete_all_super_admins()
        resp = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": GOOD_SECRET, "new_password": "short"},
        )
        assert resp.status_code == 400


class TestBootstrapLifecycle:
    def test_bootstrap_creates_super_admin_when_none_exists(self):
        """Aucun SUPER_ADMIN → bootstrap crée le compte (régression users.role)."""
        _delete_all_super_admins()
        resp = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": GOOD_SECRET, "new_password": STRONG_PASSWORD},
        )
        # Avant le fix : 500 (ProgrammingError sur users.role). Après : 200.
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "ok"
        assert data["user_in_db"] is not None
        assert data["user_in_db"]["is_active"] in (True, 1)
        # SECURITY: le mot de passe ne doit jamais apparaître dans la réponse
        assert STRONG_PASSWORD not in resp.text

    def test_bootstrap_refused_when_super_admin_exists(self):
        """Un SUPER_ADMIN existe déjà → 403 (usage unique)."""
        # Le test précédent a créé le super admin ; sinon on le crée.
        first = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": GOOD_SECRET, "new_password": STRONG_PASSWORD},
        )
        second = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": GOOD_SECRET, "new_password": STRONG_PASSWORD},
        )
        assert second.status_code == 403

    def test_login_works_after_bootstrap(self):
        """Après bootstrap, le super-admin peut se connecter."""
        _delete_all_super_admins()
        boot = client.post(
            BOOTSTRAP_URL,
            json={"bootstrap_key": GOOD_SECRET, "new_password": STRONG_PASSWORD},
        )
        assert boot.status_code == 200, boot.text
        admin_email = boot.json()["credentials"]["email"]

        resp = client.post(
            "/api/v1/auth/login/",
            data={"username": admin_email, "password": STRONG_PASSWORD},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
