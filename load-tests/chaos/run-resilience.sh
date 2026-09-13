#!/usr/bin/env bash
# Academy Guinéenne — resilience campaign runner.
#
# For each fault: capture a short BASELINE, INJECT the fault while running
# resilience.js, LIFT it, then capture a RECOVERY window — all with the infra
# sampler running so degradation and recovery are measured, not asserted.
#
# ⚠️ LOCAL / staging ONLY. Requires k6 + a running stack + a TENANTS_FILE.
#
# Usage:
#   BASE_URL=http://localhost:8000 \
#   TENANTS_FILE=./load-tests/tenants.10.json LOAD_TEST_TOKEN=<...> \
#   FAULTS="redis_down redis_slow worker_stopped postgres_saturated storage_down network_timeout" \
#   ./load-tests/chaos/run-resilience.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
TENANTS_FILE="${TENANTS_FILE:?set TENANTS_FILE}"
LOAD_TEST_TOKEN="${LOAD_TEST_TOKEN:-}"
VUS="${VUS:-100}"
FAULT_DURATION="${FAULT_DURATION:-3m}"
FAULTS="${FAULTS:-redis_down worker_stopped postgres_saturated storage_down}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTDIR="${OUTDIR:-results/resilience-$STAMP}"
mkdir -p "$OUTDIR"
command -v k6 >/dev/null || { echo "ERROR: k6 not in PATH"; exit 1; }
here="$(dirname "$0")"

run_k6() {  # $1=fault label
  k6 run --env BASE_URL="$BASE_URL" --env TENANTS_FILE="$TENANTS_FILE" \
    --env LOAD_TEST_TOKEN="$LOAD_TEST_TOKEN" --env FAULT="$1" \
    --env VUS="$VUS" --env DURATION="$FAULT_DURATION" \
    --summary-export="$OUTDIR/resilience-$1-summary.json" \
    load-tests/resilience.js | tee "$OUTDIR/resilience-$1-console.txt" || true
}

for fault in $FAULTS; do
  echo "════════ FAULT: $fault ════════"
  BASE_URL="$BASE_URL" COMPOSE="$COMPOSE" INTERVAL=3 OUT="$OUTDIR/infra-$fault.csv" \
    bash load-tests/capture-infra-metrics.sh & cap=$!

  echo "→ inject $fault"
  bash "$here/inject.sh" "$fault" up || true
  if [ "$fault" = worker_saturated ]; then
    echo "  (flood Arq queue — enqueue many jobs via your app's job API, then observe drain)"
  fi

  run_k6 "$fault"

  echo "→ lift $fault (observe RECOVERY)"
  bash "$here/inject.sh" "$fault" down || true
  run_k6 "recovery_after_$fault"

  kill "$cap" 2>/dev/null || true; wait "$cap" 2>/dev/null || true
  echo "cooldown 20s"; sleep 20
done

echo "Resilience artefacts in $OUTDIR"
echo "Read: error rate + p95 during fault vs recovery window; idempotent_replay_DIVERGENT MUST be 0."
