#!/bin/bash
# SchoolFlow Pro — API startup script
# Runs inside the container where env vars from .env.docker are available.
set -e

echo "==> Fixing alembic_version column size (if table exists)..."
# alembic_version defaults to VARCHAR(32), but some revision IDs exceed 32 chars.
# We enlarge it to VARCHAR(256) once; this is a no-op if already large enough.
psql "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  -c "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(256);" \
  2>/dev/null && echo "   -> column enlarged" || echo "   -> skipped (table may not exist yet — ok on first run)"

echo "==> Running Alembic migrations..."
alembic upgrade head

echo "==> Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
