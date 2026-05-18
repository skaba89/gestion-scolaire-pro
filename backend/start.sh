#!/bin/bash
# SchoolFlow Pro — API startup script
# Runs inside the container where env vars from .env.docker are available.
set -e

echo "==> Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY=0
until psql "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  -c "SELECT 1" > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "FATAL: PostgreSQL not reachable after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "   Waiting for PostgreSQL... (${RETRY}/${MAX_RETRIES})"
  sleep 2
done
echo "   -> PostgreSQL is ready"

echo "==> Fixing alembic_version column size (if table exists)..."
psql "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  -c "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(256);" \
  2>/dev/null && echo "   -> column enlarged" || echo "   -> skipped (table may not exist yet — ok on first run)"

echo "==> Running Alembic migrations..."
alembic upgrade head

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
