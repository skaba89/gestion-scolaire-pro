"""app/main.py's CORS origin setup — 8th systematic audit sweep.

BACKEND_CORS_ORIGINS="*" was silently exempted from the https:// prefix
coercion but never actually rejected, and allow_credentials is
unconditionally True — CORSMiddleware(allow_origins=["*"],
allow_credentials=True) makes Starlette reflect the caller's own Origin
header with Access-Control-Allow-Credentials: true (verified against
Starlette's CORSMiddleware.send()), i.e. "any origin, with credentials"
for every request, the opposite of what a since-corrected inline comment
in main.py previously (wrongly) claimed was "impossible". Bearer-token-only
auth (no cookies anywhere in this codebase) limits today's real-world
exploitability, but an operator setting BACKEND_CORS_ORIGINS=* (a plausible
misconfiguration) should still be refused outright rather than silently
accepted.

_normalize_cors_origins()/_reject_wildcard_origin() were extracted from
main.py's module-level CORS setup specifically so this can be unit-tested
without needing to reload the whole app under different environments.
"""
import pytest

from app.main import _normalize_cors_origins, _reject_wildcard_origin


class TestNormalizeCorsOrigins:
    def test_bare_hostname_gets_https_prefix(self):
        assert _normalize_cors_origins("site.onrender.com") == ["https://site.onrender.com"]

    def test_explicit_scheme_is_preserved(self):
        assert _normalize_cors_origins("http://localhost:5173") == ["http://localhost:5173"]

    def test_comma_separated_list_is_split_and_trimmed(self):
        result = _normalize_cors_origins(" https://a.example.com , b.example.com ")
        assert result == ["https://a.example.com", "https://b.example.com"]

    def test_wildcard_is_not_coerced_to_a_url(self):
        assert _normalize_cors_origins("*") == ["*"]

    def test_list_input_is_stringified(self):
        assert _normalize_cors_origins(["a.example.com"]) == ["https://a.example.com"]


class TestRejectWildcardOrigin:
    def test_wildcard_alone_is_rejected(self):
        with pytest.raises(ValueError):
            _reject_wildcard_origin(["*"])

    def test_wildcard_among_real_origins_is_rejected(self):
        with pytest.raises(ValueError):
            _reject_wildcard_origin(["https://app.example.com", "*"])

    def test_explicit_origins_without_wildcard_are_accepted(self):
        _reject_wildcard_origin(["https://app.example.com", "https://admin.example.com"])  # no raise

    def test_empty_list_is_accepted(self):
        _reject_wildcard_origin([])  # no raise
