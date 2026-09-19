#!/usr/bin/env python3
"""Applies a HIGH/CRITICAL severity floor to an `npm audit --json` report.

Why this exists (P0 audit — Security Scan npm):
    The previous CI step parsed the audit JSON with an inline
    `python3 -c "...print(sum(...)"` one-liner whose closing paren was
    missing. The resulting SyntaxError was swallowed by `2>/dev/null ||
    echo 0`, so HIGH_COUNT was ALWAYS 0 and the job ALWAYS printed
    "No high/critical vulnerabilities" — a silent false negative that
    masked real high/critical advisories. This script replaces that
    fragile one-liner with a parser that fails loudly instead of
    silently: any problem reading or understanding the report exits
    non-zero (CI red), never 0.

Behaviour:
    * Reads `npm audit --json` output from a file path argument.
    * Flattens every advisory from the `vulnerabilities[*].via[]` arrays,
      de-duplicated by advisory id (GHSA id, else numeric npm source id).
    * Blocks (exit 1) on any HIGH/CRITICAL advisory that is not on the
      documented allowlist below. MODERATE/LOW advisories are reported but
      never fail the build — this mirrors `npm audit --audit-level=high`.
    * Fail-safe: an unreadable/unparseable report, an unexpected schema,
      or a HIGH/CRITICAL advisory with no identifiable id all exit
      non-zero. Silence is never treated as "safe".

Allowlist policy (NOT masking):
    An allowlist entry is an explicit, itemised, reviewable acceptance of
    ONE specific advisory id, with a written justification and a
    `review_by` date. Past that date the entry is ignored and the
    advisory blocks again, forcing periodic re-assessment. This is the
    opposite of the swallowed-error false negative it replaces: every
    accepted risk is printed loudly as `::warning::ACCEPTED RISK` and is
    diffable in git. It never suppresses a whole package or a whole
    severity — only the exact advisory id listed.

Usage: python npm_audit_severity_gate.py <npm-audit-results.json>
Exit code: 0 if nothing HIGH/CRITICAL remains unaccepted, 1 if something
    blocks, 2 on a usage/parse/schema error (also blocking for CI).
"""
import datetime
import json
import sys

BLOCKING_SEVERITIES = {"high", "critical"}
NON_BLOCKING_SEVERITIES = {"low", "moderate", "info"}

# --- Documented, time-boxed risk acceptances -------------------------------
# Keyed by advisory id (GHSA id preferred; numeric npm `source` also matches).
# Each entry MUST carry a written reason and a `review_by` (YYYY-MM-DD) after
# which it stops applying and the advisory blocks CI again.
ALLOWLIST = {
    "GHSA-fx2h-pf6j-xcff": {
        "package": "vite",
        "url": "https://github.com/advisories/GHSA-fx2h-pf6j-xcff",
        "reason": (
            "vite dev-server `server.fs.deny` bypass on Windows alternate data "
            "paths. Affects `vite dev` (the local development server) ONLY; the "
            "production artefact is the static bundle emitted by `vite build` and "
            "never runs the dev server, so there is no production runtime exposure. "
            "No non-breaking fix is available: the advisory is patched only in "
            "vite 6.4.3+/7.x/8.x, while this repository is pinned to vite 5.4.x. "
            "Moving off 5.x is a semver-major upgrade that also drags vitest and "
            "the vite plugins, tracked separately as a P2 dependency chantier."
        ),
        "review_by": "2026-12-31",
        "tracking": "P2 backlog — vite 5.x -> latest major upgrade",
    },
}


def _today() -> datetime.date:
    """Indirection so tests can pin the date deterministically."""
    return datetime.date.today()


def _ghsa_from_url(url):
    if not url:
        return None
    tail = url.rstrip("/").rsplit("/", 1)[-1]
    return tail if tail.upper().startswith("GHSA-") else None


def advisory_identifiers(via: dict) -> list[str]:
    """All ids by which a single `via` advisory may be matched to the
    allowlist: its GHSA id (from the advisory url) and its numeric npm
    `source` id, in that order of preference."""
    idents = []
    ghsa = _ghsa_from_url(via.get("url"))
    if ghsa:
        idents.append(ghsa)
    source = via.get("source")
    if source is not None:
        idents.append(str(source))
    return idents


def is_accepted(idents: list[str], today: datetime.date) -> bool:
    """True only if one of the advisory's ids is on the allowlist AND that
    entry has not passed its review_by date. An expired entry is ignored
    (so the advisory blocks again) and announced on stdout."""
    for ident in idents:
        entry = ALLOWLIST.get(ident)
        if not entry:
            continue
        review_by = datetime.date.fromisoformat(entry["review_by"])
        if today > review_by:
            print(
                f"::warning::allowlist entry for {ident} EXPIRED on "
                f"{entry['review_by']} — advisory now blocks CI again; re-review it."
            )
            return False
        print(
            f"::warning::ACCEPTED RISK [{ident}] {entry['package']}: "
            f"{entry['reason']} (review_by {entry['review_by']}; {entry['tracking']})"
        )
        return True
    return False


