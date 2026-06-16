#!/bin/bash
# SchoolFlow Pro — API startup script
# Runs inside the container where env vars from .env.docker are available.
set -euo pipefail

DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-schoolflow}"
DB_PASSWORD="${POSTGRES_PASSWORD:-schoolflow}"
DB_NAME="${POSTGRES_DB:-schoolflow}"
DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-90}"

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
psql "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
  -c "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(256);" \
  2>/dev/null && echo "   -> column enlarged" || echo "   -> skipped (table may not exist yet — ok on first run)"

echo "==> Running Alembic migrations..."
alembic upgrade head

echo "==> Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
