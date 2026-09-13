#!/usr/bin/env bash
# Academy Guinéenne — orchestrate the full load-test CAMPAIGN.
#
# For each VU tier (250 baseline → 500 → 1000 → 2500):
#   1. start the infra-metrics sampler (capture-infra-metrics.sh) in background
#   2. run k6 campaign.js at that tier, exporting a JSON summary + raw stream
#   3. stop the sampler
# Then print a synthesis table (RPS, p50/p95/p99, error rate, timeouts) across
# tiers so the FIRST tier that breaches the SLO thresholds is obvious.
#
# ⚠️ NEVER against production. Requires: k6 in PATH, the target stack running,
# and a TENANTS_FILE of synthetic tenants (see seed-load-test-tenants.md).
#
# Usage:
#   BASE_URL=http://localhost:8000 \
#   TENANTS_FILE=./load-tests/tenants.50.json \
#   LOAD_TEST_TOKEN=<matches target LOAD_TEST_BYPASS_SECRET> \
#   WRITE_SCENARIOS=1 \
#   TIERS="250 500 1000 2500" \
#   ./load-tests/run-campaign.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
TENANTS_FILE="${TENANTS_FILE:?set TENANTS_FILE (see seed-load-test-tenants.md)}"
LOAD_TEST_TOKEN="${LOAD_TEST_TOKEN:-}"
WRITE_SCENARIOS="${WRITE_SCENARIOS:-0}"
TIERS="${TIERS:-250 500 1000 2500}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTDIR="${OUTDIR:-results/campaign-$STAMP}"
mkdir -p "$OUTDIR"

command -v k6 >/dev/null || { echo "ERROR: k6 not in PATH (https://k6.io/docs/get-started/installation/)"; exit 1; }

echo "Campaign → $OUTDIR   tiers=[$TIERS]   writes=$WRITE_SCENARIOS   target=$BASE_URL"
echo "Sanity: target must NOT be production."; sleep 2

for tier in $TIERS; do
  echo "════════ TIER $tier VU ════════"
  infra_csv="$OUTDIR/infra-$tier.csv"
  BASE_URL="$BASE_URL" COMPOSE="$COMPOSE" INTERVAL=5 OUT="$infra_csv" \
    bash load-tests/capture-infra-metrics.sh &
  cap_pid=$!

  set +e
  k6 run \
    --env BASE_URL="$BASE_URL" \
    --env TENANTS_FILE="$TENANTS_FILE" \
    --env TIER="$tier" \
    --env LOAD_TEST_TOKEN="$LOAD_TEST_TOKEN" \
    --env WRITE_SCENARIOS="$WRITE_SCENARIOS" \
    --summary-export="$OUTDIR/campaign-$tier-summary.json" \
    --out json="$OUTDIR/campaign-$tier-raw.json" \
    load-tests/campaign.js | tee "$OUTDIR/campaign-$tier-console.txt"
  k6_rc=$?
  set -e

  kill "$cap_pid" 2>/dev/null || true
  wait "$cap_pid" 2>/dev/null || true
  echo "tier $tier done (k6 exit $k6_rc) — cooldown 30s so the next tier starts from baseline"
  sleep 30
done

echo "════════ SYNTHÈSE ════════"
python load-tests/summarize.py "$OUTDIR" | tee "$OUTDIR/SYNTHESIS.md"
echo "All artefacts in $OUTDIR"
