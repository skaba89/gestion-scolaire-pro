#!/usr/bin/env bash
set -euo pipefail

cd /app

# docker-compose already injects DATABASE_URL into the API container.
# POSTGRES_PASSWORD is not always exposed as a standalone env var, so derive
# connection credentials from DATABASE_URL with safe fallbacks for local dev.
DB_URL="${DATABASE_URL:-}"
DB_USER="${POSTGRES_USER:-schoolflow}"
DB_NAME="${POSTGRES_DB:-schoolflow}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

if [[ -z "${DB_PASSWORD}" && -n "${DB_URL}" ]]; then
  DB_PASSWORD="$(python - <<'PY'
import os
from urllib.parse import urlparse, unquote
url = os.environ.get('DATABASE_URL', '')
parsed = urlparse(url)
print(unquote(parsed.password or ''))
PY
)"
fi

if [[ -z "${DB_PASSWORD}" ]]; then
  echo "ERROR: unable to determine PostgreSQL password. Set POSTGRES_PASSWORD in .env.docker."
  exit 1
fi

echo "==> Applying local Alembic compatibility patches..."
# Legacy migration references career_events before the table is created.
sed -i '/career_events.id/d' /app/alembic/versions/20260406_create_operational_tables.py || true

# Some local schemas do not include students.classroom_id / attendance.classroom_id.
sed -i '/classroom_id/d' /app/alembic/versions/20260424_0001_composite_indexes_and_tenant_unique.py || true

# FastAPI main.py also tries to run Alembic during lifespan startup.
# In Docker dev, this script owns the migration phase. Disable the duplicate run
# to prevent InFailedSqlTransaction after legacy migration fallbacks.
python - <<'PY'
from pathlib import Path
p = Path('/app/app/main.py')
s = p.read_text()
s = s.replace(
    'command.upgrade(alembic_cfg, "head")',
    'logger.warning("Docker dev: Alembic auto-migration skipped because docker_dev_start.sh already handled migrations")'
)
s = s.replace(
    'command.upgrade(alembic_cfg, "heads")',
    'logger.warning("Docker dev: Alembic auto-migration skipped because docker_dev_start.sh already handled migrations")'
)
p.write_text(s)
PY

echo "==> Running Alembic base chain..."
alembic upgrade 20260406_add_term_is_active

echo "==> Widening Alembic version column..."
PGPASSWORD="${DB_PASSWORD}" psql \
  -h postgres \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -c 'ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(256);'

echo "==> Running remaining Alembic migrations..."
if ! alembic upgrade heads; then
  echo "WARNING: a legacy Alembic migration failed in local Docker."
  echo "WARNING: stamping heads to allow local API/frontend smoke testing."
  alembic stamp heads
fi

echo "==> Starting FastAPI..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
