#!/bin/bash
# Academy Guinéenne — API startup script
#
# Supports two ways of configuring the database connection:
#
#   1. Docker Compose (local dev): POSTGRES_HOST / POSTGRES_USER /
#      POSTGRES_PASSWORD / POSTGRES_DB, as set by .env.docker.
#   2. Managed deployments (Azure Container Apps and anywhere else that
#      injects a single connection string): DATABASE_URL_SYNC, falling back
#      to DATABASE_URL. This is what infra/azure/modules/container-apps.bicep
#      actually sets on the "api" container — it never sets POSTGRES_* — so
#      without this, the container used to exit here (see the ":?" guards
#      this replaced) before Alembic or FastAPI ever ran.
#
# When both are present (the current docker-compose.yml/.env.docker set
# both), DATABASE_URL_SYNC/DATABASE_URL wins — that is the single source of
# truth app/core/database.py itself connects with, so waiting on anything
# else risks diverging from what the app will actually use.
set -euo pipefail

DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-90}"

if [ -n "${DATABASE_URL_SYNC:-}" ] || [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Database mode: DATABASE_URL_SYNC/DATABASE_URL (managed deployment)"

  # Parsed with SQLAlchemy's own URL parser (the same library
  # app/core/database.py uses to build the engine), never with cut/sed/a
  # hand-rolled regex: a PostgreSQL password can legitimately contain
  # URL-reserved characters (this is routine for Azure-generated Flexible
  # Server passwords), and a naive shell-level split on ":" or "@" would
  # silently truncate or mis-split it. make_url() also correctly
  # percent-decodes the username/password for us — plain
  # urllib.parse.urlsplit() does NOT do this for the userinfo component,
  # which would otherwise hand psql/pg_isready a still-percent-encoded
  # password and fail authentication.
  if ! _db_output="$(python - <<'PY'
import os
import sys

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

raw_url = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL") or ""

try:
    parsed = make_url(raw_url)
except ArgumentError as exc:
    sys.stderr.write(f"ERROR: could not parse DATABASE_URL_SYNC/DATABASE_URL: {exc}\n")
    sys.exit(1)

if not (parsed.drivername or "").startswith("postgresql"):
    sys.stderr.write(
        f"ERROR: DATABASE_URL_SYNC/DATABASE_URL must be a PostgreSQL URL "
        f"(got scheme {parsed.drivername!r})\n"
    )
    sys.exit(1)

if not parsed.host or not parsed.username or not parsed.database:
    sys.stderr.write(
        "ERROR: DATABASE_URL_SYNC/DATABASE_URL is missing a host, user, or "
        "database name\n"
    )
    sys.exit(1)

# One field per line. Never print the password on its own outside of this
# controlled, unlogged pipe — the caller only exports it as PGPASSWORD.
print(parsed.host)
print(parsed.port or 5432)
print(parsed.username)
print(parsed.password or "")
print(parsed.database)
PY
  )"; then
    echo "ERROR: failed to parse DATABASE_URL_SYNC/DATABASE_URL — see above" >&2
    exit 1
  fi

  mapfile -t _db_fields <<< "$_db_output"
  DB_HOST="${_db_fields[0]}"
  DB_PORT="${_db_fields[1]}"
  DB_USER="${_db_fields[2]}"
  DB_PASSWORD="${_db_fields[3]}"
  DB_NAME="${_db_fields[4]}"
  unset _db_output _db_fields

elif [ -n "${POSTGRES_HOST:-}" ] || [ -n "${POSTGRES_USER:-}" ] || [ -n "${POSTGRES_PASSWORD:-}" ] || [ -n "${POSTGRES_DB:-}" ]; then
  echo "==> Database mode: POSTGRES_* (Docker Compose)"

  # Do not silently fall back to development credentials. A missing
  # database identity must stop the container before migrations or the
  # API are started.
  : "${POSTGRES_USER:?ERROR: POSTGRES_USER is required}"
  : "${POSTGRES_PASSWORD:?ERROR: POSTGRES_PASSWORD is required}"
  : "${POSTGRES_DB:?ERROR: POSTGRES_DB is required}"

  DB_HOST="${POSTGRES_HOST:-postgres}"
  # Always 5432: this is the postgres container's port on the internal Docker
  # network, which POSTGRES_PORT does not affect — that variable only remaps
  # the HOST-side port in docker-compose.yml's "ports:" mapping. Using it here
  # would break this in-network connection for anyone who changes POSTGRES_PORT
  # to avoid a local port conflict.
  DB_PORT=5432
  DB_USER="$POSTGRES_USER"
  DB_PASSWORD="$POSTGRES_PASSWORD"
  DB_NAME="$POSTGRES_DB"

else
  echo "ERROR: no database configuration found." >&2
  echo "       Set either DATABASE_URL_SYNC / DATABASE_URL (managed deployments)" >&2
  echo "       or POSTGRES_HOST/POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB (Docker Compose)." >&2
  exit 1
fi

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
  WORKERS=${WORKERS:-2}
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
