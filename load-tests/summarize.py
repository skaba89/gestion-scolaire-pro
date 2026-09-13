#!/usr/bin/env python3
"""Summarize a campaign output directory into Markdown tables + a first-
saturation verdict.

Reads, per tier, campaign-<tier>-summary.json (k6 --summary-export) and
infra-<tier>.csv (capture-infra-metrics.sh), and prints:
  * a request-level table (RPS, p50, p95, p99, error rate, timeouts, checks),
  * an infra table (peak DB-pool ratio/status, Postgres conns vs max, Redis
    ops/clients, Arq pending, peak CPU),
  * the FIRST tier that breaches the SLO thresholds (the first real saturation
    point) with the most likely bottleneck inferred from the infra peaks.

Usage: python load-tests/summarize.py <campaign_output_dir>
"""
import csv
import glob
import json
import os
import re
import sys

# The synthesis is UTF-8 Markdown (accents, ✅/❌). Force UTF-8 stdout so it
# renders identically on a Windows cp1252 console and in CI/Linux.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# SLO thresholds — MUST match load-tests/campaign.js options.thresholds.
SLO_ERR_RATE = 0.01
SLO_P95_MS = 800
SLO_P99_MS = 2000


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load_summary(path):
    with open(path) as f:
        d = json.load(f)
    m = d.get("metrics", {})

    def stat(metric, key):
        return _num((m.get(metric) or {}).get(key))

    dur = m.get("http_req_duration", {})
    return {
        "rps": stat("http_reqs", "rate"),
        "reqs": stat("http_reqs", "count"),
        "p50": dur.get("med", dur.get("p(50)")),
        "p95": dur.get("p(95)"),
        "p99": dur.get("p(99)"),
        "err_rate": stat("http_req_failed", "value") or stat("http_req_failed", "rate"),
        "timeouts": stat("request_timeouts", "count") or 0,
        "backpressure": stat("responses_backpressure", "count") or 0,
        "checks_rate": stat("checks", "rate"),
        "login_p95": (m.get("flow_login_ms") or {}).get("p(95)"),
        "dash_p95": (m.get("flow_dashboard_ms") or {}).get("p(95)"),
        "grade_w_p95": (m.get("flow_grades_write_ms") or {}).get("p(95)"),
    }


def load_infra(path):
    if not os.path.exists(path):
        return {}
    peak = {"pool_ratio": 0.0, "pg_total": 0, "pg_max": None, "redis_ops": 0,
            "redis_clients": 0, "arq_pending": 0, "api_cpu": 0.0, "pool_exhausted": False}
    with open(path) as f:
        for row in csv.DictReader(f):
            pr = _num(row.get("pool_ratio")); peak["pool_ratio"] = max(peak["pool_ratio"], pr or 0)
            peak["pg_total"] = max(peak["pg_total"], int(_num(row.get("pg_conn_total")) or 0))
            peak["pg_max"] = peak["pg_max"] or _num(row.get("pg_conn_max"))
            peak["redis_ops"] = max(peak["redis_ops"], int(_num(row.get("redis_ops_sec")) or 0))
            peak["redis_clients"] = max(peak["redis_clients"], int(_num(row.get("redis_clients")) or 0))
            peak["arq_pending"] = max(peak["arq_pending"], int(_num(row.get("arq_queue_pending")) or 0))
            peak["api_cpu"] = max(peak["api_cpu"], _num(row.get("api_cpu_pct")) or 0)
            if (row.get("pool_status") or "").strip() == "exhausted":
                peak["pool_exhausted"] = True
    return peak


def fmt(v, suffix=""):
    if v is None:
        return "NA"
    if isinstance(v, float):
        return f"{v:.1f}{suffix}"
    return f"{v}{suffix}"


def breaches(s):
    reasons = []
    if s["err_rate"] is not None and s["err_rate"] >= SLO_ERR_RATE:
        reasons.append(f"error rate {s['err_rate']*100:.2f}% ≥ 1%")
    if s["p95"] is not None and s["p95"] >= SLO_P95_MS:
        reasons.append(f"p95 {s['p95']:.0f}ms ≥ {SLO_P95_MS}ms")
    if s["p99"] is not None and s["p99"] >= SLO_P99_MS:
        reasons.append(f"p99 {s['p99']:.0f}ms ≥ {SLO_P99_MS}ms")
    if s["timeouts"]:
        reasons.append(f"{int(s['timeouts'])} timeouts")
    return reasons


