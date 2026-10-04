"""Sécurité de GET /api/v1/auth/login-diagnostics/ (régression, 2026-10).

Avant : secret en query string (journaux d'accès), comparaison ``!=`` non
constante, réponse contenant les 30 premiers caractères de DATABASE_URL_SYNC,
les messages d'exception bruts (hôte/utilisateur), l'email/id de l'admin et la
longueur des secrets.
"""
import json
from unittest.mock import patch

import pytest

from conftest import get_test_client

client = get_test_client()

from app.api.v1.endpoints.core import auth as auth_module  # noqa: E402
from app.core.config import settings  # noqa: E402

ENDPOINT = "/api/v1/auth/login-diagnostics/"
HEADER = "X-Bootstrap-Secret"


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    auth_module.limiter.reset()
    yield
    auth_module.limiter.reset()


def _forbidden_values():
    vals = [settings.BOOTSTRAP_SECRET, settings.SECRET_KEY]
    for url in (settings.DATABASE_URL, settings.DATABASE_URL_SYNC, settings.DATABASE_URL_ASYNC):
        if url:
            vals.extend([url, url[:30]])
    if settings.ADMIN_DEFAULT_EMAIL:
        vals.append(settings.ADMIN_DEFAULT_EMAIL)
    return [v for v in vals if v]


class TestAccessControl:
    def test_missing_secret_is_refused(self):
        assert client.get(ENDPOINT).status_code == 403

    def test_wrong_secret_is_refused(self):
        assert client.get(ENDPOINT, headers={HEADER: "wrong-secret-value"}).status_code == 403

    def test_correct_secret_in_query_string_is_refused(self):
        """Le secret ne doit plus jamais être accepté dans l'URL."""
        resp = client.get(ENDPOINT, params={"secret": settings.BOOTSTRAP_SECRET})
        assert resp.status_code == 403

    def test_refusal_does_not_echo_secret_or_hint_query_param(self):
        body = client.get(ENDPOINT, params={"secret": "x"}).text
        assert "?secret=" not in body
        assert settings.BOOTSTRAP_SECRET not in body

    def test_correct_secret_in_header_is_accepted(self):
        assert client.get(ENDPOINT, headers={HEADER: settings.BOOTSTRAP_SECRET}).status_code == 200

    def test_empty_configured_secret_refuses_everything(self, monkeypatch):
        monkeypatch.setattr(settings, "BOOTSTRAP_SECRET", "")
        assert client.get(ENDPOINT, headers={HEADER: ""}).status_code == 403


class TestConstantTimeComparison:
    def test_uses_hmac_compare_digest(self):
        with patch("hmac.compare_digest", return_value=True) as spy:
            assert auth_module._bootstrap_secret_matches("anything") is True
        spy.assert_called_once()

    def test_empty_values_never_match(self, monkeypatch):
        monkeypatch.setattr(settings, "BOOTSTRAP_SECRET", "")
        assert auth_module._bootstrap_secret_matches("") is False
        assert auth_module._bootstrap_secret_matches(None) is False


class TestNoSensitiveDataInResponse:
    def test_response_contains_no_credentials_or_identifiers(self):
        resp = client.get(ENDPOINT, headers={HEADER: settings.BOOTSTRAP_SECRET})
        assert resp.status_code == 200
        text = resp.text
        for value in _forbidden_values():
            assert value not in text, "valeur sensible présente dans la réponse"
        for marker in ("url_prefix", "_LENGTH", "traceback", "postgresql://", "postgresql+", "sqlite:///", "expected_email"):
            assert marker not in text
        admin = resp.json()["components"].get("admin_user", {})
        assert set(admin) <= {"status", "is_active", "has_password_hash", "default_password_check"}

    def test_database_error_returns_type_only_not_message(self):
        leaky = RuntimeError("could not connect to host secret-db.example.internal user=owner password=hunter2")

        class _Boom:
            def execute(self, *a, **k):
                raise leaky

        from app.core.database import get_db
        from app.main import app

        app.dependency_overrides[get_db] = lambda: _Boom()
        try:
            resp = client.get(ENDPOINT, headers={HEADER: settings.BOOTSTRAP_SECRET})
        finally:
            app.dependency_overrides.pop(get_db, None)
        assert resp.status_code == 200
        body = resp.json()
        assert body["components"]["database"] == {"status": "error", "error_type": "RuntimeError"}
        dumped = json.dumps(body)
        for fragment in ("secret-db.example.internal", "hunter2", "user=owner"):
            assert fragment not in dumped
