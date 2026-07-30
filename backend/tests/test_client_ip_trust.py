"""_get_client_ip() (app/main.py) — trusted-proxy detection for the rate
limiter's key function.

Regression: the previous implementation checked
`client_host.startswith("10.0.0.0")` against literal network-address
strings instead of checking CIDR membership. A real internal Render
proxy address like "10.0.4.23" never starts with the literal string
"10.0.0.0", so it was NEVER trusted — every request fell through to
get_remote_address() (the direct TCP peer, i.e. the shared edge
connection behind Render/Cloudflare), collapsing all external clients
onto one shared rate-limit bucket. Found live: a single visitor
exhausted the bootstrap endpoint's 5/minute limit and it never
recovered until the in-memory limiter was restarted.
"""
from types import SimpleNamespace

from app.main import _get_client_ip


def _make_request(client_host: str | None, forwarded_for: str | None = None):
    client = SimpleNamespace(host=client_host) if client_host is not None else None
    headers = {}
    if forwarded_for is not None:
        headers["X-Forwarded-For"] = forwarded_for
    return SimpleNamespace(client=client, headers=headers)


class TestTrustedProxyRanges:
    def test_render_internal_ip_in_10_slash_8_is_trusted(self):
        """The exact bug: "10.0.4.23" never matched the old
        startswith("10.0.0.0") check."""
        request = _make_request("10.0.4.23", forwarded_for="203.0.113.7")
        assert _get_client_ip(request) == "203.0.113.7"

    def test_render_internal_ip_in_172_16_slash_12_is_trusted(self):
        request = _make_request("172.20.5.9", forwarded_for="203.0.113.7")
        assert _get_client_ip(request) == "203.0.113.7"

    def test_render_internal_ip_in_192_168_slash_16_is_trusted(self):
        request = _make_request("192.168.1.1", forwarded_for="203.0.113.7")
        assert _get_client_ip(request) == "203.0.113.7"

    def test_loopback_is_trusted(self):
        request = _make_request("127.0.0.1", forwarded_for="203.0.113.7")
        assert _get_client_ip(request) == "203.0.113.7"

    def test_takes_first_hop_from_forwarded_chain(self):
        request = _make_request("10.0.4.23", forwarded_for="203.0.113.7, 10.0.4.1")
        assert _get_client_ip(request) == "203.0.113.7"


class TestUntrustedSourcesCannotSpoof:
    def test_public_ip_is_never_trusted_even_with_forwarded_header(self):
        """SECURITY: a direct client outside the trusted ranges must not be
        able to set X-Forwarded-For to bypass rate limiting."""
        request = _make_request("198.51.100.42", forwarded_for="1.2.3.4")
        assert _get_client_ip(request) == "198.51.100.42"

    def test_ip_just_outside_10_slash_8_is_not_trusted(self):
        request = _make_request("11.0.0.1", forwarded_for="1.2.3.4")
        assert _get_client_ip(request) == "11.0.0.1"

    def test_ip_just_outside_172_16_slash_12_is_not_trusted(self):
        # 172.32.0.0 is outside 172.16.0.0/12 (which covers 172.16-172.31)
        request = _make_request("172.32.0.1", forwarded_for="1.2.3.4")
        assert _get_client_ip(request) == "172.32.0.1"

    def test_no_forwarded_header_falls_back_to_direct_address_even_if_trusted(self):
        request = _make_request("10.0.4.23")
        assert _get_client_ip(request) == "10.0.4.23"


class TestMalformedInput:
    def test_missing_client_does_not_crash(self):
        request = _make_request(None, forwarded_for="1.2.3.4")
        # get_remote_address() handles a None request.client internally.
        assert _get_client_ip(request) == "127.0.0.1" or isinstance(_get_client_ip(request), str)

    def test_non_ip_client_host_does_not_crash(self):
        """A malformed/spoofed Host-like string in request.client.host (should
        not happen in practice, but must never raise) is treated as untrusted."""
        request = _make_request("not-an-ip", forwarded_for="1.2.3.4")
        assert _get_client_ip(request) == "not-an-ip"
