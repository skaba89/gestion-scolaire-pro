#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env.docker}"
API_URL="${API_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-180}"
RUN_AUTH_SMOKE="${RUN_AUTH_SMOKE:-true}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.docker.example to $ENV_FILE and fill the required values." >&2
  exit 1
fi

echo "Validating docker compose configuration..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/tmp/schoolflow-compose-smoke.yml

echo "Starting required services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build postgres redis minio api frontend

started_at=$(date +%s)

wait_for_url() {
  local name="$1"
  local url="$2"
  echo "Waiting for $name: $url"
  while true; do
    if curl -fsS "$url" >/dev/null; then
      echo "OK: $name is reachable"
      return 0
    fi

    now=$(date +%s)
    elapsed=$((now - started_at))
    if (( elapsed > TIMEOUT_SECONDS )); then
      echo "ERROR: timeout waiting for $name after ${TIMEOUT_SECONDS}s" >&2
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps >&2 || true
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=100 api frontend postgres redis minio >&2 || true
      return 1
    fi
    sleep 5
  done
}

wait_for_url "API health" "$API_URL/health/"
wait_for_url "API root" "$API_URL/"
wait_for_url "Frontend" "$FRONTEND_URL/"

if curl -fsS "$API_URL/api/v1/health/" >/dev/null; then
  echo "OK: versioned API health route is reachable"
else
  echo "INFO: versioned API health route did not respond; root /health/ is healthy."
fi

echo "Checking Alembic migration graph..."
HEADS_OUTPUT="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T api alembic heads || true)"
HEADS_COUNT="$(printf '%s\n' "$HEADS_OUTPUT" | grep -c '(head)' || true)"
if [[ "$HEADS_COUNT" != "1" ]]; then
  echo "ERROR: expected exactly one Alembic head, found $HEADS_COUNT" >&2
  printf '%s\n' "$HEADS_OUTPUT" >&2
  exit 1
fi
echo "OK: Alembic has a single head"

if [[ "$RUN_AUTH_SMOKE" == "true" ]]; then
  ADMIN_EMAIL="$(grep -E '^ADMIN_DEFAULT_EMAIL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  ADMIN_PASSWORD="$(grep -E '^ADMIN_DEFAULT_PASSWORD=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"

  if [[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" && "$ADMIN_EMAIL" != CHANGE_ME* && "$ADMIN_PASSWORD" != CHANGE_ME* ]]; then
    echo "Checking super-admin login endpoint..."
    LOGIN_RESPONSE_FILE="/tmp/schoolflow-login-response.json"
    LOGIN_STATUS="$(curl -sS -o "$LOGIN_RESPONSE_FILE" -w '%{http_code}' \
      -X POST "$API_URL/api/v1/auth/login/" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode "username=$ADMIN_EMAIL" \
      --data-urlencode "password=$ADMIN_PASSWORD" || true)"

    if [[ "$LOGIN_STATUS" != "200" ]]; then
      echo "ERROR: super-admin login smoke failed with HTTP $LOGIN_STATUS" >&2
      cat "$LOGIN_RESPONSE_FILE" >&2 || true
      exit 1
    fi
    echo "OK: super-admin login endpoint accepts configured credentials"
  else
    echo "INFO: auth smoke skipped because ADMIN_DEFAULT_EMAIL or ADMIN_DEFAULT_PASSWORD is missing/placeholder."
  fi
fi

echo "Smoke test completed successfully."
