#!/usr/bin/env bash
# SchoolFlow Pro — production API startup script
#
# IMPORTANT:
# - This script intentionally does NOT run Alembic migrations.
# - Run migrations explicitly before deployment:
#     cd backend && alembic upgrade head
#   or inside Docker:
#     docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head
#
# This avoids multiple production instances trying to migrate the database
# at the same time.

set -euo pipefail

: "${PORT:=8000}"
: "${WEB_CONCURRENCY:=2}"
: "${LOG_LEVEL:=info}"
: "${GUNICORN_TIMEOUT:=120}"
: "${GUNICORN_GRACEFUL_TIMEOUT:=30}"
: "${GUNICORN_KEEPALIVE:=5}"

exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WEB_CONCURRENCY}" \
  --timeout "${GUNICORN_TIMEOUT}" \
  --graceful-timeout "${GUNICORN_GRACEFUL_TIMEOUT}" \
  --keep-alive "${GUNICORN_KEEPALIVE}" \
  --access-logfile - \
  --error-logfile - \
  --log-level "${LOG_LEVEL}"
