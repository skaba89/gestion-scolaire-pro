#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "==> Applying local Alembic compatibility patches..."
# Legacy migration references career_events before the table is created.
sed -i '/career_events.id/d' /app/alembic/versions/20260406_create_operational_tables.py || true

# Some local schemas do not include students.classroom_id / attendance.classroom_id.
sed -i '/classroom_id/d' /app/alembic/versions/20260424_0001_composite_indexes_and_tenant_unique.py || true

echo "==> Running Alembic base chain..."
alembic upgrade 20260406_add_term_is_active

echo "==> Widening Alembic version column..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h postgres \
  -U "${POSTGRES_USER:-schoolflow}" \
  -d "${POSTGRES_DB:-schoolflow}" \
  -c 'ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(256);'

echo "==> Running remaining Alembic migrations..."
if ! alembic upgrade heads; then
  echo "WARNING: a legacy Alembic migration failed in local Docker."
  echo "WARNING: stamping heads to allow local API/frontend smoke testing."
  alembic stamp heads
fi

echo "==> Starting FastAPI..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
