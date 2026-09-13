#!/usr/bin/env bash
# Academy Guinéenne — fault injector for resilience testing.
#
# Injects (or lifts) one infrastructure fault against the LOCAL docker-compose
# stack, so load-tests/resilience.js can observe graceful degradation +
# recovery. Reproducible and self-reverting.
#
# ⚠️ LOCAL / staging ONLY — never against production infrastructure.
#
# Usage:
#   load-tests/chaos/inject.sh <fault> up     # start the fault
#   load-tests/chaos/inject.sh <fault> down   # lift it (restore baseline)
#
# faults:
#   redis_down          stop the Redis container
#   redis_slow          add ~300ms latency on Redis (needs tc/NET_ADMIN or pumba)
#   worker_stopped      stop the Arq worker
#   worker_saturated    flood the Arq queue with jobs (see run-resilience.sh)
#   postgres_saturated  hold N idle-in-transaction connections to exhaust pool
#   storage_down        stop MinIO (object storage)
#   network_timeout     add heavy latency+loss on the API container
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml}"
FAULT="${1:?usage: inject.sh <fault> <up|down>}"
ACTION="${2:?usage: inject.sh <fault> <up|down>}"
PG_USER="${PG_USER:-schoolflow}"
PG_DB="${PG_DB:-schoolflow}"
PG_HOLD="${PG_HOLD:-120}"          # idle-in-tx connections for postgres_saturated
NETEM_DELAY="${NETEM_DELAY:-300ms}"
NETEM_LOSS="${NETEM_LOSS:-10%}"
PIDFILE="/tmp/sfp-chaos-$FAULT.pid"

svc_tc() {  # apply/remove tc netem inside a service container (needs iproute2)
  local svc="$1" action="$2" spec="$3"
  if [ "$action" = up ]; then
    $COMPOSE exec -T "$svc" sh -lc "command -v tc >/dev/null || (apt-get update -qq && apt-get install -y -qq iproute2) ; tc qdisc add dev eth0 root netem $spec" \
      || echo "WARN: tc unavailable in $svc — use pumba/toxiproxy instead (see chaos/README.md)"
  else
    $COMPOSE exec -T "$svc" sh -lc "tc qdisc del dev eth0 root netem 2>/dev/null || true"
  fi
}

case "$FAULT:$ACTION" in
  redis_down:up)          $COMPOSE stop redis ;;
  redis_down:down)        $COMPOSE start redis ;;

  redis_slow:up)          svc_tc redis up "delay $NETEM_DELAY" ;;
  redis_slow:down)        svc_tc redis down "" ;;

  worker_stopped:up)      $COMPOSE stop worker ;;
  worker_stopped:down)    $COMPOSE start worker ;;

  storage_down:up)        $COMPOSE stop minio ;;
  storage_down:down)      $COMPOSE start minio ;;

  network_timeout:up)     svc_tc api up "delay $NETEM_DELAY loss $NETEM_LOSS" ;;
  network_timeout:down)   svc_tc api down "" ;;

  postgres_saturated:up)
    # Hold PG_HOLD idle-in-transaction connections so real requests queue /
    # time out — surfaces both Postgres max_connections and the app's pool.
    echo "opening $PG_HOLD idle-in-transaction connections…"
    for i in $(seq 1 "$PG_HOLD"); do
      $COMPOSE exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -c \
        "BEGIN; SELECT pg_sleep(600);" >/dev/null 2>&1 &
      echo $! >> "$PIDFILE"
    done
    echo "held (pids in $PIDFILE) — lift with: inject.sh postgres_saturated down" ;;
  postgres_saturated:down)
    [ -f "$PIDFILE" ] && xargs -r kill < "$PIDFILE" 2>/dev/null || true
    rm -f "$PIDFILE"
    $COMPOSE exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle in transaction';" >/dev/null 2>&1 || true
    echo "released idle-in-transaction connections" ;;

  worker_saturated:up|worker_saturated:down)
    echo "worker_saturated is driven by run-resilience.sh (job flood) — no-op here" ;;

  *) echo "unknown fault/action: $FAULT:$ACTION"; exit 2 ;;
esac
echo "[$FAULT] $ACTION done"
