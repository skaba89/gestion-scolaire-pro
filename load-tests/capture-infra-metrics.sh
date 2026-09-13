#!/usr/bin/env bash
# Academy Guinéenne — infra-metrics sampler for a load-test run.
#
# Samples the mandatory server-side capacity signals every INTERVAL seconds
# into a CSV, in parallel with a k6 run, so a latency/error knee can be
# attributed to a specific resource (DB pool exhausted? Postgres connections
# maxed? Redis saturated? Arq queue backing up? CPU/mem?).
#
# It reads:
#   * app pool occupancy + component health  → GET {BASE_URL}/health/ready
#   * Prometheus counters/gauges             → GET {BASE_URL}/metrics (raw kept)
#   * PostgreSQL connections vs max          → psql pg_stat_activity
#   * Redis clients / ops-per-sec / memory   → redis-cli INFO
#   * Arq pending jobs                        → redis-cli ZCARD arq:queue
#   * per-container CPU% / MEM                → docker stats
#
# Every probe is best-effort: one failing source writes "NA" and the loop
# continues. Stop with Ctrl-C or `kill` — it flushes and exits cleanly.
#
# Usage:
#   BASE_URL=http://localhost:8000 \
#   COMPOSE="docker compose -f docker-compose.yml" \
#   INTERVAL=5 OUT=results/infra-250.csv \
#   ./load-tests/capture-infra-metrics.sh
#
# (run-campaign.sh starts/stops this automatically per tier.)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml}"
INTERVAL="${INTERVAL:-5}"
OUT="${OUT:-infra-metrics.csv}"
PG_USER="${PG_USER:-schoolflow}"
PG_DB="${PG_DB:-schoolflow}"
REDIS_AUTH="${REDIS_AUTH:-}"           # -a <pass> if requirepass is set
RAW_DIR="${RAW_DIR:-$(dirname "$OUT")/raw}"
mkdir -p "$RAW_DIR"

redis_cli() { $COMPOSE exec -T redis redis-cli ${REDIS_AUTH:+-a "$REDIS_AUTH"} "$@" 2>/dev/null; }
psql_q()    { $COMPOSE exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null; }

echo "ts,pool_checked_out,pool_capacity,pool_ratio,pool_status,db_component,redis_component,pg_conn_total,pg_conn_active,pg_conn_max,redis_clients,redis_ops_sec,redis_used_mem_mb,arq_queue_pending,api_cpu_pct,api_mem_mb,worker_cpu_pct,worker_mem_mb,pg_cpu_pct,pg_mem_mb,redis_cpu_pct,redis_mem_mb,minio_cpu_pct,minio_mem_mb" > "$OUT"

cleanup() { echo "capture stopped → $OUT"; exit 0; }
trap cleanup INT TERM

while true; do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # ── app /health/ready → pool + component health ────────────────────────────
  ready_json="$(curl -s -m 5 "${BASE_URL}/health/ready" 2>/dev/null)"
  echo "$ready_json" > "$RAW_DIR/ready-$ts.json" 2>/dev/null
  read -r pco pcap prat pstat dbc rc <<EOF
$(printf '%s' "$ready_json" | python -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    print("NA NA NA NA NA NA"); sys.exit()
def find(obj,key):
    if isinstance(obj,dict):
        if key in obj: return obj[key]
        for v in obj.values():
            r=find(v,key)
            if r is not None: return r
    elif isinstance(obj,list):
        for v in obj:
            r=find(v,key)
            if r is not None: return r
    return None
co=find(d,"checked_out"); cap=find(d,"capacity"); rat=find(d,"ratio")
pst=find(d,"status")
comp=d.get("components",{}) if isinstance(d,dict) else {}
dbc=comp.get("database","NA"); rc=comp.get("cache", comp.get("redis","NA"))
print(f"{co if co is not None else \"NA\"} {cap if cap is not None else \"NA\"} {rat if rat is not None else \"NA\"} {pst or \"NA\"} {dbc} {rc}")
' 2>/dev/null)
EOF
  : "${pco:=NA}" "${pcap:=NA}" "${prat:=NA}" "${pstat:=NA}" "${dbc:=NA}" "${rc:=NA}"

  # keep the raw prometheus scrape for offline analysis
  curl -s -m 5 "${BASE_URL}/metrics" > "$RAW_DIR/metrics-$ts.txt" 2>/dev/null

  # ── PostgreSQL connections vs max ──────────────────────────────────────────
  pg_total="$(psql_q "SELECT count(*) FROM pg_stat_activity;")"; : "${pg_total:=NA}"
  pg_active="$(psql_q "SELECT count(*) FROM pg_stat_activity WHERE state='active';")"; : "${pg_active:=NA}"
  pg_max="$(psql_q "SHOW max_connections;")"; : "${pg_max:=NA}"

  # ── Redis ──────────────────────────────────────────────────────────────────
  redis_info="$(redis_cli INFO 2>/dev/null)"
  r_clients="$(printf '%s' "$redis_info" | awk -F: '/^connected_clients:/{gsub(/\r/,"");print $2}')"; : "${r_clients:=NA}"
  r_ops="$(printf '%s' "$redis_info" | awk -F: '/^instantaneous_ops_per_sec:/{gsub(/\r/,"");print $2}')"; : "${r_ops:=NA}"
  r_mem_bytes="$(printf '%s' "$redis_info" | awk -F: '/^used_memory:/{gsub(/\r/,"");print $2}')"
  if [ -n "${r_mem_bytes:-}" ]; then r_mem_mb=$(( r_mem_bytes / 1048576 )); else r_mem_mb=NA; fi
  arq_pending="$(redis_cli ZCARD arq:queue)"; : "${arq_pending:=NA}"

  # ── per-container CPU / MEM (docker stats) ─────────────────────────────────
  stats="$($COMPOSE ps -q 2>/dev/null | xargs -r docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' 2>/dev/null)"
  getcpu() { printf '%s' "$stats" | awk -v s="$1" 'index($1,s){gsub(/%/,"",$2);print $2;exit}'; }
  getmem() { printf '%s' "$stats" | awk -v s="$1" 'index($1,s){print $3;exit}' | sed 's/MiB//; s/GiB/*1024/' | bc 2>/dev/null; }
  api_cpu="$(getcpu api)"; : "${api_cpu:=NA}";       api_mem="$(getmem api)"; : "${api_mem:=NA}"
  wk_cpu="$(getcpu worker)"; : "${wk_cpu:=NA}";      wk_mem="$(getmem worker)"; : "${wk_mem:=NA}"
  pg_cpu="$(getcpu postgres)"; : "${pg_cpu:=NA}";    pg_mem="$(getmem postgres)"; : "${pg_mem:=NA}"
  rd_cpu="$(getcpu redis)"; : "${rd_cpu:=NA}";       rd_mem="$(getmem redis)"; : "${rd_mem:=NA}"
  mn_cpu="$(getcpu minio)"; : "${mn_cpu:=NA}";       mn_mem="$(getmem minio)"; : "${mn_mem:=NA}"

  echo "$ts,$pco,$pcap,$prat,$pstat,$dbc,$rc,$pg_total,$pg_active,$pg_max,$r_clients,$r_ops,$r_mem_mb,$arq_pending,$api_cpu,$api_mem,$wk_cpu,$wk_mem,$pg_cpu,$pg_mem,$rd_cpu,$rd_mem,$mn_cpu,$mn_mem" >> "$OUT"
  sleep "$INTERVAL"
done
