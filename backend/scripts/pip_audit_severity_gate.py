#!/usr/bin/env python3
"""Applies a HIGH/CRITICAL severity floor to a pip-audit JSON report —
audit finding (round 2, Medium): the CI step used to fail on any single
pip advisory, of any severity, unlike the sibling `npm audit
--audit-level=high` step.

pip-audit's own JSON output (`pip-audit -f json`, any --vulnerability-
service) does not include a severity field to filter on locally — its
schema is limited to id/fix_versions/aliases/description (verified
against pip-audit 2.10.1's actual output, both `-s pypi` and `-s osv`).
Severity for a HIGH/CRITICAL floor is instead resolved per-finding
against OSV's public API (api.osv.dev), which does return
`database_specific.severity` for GHSA-sourced advisories — first by the
finding's own id (works directly for PYSEC-* ids), falling back to each
of its aliases (GHSA-*/CVE-* ids) until one resolves.

Fail-safe by design: a finding whose severity cannot be determined at all
(network unreachable, no GHSA-sourced record for it or any alias) is
treated as blocking, same as an explicit HIGH/CRITICAL — this script
never silently waves through a finding it couldn't actually assess.

Usage: python pip_audit_severity_gate.py <pip-audit-results.json>
Exit code: 0 if nothing HIGH/CRITICAL (or unresolvable) was found, 1 otherwise.
"""
import json
import sys
import urllib.error
import urllib.request

OSV_VULN_URL = "https://api.osv.dev/v1/vulns/{id}"
BLOCKING_SEVERITIES = {"HIGH", "CRITICAL"}
# Findings resolved to one of these are reported but never fail the build —
# matches npm audit's --audit-level=high (moderate/low pass).
NON_BLOCKING_SEVERITIES = {"LOW", "MODERATE", "MEDIUM"}


def _fetch_severity(vuln_id: str) -> str | None:
    """Returns the OSV `database_specific.severity` string for a single
    vulnerability id, or None if unavailable/unreachable."""
    try:
        req = urllib.request.Request(OSV_VULN_URL.format(id=vuln_id), headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        severity = (data.get("database_specific") or {}).get("severity")
        return str(severity).upper() if severity else None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None


def resolve_severity(vuln: dict) -> str | None:
    """Tries the finding's own id first (works directly for PYSEC-* ids
    that ARE the OSV id), then each alias (GHSA-*/CVE-*) until one
    resolves to a severity."""
    candidates = [vuln.get("id")] + list(vuln.get("aliases") or [])
    for candidate in candidates:
        if not candidate:
            continue
        severity = _fetch_severity(candidate)
        if severity:
            return severity
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: pip_audit_severity_gate.py <pip-audit-results.json>", file=sys.stderr)
        return 2

    with open(sys.argv[1]) as f:
        report = json.load(f)

    blocking = []
    for dep in report.get("dependencies", []):
        for vuln in dep.get("vulns", []):
            severity = resolve_severity(vuln)
            label = f"{dep['name']} {dep['version']} — {vuln['id']} ({', '.join(vuln.get('aliases') or [])})"
            if severity in BLOCKING_SEVERITIES:
                print(f"::error::[{severity}] {label}")
                blocking.append(label)
            elif severity in NON_BLOCKING_SEVERITIES:
                print(f"[{severity}, not blocking] {label}")
            else:
                print(f"::error::[UNRESOLVED SEVERITY — treated as blocking] {label}")
                blocking.append(label)

    if blocking:
        print(f"\n{len(blocking)} high/critical (or unresolvable) pip vulnerabilities found — failing.")
        return 1

    print("\nNo high/critical pip vulnerabilities (lower-severity advisories, if any, are reported above but do not fail the build).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