def infer_bottleneck(infra):
    if not infra:
        return "infra metrics unavailable — re-run with capture-infra-metrics.sh"
    if infra.get("pool_exhausted") or infra.get("pool_ratio", 0) >= 0.95:
        return "SQLAlchemy DB connection pool exhausted (raise pool_size/max_overflow, or reduce per-request DB time)"
    if infra.get("pg_max") and infra.get("pg_total", 0) >= 0.9 * infra["pg_max"]:
        return f"PostgreSQL max_connections near limit ({infra['pg_total']}/{infra['pg_max']}) — add PgBouncer / raise max_connections"
    if infra.get("api_cpu", 0) >= 90:
        return f"API CPU-bound (peak {infra['api_cpu']:.0f}%) — scale API replicas / profile hot endpoints"
    if infra.get("redis_ops", 0) >= 50000:
        return f"Redis ops/s very high (peak {infra['redis_ops']}) — inspect cache/rate-limit key patterns"
    return "no single infra resource saturated — likely per-endpoint latency (missing index / N+1); inspect slowest flow_* trend"


def main():
    if len(sys.argv) != 2:
        print("usage: summarize.py <campaign_output_dir>", file=sys.stderr)
        return 2
    outdir = sys.argv[1]
    tiers = []
    for p in glob.glob(os.path.join(outdir, "campaign-*-summary.json")):
        m = re.search(r"campaign-(\w+)-summary\.json$", p)
        if m:
            tiers.append((m.group(1), p))
    tiers.sort(key=lambda t: int(t[0]) if t[0].isdigit() else 1 << 30)
    if not tiers:
        print(f"No campaign-*-summary.json in {outdir}", file=sys.stderr)
        return 1

    print(f"# Campaign synthesis — `{outdir}`\n")
    print("## Requêtes\n")
    print("| Tier (VU) | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Err % | Timeouts | Checks % | SLO |")
    print("|---|---|---|---|---|---|---|---|---|")
    summaries = {}
    first_sat = None
    for tier, path in tiers:
        s = load_summary(path)
        summaries[tier] = s
        b = breaches(s)
        verdict = "✅ OK" if not b else "❌ " + "; ".join(b)
        if b and first_sat is None:
            first_sat = tier
        err = f"{s['err_rate']*100:.2f}" if s["err_rate"] is not None else "NA"
        chk = f"{s['checks_rate']*100:.1f}" if s["checks_rate"] is not None else "NA"
        print(f"| {tier} | {fmt(s['rps'])} | {fmt(s['p50'])} | {fmt(s['p95'])} | "
              f"{fmt(s['p99'])} | {err} | {fmt(s['timeouts'])} | {chk} | {verdict} |")

    print("\n## Infra (pics)\n")
    print("| Tier | Pool ratio | Pool exhausted | PG conn/max | Redis ops/s | Redis clients | Arq pending | API CPU % |")
    print("|---|---|---|---|---|---|---|---|")
    infras = {}
    for tier, _ in tiers:
        infra = load_infra(os.path.join(outdir, f"infra-{tier}.csv"))
        infras[tier] = infra
        if infra:
            pgmax = int(infra["pg_max"]) if infra.get("pg_max") else "NA"
            print(f"| {tier} | {infra['pool_ratio']:.2f} | {infra['pool_exhausted']} | "
                  f"{infra['pg_total']}/{pgmax} | {infra['redis_ops']} | {infra['redis_clients']} | "
                  f"{infra['arq_pending']} | {infra['api_cpu']:.0f} |")
        else:
            print(f"| {tier} | NA | NA | NA | NA | NA | NA | NA |")

    print("\n## Verdict\n")
    if first_sat is None:
        print(f"- Aucun palier testé ne dépasse les SLO (err<1%, p95<{SLO_P95_MS}ms, p99<{SLO_P99_MS}ms, 0 timeout). "
              "Augmenter le palier max ou lancer `saturation.js` pour trouver le genou.")
    else:
        print(f"- **Premier point de saturation : {first_sat} VU** — {', '.join(breaches(summaries[first_sat]))}.")
        print(f"- **Goulot probable :** {infer_bottleneck(infras.get(first_sat, {}))}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
