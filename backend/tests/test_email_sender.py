"""EmailSender (backend/app/services/notifications.py) — Resend-first,
SMTP-fallback delivery logic (Render + Resend production-readiness audit).

Covers the exact contract the rest of the codebase depends on: send()
returns a real boolean reflecting whether a provider confirmed the send,
never raises, and tries SMTP only when Resend didn't succeed. No real
network calls are made — httpx.post (Resend) and smtplib.SMTP/SMTP_SSL
(SMTP) are monkeypatched.
"""
from unittest.mock import MagicMock

import pytest

from app.services.notifications import EmailSender


def _sender(**overrides) -> EmailSender:
    defaults = dict(
        resend_api_key="",
        smtp_host="",
        smtp_port=587,
        smtp_user="",
        smtp_pass="",
        from_email="noreply@example.test",
        from_name="Test Sender",
    )
    defaults.update(overrides)
    return EmailSender(**defaults)


class TestResendPath:
    def test_uses_resend_when_api_key_present_and_succeeds(self, monkeypatch):
        captured = {}

        def _fake_post(url, json, headers, timeout):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            resp = MagicMock()
            resp.status_code = 200
            resp.json.return_value = {"id": "resend-id-123"}
            return resp

        monkeypatch.setattr("app.services.notifications.httpx.post", _fake_post)

        sender = _sender(resend_api_key="re_test_key")
        result = sender.send(to="parent@example.test", subject="Hi", html="<p>hi</p>")

        assert result is True
        assert captured["url"] == "https://api.resend.com/emails"
        assert captured["json"]["to"] == ["parent@example.test"]
        assert captured["headers"]["Authorization"] == "Bearer re_test_key"

    def test_no_resend_key_skips_resend_entirely(self, monkeypatch):
        def _fail_if_called(*a, **kw):
            raise AssertionError("Resend must not be called without an API key")

        monkeypatch.setattr("app.services.notifications.httpx.post", _fail_if_called)

        sender = _sender(resend_api_key="")
        # No SMTP configured either -> should return False, not raise, and
        # must NOT have attempted a Resend call.
        result = sender.send(to="a@b.test", subject="x", html="<p>x</p>")
        assert result is False


class TestSmtpFallback:
    def test_falls_back_to_smtp_when_resend_fails(self, monkeypatch):
        def _resend_fails(url, json, headers, timeout):
            resp = MagicMock()
            resp.status_code = 403
            resp.json.return_value = {"error": "domain not verified"}
            return resp

        monkeypatch.setattr("app.services.notifications.httpx.post", _resend_fails)

        smtp_calls = {}

        class _FakeSmtp:
            def __init__(self, host, port, timeout=None):
                smtp_calls["host"] = host
                smtp_calls["port"] = port

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def ehlo(self):
                pass

            def starttls(self, context=None):
                smtp_calls["starttls"] = True

            def login(self, user, password):
                smtp_calls["login"] = (user, password)

            def sendmail(self, from_addr, to_addrs, msg):
                smtp_calls["sent"] = (from_addr, to_addrs)

        monkeypatch.setattr("app.services.notifications.smtplib.SMTP", _FakeSmtp)

        sender = _sender(
            resend_api_key="re_bad_key",
            smtp_host="smtp.example.test",
            smtp_port=587,
            smtp_user="user@example.test",
            smtp_pass="secret",
        )
        result = sender.send(to="parent@example.test", subject="Hi", html="<p>hi</p>")

        assert result is True
        assert smtp_calls["host"] == "smtp.example.test"
        assert smtp_calls["login"] == ("user@example.test", "secret")
        assert smtp_calls["sent"][1] == ["parent@example.test"]

    def test_smtp_uses_ssl_on_port_465(self, monkeypatch):
        """Port 465 is implicit TLS (SMTP_SSL), not STARTTLS — mixing the
        two protocols silently hangs against real mail servers."""
        monkeypatch.setattr(
            "app.services.notifications.httpx.post",
            lambda *a, **kw: MagicMock(status_code=500, json=lambda: {}),
        )

        calls = {}

        class _FakeSmtpSSL:
            def __init__(self, host, port, timeout=None, context=None):
                calls["used_ssl"] = True

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def ehlo(self):
                pass

            def login(self, user, password):
                pass

            def sendmail(self, from_addr, to_addrs, msg):
                pass

        def _fail_starttls(*a, **kw):
            raise AssertionError("STARTTLS SMTP must not be used for port 465")

        monkeypatch.setattr("app.services.notifications.smtplib.SMTP_SSL", _FakeSmtpSSL)
        monkeypatch.setattr("app.services.notifications.smtplib.SMTP", _fail_starttls)

        sender = _sender(smtp_host="smtp.example.test", smtp_port=465, smtp_user="u", smtp_pass="p")
        result = sender.send(to="a@b.test", subject="x", html="<p>x</p>")

        assert result is True
        assert calls["used_ssl"] is True

    def test_returns_false_when_both_resend_and_smtp_fail(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.notifications.httpx.post",
            lambda *a, **kw: MagicMock(status_code=500, json=lambda: {"error": "down"}),
        )

        def _raise(*a, **kw):
            raise ConnectionError("smtp unreachable")

        monkeypatch.setattr("app.services.notifications.smtplib.SMTP", _raise)

        sender = _sender(
            resend_api_key="re_key",
            smtp_host="smtp.example.test",
            smtp_user="u",
            smtp_pass="p",
        )
        result = sender.send(to="a@b.test", subject="x", html="<p>x</p>")
        assert result is False

    def test_smtp_never_attempted_without_host(self, monkeypatch):
        """No SMTP_HOST configured -> pure Resend-or-nothing, no crash from
        an empty-string smtplib.SMTP('', ...) call."""
        monkeypatch.setattr(
            "app.services.notifications.httpx.post",
            lambda *a, **kw: MagicMock(status_code=500, json=lambda: {}),
        )

        def _fail_if_called(*a, **kw):
            raise AssertionError("smtplib.SMTP must not be called without SMTP_HOST")

        monkeypatch.setattr("app.services.notifications.smtplib.SMTP", _fail_if_called)

        sender = _sender(resend_api_key="re_key", smtp_host="")
        result = sender.send(to="a@b.test", subject="x", html="<p>x</p>")
        assert result is False


class TestInputGuards:
    def test_rejects_recipient_without_at_sign(self, monkeypatch):
        def _fail_if_called(*a, **kw):
            raise AssertionError("No provider should be called for an invalid recipient")

        monkeypatch.setattr("app.services.notifications.httpx.post", _fail_if_called)

        sender = _sender(resend_api_key="re_key")
        assert sender.send(to="not-an-email", subject="x", html="<p>x</p>") is False

    def test_rejects_empty_recipient(self):
        sender = _sender(resend_api_key="re_key")
        assert sender.send(to="", subject="x", html="<p>x</p>") is False
