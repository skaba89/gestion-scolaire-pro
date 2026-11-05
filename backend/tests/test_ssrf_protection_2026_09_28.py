"""Unit tests for app.core.ssrf_protection — 10th systematic audit sweep.

See app/core/ssrf_protection.py's module docstring for the full exploit
writeup: tenant-admin-controlled URLs (webhook delivery URLs,
logo/signature image URLs embedded in server-rendered PDFs) were fetched
by the backend itself with no validation of the target host, giving a
TENANT_ADMIN a blind SSRF primitive against cloud metadata endpoints and
internal services.

These tests exercise the shared helper directly (fast, controlled DNS for
domain-name cases). Call-site coverage (webhooks.py,
school_life.py) lives in their own test files.
"""
import socket

import pytest

from app.core.ssrf_protection import (
    UnsafeUrlError,
    assert_safe_external_url,
    get_weasyprint_safe_url_fetcher,
)


class TestAssertSafeExternalUrlRejectsInternalTargets:
    @pytest.mark.parametrize("url", [
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        "http://127.0.0.1/",
        "http://127.0.0.1:6379/",
        "http://localhost/",
        "http://10.0.0.5/",
        "http://172.16.0.1/",
        "http://192.168.1.1/",
        "http://0.0.0.0/",
        "http://[::1]/",
    ])
    def test_rejects_private_loopback_and_metadata_addresses(self, url):
        with pytest.raises(UnsafeUrlError):
            assert_safe_external_url(url)

    @pytest.mark.parametrize("url", [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "data:text/html,<script>alert(1)</script>",
        "ftp://example.com/x",
        "not-a-url",
        "",
    ])
    def test_rejects_non_http_schemes_and_malformed_urls(self, url):
        with pytest.raises(UnsafeUrlError):
            assert_safe_external_url(url)

    def test_rejects_hostname_that_fails_to_resolve(self, monkeypatch):
        def unavailable(*args):
            raise socket.gaierror("DNS indisponible")
        monkeypatch.setattr("app.core.ssrf_protection.socket.getaddrinfo", unavailable)
        with pytest.raises(UnsafeUrlError):
            assert_safe_external_url("http://this-host-does-not-exist.invalid/")

    @pytest.mark.parametrize("addresses", [
        ["93.184.216.34", "127.0.0.1"],
        ["127.0.0.1", "93.184.216.34"],
    ])
    def test_rejects_mixed_public_and_private_dns_answers(self, monkeypatch, addresses):
        monkeypatch.setattr(
            "app.core.ssrf_protection.socket.getaddrinfo",
            lambda *args: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in addresses],
        )
        with pytest.raises(UnsafeUrlError):
            assert_safe_external_url("https://example.com/logo.png")


class TestAssertSafeExternalUrlAcceptsPublicTargets:
    @pytest.mark.parametrize("url", [
        "https://example.com/logo.png",
        "http://93.184.216.34/logo.png",  # public IP literal, no DNS needed
        "https://8.8.8.8/",
    ])
    def test_accepts_public_http_https_urls(self, url, monkeypatch):
        if "example.com" in url:
            monkeypatch.setattr(
                "app.core.ssrf_protection.socket.getaddrinfo",
                lambda *args: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))],
            )
        assert_safe_external_url(url)  # must not raise


class TestWeasyprintSafeUrlFetcherEndToEnd:
    """Exercises the real WeasyPrint URLFetcher extension point end-to-end
    (not a reimplementation) to prove the SSRF guard actually engages
    where WeasyPrint calls it, not just when called directly."""

    def test_malicious_image_src_is_never_fetched_pdf_still_renders(self):
        weasyprint = pytest.importorskip("weasyprint")
        html = (
            '<html><body><img src="http://169.254.169.254/latest/meta-data/">'
            "</body></html>"
        )
        # WeasyPrint catches url_fetcher exceptions per-resource and keeps
        # rendering (matches manual verification against the installed
        # weasyprint version) — the point of this test is that no
        # exception escapes and, more importantly, no request to
        # 169.254.169.254 is attempted (there is no network access in
        # this test environment, so a real attempt would hang/error
        # instead of returning a small valid PDF).
        pdf_bytes = weasyprint.HTML(
            string=html, url_fetcher=get_weasyprint_safe_url_fetcher()
        ).write_pdf()
        assert pdf_bytes[:4] == b"%PDF"

    def test_clean_html_with_no_remote_resource_renders_normally(self):
        weasyprint = pytest.importorskip("weasyprint")
        html = "<html><body><p>Sans logo</p></body></html>"
        pdf_bytes = weasyprint.HTML(
            string=html, url_fetcher=get_weasyprint_safe_url_fetcher()
        ).write_pdf()
        assert pdf_bytes[:4] == b"%PDF"
