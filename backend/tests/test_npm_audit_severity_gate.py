"""Tests for scripts/ci/npm_audit_severity_gate.py.

P0 audit regression guard: CI's npm audit step used to parse the report
with an inline one-liner whose SyntaxError was swallowed, so it ALWAYS
reported zero high/critical vulnerabilities (a silent false negative).
These tests pin the behaviour that must never regress:
    * a HIGH/CRITICAL advisory that is not allowlisted fails the build,
    * an unparseable/unexpected report fails the build (never exits 0),
    * MODERATE/LOW advisories do not fail the build,
    * a documented, unexpired allowlist entry accepts exactly its advisory,
    * an EXPIRED allowlist entry stops applying and the advisory blocks again.
No network is used anywhere in this file.
"""
import datetime
import importlib.util
import json
import os

SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "scripts", "ci", "npm_audit_severity_gate.py",
)


def _load_module():
    spec = importlib.util.spec_from_file_location("npm_audit_severity_gate", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _advisory(*, severity="high", ghsa="GHSA-aaaa-bbbb-cccc", source=1, name="pkg", title="t"):
    via = {"severity": severity, "title": title, "name": name, "source": source}
    if ghsa:
        via["url"] = f"https://github.com/advisories/{ghsa}"
    return via


def _report(*advisories, pkg="pkg"):
    return {"vulnerabilities": {pkg: {"severity": "high", "via": list(advisories)}}}


def _write(tmp_path, report):
    p = tmp_path / "npm-audit.json"
    p.write_text(json.dumps(report))
    return str(p)


class TestFalseNegativeGuards:
    def test_high_advisory_not_allowlisted_exits_one(self, tmp_path, monkeypatch):
        """The core regression: a real HIGH must fail the build."""
        module = _load_module()
        path = _write(tmp_path, _report(_advisory(severity="high")))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1

    def test_critical_advisory_not_allowlisted_exits_one(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, _report(_advisory(severity="critical")))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1

    def test_unparseable_report_exits_nonzero(self, tmp_path, monkeypatch):
        """The exact failure the old one-liner swallowed into HIGH_COUNT=0."""
        module = _load_module()
        p = tmp_path / "broken.json"
        p.write_text("{ this is not valid json ")
        monkeypatch.setattr("sys.argv", ["gate", str(p)])
        assert module.main() == 2

    def test_unexpected_schema_exits_nonzero(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, {"totally": "different"})
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 2

    def test_high_advisory_without_identifier_is_fail_safe(self, tmp_path, monkeypatch):
        """A HIGH advisory with neither GHSA url nor source can't be
        allowlisted, so it must block rather than slip through."""
        module = _load_module()
        via = {"severity": "high", "title": "t", "name": "pkg"}  # no url, no source
        path = _write(tmp_path, {"vulnerabilities": {"pkg": {"severity": "high", "via": [via]}}})
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1

    def test_unknown_severity_is_fail_safe(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, _report(_advisory(severity="")))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1


class TestRegistryUnavailable:
    """2026-09: npmjs.org's audit "quick" endpoint (being retired) and its
    "bulk" replacement (mid-maintenance) both returned HTTP errors, so
    `npm audit --json` dumped npm's own HTTP-error envelope instead of a
    report — CI failed on every PR, unrelated to any real advisory. This
    pins the narrow carve-out: that exact envelope shape is treated as
    "audit unavailable" (non-blocking), while anything else without a
    `vulnerabilities` key still fails loudly as before (see
    test_unexpected_schema_exits_nonzero above, which must keep failing)."""

    def _registry_error(self, status=400, uri="https://registry.npmjs.org/-/npm/v1/security/audits/quick"):
        return {
            "message": f"{status} Bad Request - POST {uri} - Bad Request",
            "method": "POST",
            "uri": uri,
            "headers": {},
            "statusCode": status,
            "body": {"statusCode": status, "error": "Bad Request", "message": "..."},
            "error": {"summary": "", "detail": ""},
        }

    def test_npm_audit_endpoint_http_error_does_not_block(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, self._registry_error())
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_bulk_endpoint_503_does_not_block(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, self._registry_error(
            status=503, uri="https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
        ))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_unrelated_schema_without_registry_shape_still_blocks(self, tmp_path, monkeypatch):
        """The pre-existing regression guard must not regress: a report
        that merely lacks 'vulnerabilities' (not npm's specific HTTP-error
        envelope) still fails loudly."""
        module = _load_module()
        path = _write(tmp_path, {"totally": "different"})
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 2

    def test_missing_uri_still_blocks(self, tmp_path, monkeypatch):
        """statusCode alone (no uri) is not enough to match — avoids a
        narrow bypass via a partially-similar but unrelated payload."""
        module = _load_module()
        path = _write(tmp_path, {"statusCode": 400, "method": "POST"})
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 2

    def test_uri_not_pointing_at_npm_registry_still_blocks(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, self._registry_error(uri="https://evil.example.com/whatever"))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 2


class TestSeverityFloor:
    def test_no_vulnerabilities_exits_zero(self, tmp_path, monkeypatch):
        module = _load_module()
        path = _write(tmp_path, {"vulnerabilities": {}})
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_moderate_only_exits_zero(self, tmp_path, monkeypatch):
        module = _load_module()
        report = {"vulnerabilities": {"pkg": {"severity": "moderate", "via": [
            _advisory(severity="moderate", ghsa="GHSA-mmmm-mmmm-mmmm", source=2),
        ]}}}
        path = _write(tmp_path, report)
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_string_via_crossref_is_ignored(self, tmp_path, monkeypatch):
        """A package whose only `via` is a string (cross-ref to another
        package) carries no advisory payload and must not block on its own."""
        module = _load_module()
        report = {"vulnerabilities": {"parent": {"severity": "high", "via": ["child"]}}}
        path = _write(tmp_path, report)
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0


class TestAllowlist:
    def test_allowlisted_high_is_accepted(self, tmp_path, monkeypatch):
        module = _load_module()
        ident = "GHSA-test-accept-0001"
        monkeypatch.setattr(module, "ALLOWLIST", {ident: {
            "package": "pkg", "url": "u", "reason": "dev-only",
            "review_by": "2999-01-01", "tracking": "backlog",
        }})
        path = _write(tmp_path, _report(_advisory(severity="high", ghsa=ident)))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_expired_allowlist_entry_blocks_again(self, tmp_path, monkeypatch):
        module = _load_module()
        ident = "GHSA-test-expired-001"
        monkeypatch.setattr(module, "ALLOWLIST", {ident: {
            "package": "pkg", "url": "u", "reason": "dev-only",
            "review_by": "2000-01-01", "tracking": "backlog",
        }})
        monkeypatch.setattr(module, "_today", lambda: datetime.date(2026, 9, 12))
        path = _write(tmp_path, _report(_advisory(severity="high", ghsa=ident)))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1

    def test_allowlist_matches_by_numeric_source(self, tmp_path, monkeypatch):
        module = _load_module()
        monkeypatch.setattr(module, "ALLOWLIST", {"12345": {
            "package": "pkg", "url": "u", "reason": "dev-only",
            "review_by": "2999-01-01", "tracking": "backlog",
        }})
        path = _write(tmp_path, _report(_advisory(severity="high", ghsa=None, source=12345)))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_one_accepted_one_unlisted_still_fails(self, tmp_path, monkeypatch):
        module = _load_module()
        accepted = "GHSA-test-accept-0002"
        monkeypatch.setattr(module, "ALLOWLIST", {accepted: {
            "package": "pkg", "url": "u", "reason": "dev-only",
            "review_by": "2999-01-01", "tracking": "backlog",
        }})
        report = {"vulnerabilities": {
            "a": {"severity": "high", "via": [_advisory(severity="high", ghsa=accepted, source=7)]},
            "b": {"severity": "high", "via": [_advisory(severity="high", ghsa="GHSA-unlisted-0003", source=8)]},
        }}
        path = _write(tmp_path, report)
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1


class TestRealVitAdvisoryIsAccepted:
    """Guards that the real, shipped allowlist accepts exactly the vite
    dev-server HIGH (GHSA-fx2h-pf6j-xcff) and nothing broader."""

    def test_real_vite_high_is_accepted_by_default_allowlist(self, tmp_path, monkeypatch):
        module = _load_module()
        # Do NOT patch ALLOWLIST — exercise the shipped one.
        monkeypatch.setattr(module, "_today", lambda: datetime.date(2026, 9, 12))
        path = _write(tmp_path, _report(
            _advisory(severity="high", ghsa="GHSA-fx2h-pf6j-xcff", source=99, name="vite"),
        ))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 0

    def test_a_different_vite_high_still_blocks(self, tmp_path, monkeypatch):
        """Allowlisting the one known advisory must not blanket-accept vite."""
        module = _load_module()
        monkeypatch.setattr(module, "_today", lambda: datetime.date(2026, 9, 12))
        path = _write(tmp_path, _report(
            _advisory(severity="high", ghsa="GHSA-future-vite-9999", source=100, name="vite"),
        ))
        monkeypatch.setattr("sys.argv", ["gate", path])
        assert module.main() == 1
