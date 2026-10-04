"""Comparaisons de secrets en temps constant (régression, 2026-10)."""
from unittest.mock import patch

from conftest import get_test_client

client = get_test_client()

from app.services.whatsapp_service import verify_webhook  # noqa: E402


class TestWhatsAppVerifyToken:
    def test_matching_token_returns_challenge_via_compare_digest(self):
        with patch("hmac.compare_digest", wraps=__import__("hmac").compare_digest) as spy:
            assert verify_webhook("subscribe", "tok-123", "challenge-x", "tok-123") == "challenge-x"
        spy.assert_called_once()

    def test_wrong_or_missing_token_is_refused(self):
        assert verify_webhook("subscribe", "tok-124", "c", "tok-123") is None
        assert verify_webhook("subscribe", None, "c", "tok-123") is None
        assert verify_webhook("subscribe", "", "c", "tok-123") is None

    def test_empty_expected_token_never_matches(self):
        assert verify_webhook("subscribe", "", "c", "") is None

    def test_wrong_mode_is_refused(self):
        assert verify_webhook("unsubscribe", "tok-123", "c", "tok-123") is None


class TestBearerSecretHelper:
    def _req(self, auth):
        class _R:
            headers = {"Authorization": auth} if auth is not None else {}
        return _R()

    def test_bearer_match_uses_compare_digest(self):
        from app.main import _bearer_secret_matches

        with patch("hmac.compare_digest", return_value=True) as spy:
            assert _bearer_secret_matches(self._req("Bearer s3cret"), "s3cret") is True
        spy.assert_called_once()

    def test_missing_or_malformed_header_refused(self):
        from app.main import _bearer_secret_matches

        assert _bearer_secret_matches(self._req(None), "s3cret") is False
        assert _bearer_secret_matches(self._req("s3cret"), "s3cret") is False
        assert _bearer_secret_matches(self._req("Bearer "), "s3cret") is False
        assert _bearer_secret_matches(self._req("Bearer s3cret"), "") is False
