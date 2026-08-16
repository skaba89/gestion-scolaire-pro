"""Tests for scripts/pip_audit_severity_gate.py — audit finding (round 2,
Medium): CI's pip-audit step had no severity floor, unlike the sibling npm
audit step (--audit-level=high). OSV network calls are monkeypatched
throughout — no real HTTP in this test file.
"""
import importlib.util
import os

SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "scripts", "pip_audit_severity_gate.py",
)


def _load_module():
    spec = importlib.util.spec_from_file_location("pip_audit_severity_gate", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _vuln(vid="PYSEC-1", aliases=None):
    return {"id": vid, "aliases": aliases or [], "fix_versions": [], "description": ""}


def _report(*, name="pkg", version="1.0.0", vulns=None):
    return {"dependencies": [{"name": name, "version": version, "vulns": vulns or []}]}


class TestResolveSeverity:
    def test_uses_the_finding_own_id_first(self, monkeypatch):
        module = _load_module()
        calls = []

        def fake_fetch(vuln_id):
            calls.append(vuln_id)
            return "HIGH" if vuln_id == "PYSEC-1" else None

        monkeypatch.setattr(module, "_fetch_severity", fake_fetch)
        severity = module.resolve_severity(_vuln("PYSEC-1", aliases=["GHSA-xxx"]))
        assert severity == "HIGH"
        assert calls[0] == "PYSEC-1"

    def test_falls_back_to_aliases_when_own_id_has_no_severity(self, monkeypatch):
        module = _load_module()

        def fake_fetch(vuln_id):
            return "CRITICAL" if vuln_id == "GHSA-yyy" else None

        monkeypatch.setattr(module, "_fetch_severity", fake_fetch)
        severity = module.resolve_severity(_vuln("PYSEC-2", aliases=["GHSA-xxx", "GHSA-yyy"]))
        assert severity == "CRITICAL"

    def test_returns_none_when_nothing_resolves(self, monkeypatch):
        module = _load_module()
        monkeypatch.setattr(module, "_fetch_severity", lambda vid: None)
        severity = module.resolve_severity(_vuln("PYSEC-3", aliases=["GHSA-xxx"]))
        assert severity is None


class TestMainGate:
    def test_no_vulnerabilities_exits_zero(self, tmp_path, monkeypatch, capsys):
        module = _load_module()
        report_path = tmp_path / "report.json"
        report_path.write_text(__import__("json").dumps(_report(vulns=[])))
        monkeypatch.setattr("sys.argv", ["gate", str(report_path)])

        assert module.main() == 0

    def test_high_severity_finding_exits_one(self, tmp_path, monkeypatch):
        module = _load_module()
        report_path = tmp_path / "report.json"
        report_path.write_text(__import__("json").dumps(_report(vulns=[_vuln("PYSEC-1")])))
        monkeypatch.setattr("sys.argv", ["gate", str(report_path)])
        monkeypatch.setattr(module, "_fetch_severity", lambda vid: "HIGH")

        assert module.main() == 1

    def test_moderate_severity_finding_exits_zero(self, tmp_path, monkeypatch):
        """Mirrors npm audit --audit-level=high: moderate/low findings are
        reported but must never fail the build on their own."""
        module = _load_module()
        report_path = tmp_path / "report.json"
        report_path.write_text(__import__("json").dumps(_report(vulns=[_vuln("PYSEC-1")])))
        monkeypatch.setattr("sys.argv", ["gate", str(report_path)])
        monkeypatch.setattr(module, "_fetch_severity", lambda vid: "MODERATE")

        assert module.main() == 0

    def test_unresolvable_severity_is_fail_safe_and_exits_one(self, tmp_path, monkeypatch):
        """A finding whose severity can't be determined at all (OSV
        unreachable, no GHSA-sourced record) must never be silently waved
        through — treated the same as HIGH/CRITICAL."""
        module = _load_module()
        report_path = tmp_path / "report.json"
        report_path.write_text(__import__("json").dumps(_report(vulns=[_vuln("PYSEC-1")])))
        monkeypatch.setattr("sys.argv", ["gate", str(report_path)])
        monkeypatch.setattr(module, "_fetch_severity", lambda vid: None)

        assert module.main() == 1

    def test_mixed_severities_one_high_one_moderate_still_fails(self, tmp_path, monkeypatch):
        module = _load_module()
        report_path = tmp_path / "report.json"
        report_path.write_text(__import__("json").dumps(
            _report(vulns=[_vuln("PYSEC-1"), _vuln("PYSEC-2")])
        ))
        monkeypatch.setattr("sys.argv", ["gate", str(report_path)])
        severities = {"PYSEC-1": "MODERATE", "PYSEC-2": "CRITICAL"}
        monkeypatch.setattr(module, "_fetch_severity", lambda vid: severities.get(vid))

        assert module.main() == 1
