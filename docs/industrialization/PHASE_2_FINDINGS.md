# Phase 2 findings — stabilization

## Critical blockers found in `main`

1. Merge conflict markers were committed into tracked files.
   Affected baseline files include `.gitignore`, `.dockerignore`, and `README.md`.
   These markers must be removed before trusting CI or release output.

2. Backend database URL handling is inconsistent.
   - `backend/app/db/session.py` uses SQLAlchemy async engine.
   - CI currently injects a sync `psycopg2` URL.
   - Alembic uses the same shared setting for migrations.

## Recommended corrective actions

### A. Remove committed conflict markers
Search for and remove all occurrences of:
- `<<<<<<<`
- `=======`
- `>>>>>>>`

### B. Split database URLs by usage
Introduce two env vars / settings:
- `DATABASE_URL_ASYNC` for API runtime (`postgresql+asyncpg://...`)
- `DATABASE_URL_SYNC` for Alembic / sync tooling (`postgresql+psycopg2://...`)

### C. Make CI fail fast on conflict markers
Add a preflight script to detect committed merge markers before running installs.

### D. Reduce architecture drift
Audit and remove legacy dependencies or references that do not match the current target architecture (`FastAPI + Keycloak + PostgreSQL + Docker`).
