#!/bin/bash
# SchoolFlow Pro — API startup script
# Runs inside the container where env vars from .env.docker are available.
set -euo pipefail

DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-90}"

# Do not silently fall back to development credentials. A missing database
# identity must stop the container before migrations or the API are started.
: "${POSTGRES_USER:?ERROR: POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?ERROR: POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?ERROR: POSTGRES_DB is required}"

DB_USER="$POSTGRES_USER"
DB_PASSWORD="$POSTGRES_PASSWORD"
DB_NAME="$POSTGRES_DB"

export PGPASSWORD="$DB_PASSWORD"

echo "==> Waiting for PostgreSQL DNS and connection (${DB_HOST}:${DB_PORT}/${DB_NAME})..."
start_ts=$(date +%s)
while true; do
  if python - <<PY >/dev/null 2>&1
import socket
socket.getaddrinfo("${DB_HOST}", int("${DB_PORT}"))
PY
  then
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo "   -> PostgreSQL is reachable"
      break
    fi
  fi

  now_ts=$(date +%s)
  elapsed=$((now_ts - start_ts))
  if [ "$elapsed" -ge "$DB_WAIT_TIMEOUT" ]; then
    echo "ERROR: PostgreSQL is not reachable after ${DB_WAIT_TIMEOUT}s" >&2
    echo "       host=${DB_HOST} port=${DB_PORT} db=${DB_NAME} user=${DB_USER}" >&2
    echo "       Check Docker network, .env.docker and postgres health status." >&2
    exit 1
  fi

  echo "   -> waiting for PostgreSQL... (${elapsed}s/${DB_WAIT_TIMEOUT}s)"
  sleep 3
done

echo "==> Fixing alembic_version column size (if table exists)..."
# alembic_version defaults to VARCHAR(32), but some revision IDs exceed 32 chars.
# We enlarge it to VARCHAR(256) once; this is a no-op if already large enough.
# Use discrete connection arguments instead of a URI so passwords containing
# reserved URL characters do not break psql parsing.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -c "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(256);" \
  2>/dev/null && echo "   -> column enlarged" || echo "   -> skipped (table may not exist yet — ok on first run)"

echo "==> Running Alembic migrations..."
alembic upgrade head

# Tell the FastAPI lifespan that migrations already ran — prevents each
# gunicorn worker from re-running "alembic upgrade head" concurrently.
export SCHOOLFLOW_MIGRATIONS_DONE=true

echo "==> Starting server (port 8000)..."
if [ "${DEBUG:-false}" = "true" ] || [ "${DEBUG:-false}" = "True" ]; then
  echo "   Mode: development (uvicorn --reload)"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  WORKERS=${WORKERS:-4}
  echo "   Mode: production (gunicorn × ${WORKERS} workers)"
  exec gunicorn app.main:app \
    --bind 0.0.0.0:8000 \
    --workers "${WORKERS}" \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --access-logfile - \
    --error-logfile -
fi
