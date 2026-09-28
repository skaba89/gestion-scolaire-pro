"""SSRF guard for outbound HTTP requests built from tenant-controlled input.

10th systematic audit sweep (2026-09-28): tenant admins can configure URLs
that the backend later fetches itself — webhook delivery URLs
(api/v1/endpoints/core/webhooks.py) and logo/signature image URLs embedded
in server-rendered PDFs (WeasyPrint, api/v1/endpoints/operational/
school_life.py). Neither path validated the target host, so a TENANT_ADMIN
(not even SUPER_ADMIN — a permission any school admin holds) could point
either one at http://169.254.169.254/... (cloud metadata), an internal
service (Redis, the DB, another tenant's traffic), or localhost, and use
the response (webhook "success" boolean, or PDF render success/failure) as
a blind SSRF oracle.

This module is the single place that decides whether a URL is safe to
fetch server-side. It resolves the hostname and rejects anything that
lands in a private/loopback/link-local/multicast/reserved range, so a
DNS name that merely *points at* an internal address is caught the same
as a literal IP — resolving before checking, not string-matching the
host, is the point.
"""
import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}


class UnsafeUrlError(ValueError):
    """Raised when a URL is not safe for the backend to fetch itself."""


def _is_public_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_safe_external_url(url: str) -> None:
    """Raise UnsafeUrlError if ``url`` must not be fetched by the backend.

    Checks: scheme is http(s) only, a hostname is present, and EVERY IP
    address that hostname resolves to (a name can resolve to several, and
    an attacker only needs one to be public to get pending DNS-rebinding
    to a private one to slip a naive first-match check) is a public,
    routable address.
    """
    try:
        parsed = urlparse(url)
    except ValueError as exc:
        raise UnsafeUrlError(f"URL invalide : {exc}") from exc

    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("Seuls les liens http:// ou https:// sont autorisés.")

    hostname = parsed.hostname
    if not hostname:
        raise UnsafeUrlError("URL invalide : aucun nom d'hôte.")

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Impossible de résoudre l'hôte « {hostname} ».") from exc

    if not addr_infos:
        raise UnsafeUrlError(f"Impossible de résoudre l'hôte « {hostname} ».")

    for info in addr_infos:
        ip_str = info[4][0]
        if not _is_public_ip(ip_str):
            raise UnsafeUrlError(
                f"L'hôte « {hostname} » pointe vers une adresse interne/privée "
                "et ne peut pas être utilisé ici."
            )


def get_weasyprint_safe_url_fetcher():
    """Build a WeasyPrint ``url_fetcher`` that SSRF-checks every resource.

    WeasyPrint fetches every remote resource (<img src="...">, etc.)
    referenced in HTML it renders — including a tenant admin's own
    logoUrl/director_signature_url/secretary_signature_url, embedded
    unvalidated into report-card/certificate PDFs
    (operational/school_life.py). Pass the returned instance as
    ``HTML(..., url_fetcher=...)`` so every such fetch goes through
    assert_safe_external_url first, instead of letting WeasyPrint hit an
    internal address directly.

    WeasyPrint's ``url_fetcher`` is a ``weasyprint.urls.URLFetcher``
    instance (a subclass with an overridden ``fetch()`` is the documented
    extension point — there is no standalone fetch function to wrap).
    Redirects are disabled: an attacker-controlled host that first
    resolves to a public IP could otherwise 302 straight to an internal
    one at fetch time, after our pre-check already passed.
    """
    from weasyprint.urls import URLFetcher

    class _SafeURLFetcher(URLFetcher):
        def fetch(self, url, headers=None):
            assert_safe_external_url(url)
            return super().fetch(url, headers)

    return _SafeURLFetcher(allowed_protocols=("http", "https"), allow_redirects=False)