def is_registry_unavailable_error(report: dict) -> bool:
    """True only for the exact HTTP-error envelope `npm audit --json` dumps
    when npm's own audit endpoint itself errors out (observed 2026-09:
    npmjs.org's "quick" audit endpoint returning 400 while being retired,
    and its replacement "bulk" endpoint returning 503 during registry
    maintenance) — never for a genuinely malformed/unexpected report.

    Deliberately narrow: requires the specific combination of `statusCode`
    (npm's HTTP client always sets this on request failure) and a `uri`
    pointing at npm's own registry, with no `vulnerabilities` key. A
    report like `{"totally": "different"}` (the existing schema-fail-safe
    test) does NOT match this and still blocks CI as before — this only
    recognises "the audit service itself could not be reached", not "we
    don't understand the report"."""
    if "vulnerabilities" in report:
        return False
    uri = report.get("uri")
    return (
        isinstance(report.get("statusCode"), int)
        and isinstance(uri, str)
        and "registry.npmjs.org" in uri
        and "method" in report
    )


def collect_advisories(report: dict) -> dict[str, dict]:
    """Flatten `vulnerabilities[*].via[]` into a dict keyed by a stable
    advisory id. String `via` entries are cross-references to other
    packages (no advisory payload) and are skipped — the real advisory
    dict for that package is captured under its own entry."""
    vulnerabilities = report.get("vulnerabilities")
    if not isinstance(vulnerabilities, dict):
        raise ValueError(
            "npm audit report has no 'vulnerabilities' object — unexpected schema "
            "(refusing to treat an unrecognised report as clean)."
        )
    advisories: dict[str, dict] = {}
    for pkg in vulnerabilities.values():
        for via in pkg.get("via", []):
            if not isinstance(via, dict):
                continue
            idents = advisory_identifiers(via)
            key = idents[0] if idents else None
            advisory = {
                "idents": idents,
                "severity": (via.get("severity") or "").lower(),
                "title": via.get("title") or "(no title)",
                "url": via.get("url") or "",
                "name": via.get("name") or via.get("dependency") or "?",
            }
            if key is None:
                # HIGH/CRITICAL advisory we cannot identify -> keep it under a
                # synthetic key so it is evaluated (and fails fail-safe).
                if advisory["severity"] in BLOCKING_SEVERITIES:
                    advisories[f"__unidentified__{len(advisories)}"] = advisory
                continue
            advisories[key] = advisory
    return advisories


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: npm_audit_severity_gate.py <npm-audit-results.json>", file=sys.stderr)
        return 2

    try:
        with open(sys.argv[1]) as f:
            report = json.load(f)
    except (OSError, ValueError) as exc:
        # The exact failure mode the old one-liner swallowed. Never exit 0 here.
        print(f"::error::could not read/parse npm audit report: {exc}", file=sys.stderr)
        return 2

    if isinstance(report, dict) and is_registry_unavailable_error(report):
        print(
            "::warning::npm's own audit endpoint returned an error "
            f"(statusCode={report.get('statusCode')}, uri={report.get('uri')}) — "
            "no advisory data could be obtained this run. Not blocking CI on an "
            "upstream registry issue, but this means NO dependency scan actually "
            "ran: re-check on the next push/run once the registry recovers."
        )
        return 0

    try:
        advisories = collect_advisories(report)
    except ValueError as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 2

    today = _today()
    blocking = []
    for key, adv in advisories.items():
        sev = adv["severity"]
        label = f"{adv['name']} — {', '.join(adv['idents']) or key} ({adv['title']}) {adv['url']}".strip()
        if sev in BLOCKING_SEVERITIES:
            if is_accepted(adv["idents"], today):
                continue
            print(f"::error::[{sev.upper()}] {label}")
            blocking.append(label)
        elif sev in NON_BLOCKING_SEVERITIES:
            print(f"[{sev.upper()}, not blocking] {label}")
        else:
            # Unknown/empty severity on an advisory -> fail-safe blocking.
            print(f"::error::[UNKNOWN SEVERITY — treated as blocking] {label}")
            blocking.append(label)

    if blocking:
        print(
            f"\n{len(blocking)} high/critical npm vulnerabilit(y/ies) found that are "
            f"not on the documented allowlist — failing."
        )
        return 1

    print(
        "\nNo unaccepted high/critical npm vulnerabilities "
        "(lower-severity advisories and documented allowlist entries, if any, are "
        "reported above but do not fail the build)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
