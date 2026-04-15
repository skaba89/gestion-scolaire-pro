# SchoolFlow Pro — Project Conventions

## Stack
- **Frontend**: React 18 + Vite 5 + TypeScript 5.8 + Tailwind CSS 3.4 + Radix UI (shadcn/ui)
- **Backend**: FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL 16
- **Cache**: Redis 7
- **Storage**: MinIO (S3-compatible)
- **Auth**: Native JWT (HS256, passlib/bcrypt) — no external auth provider
- **AI**: Groq SDK (llama-3.3-70b-versatile)
- **Deploy**: Docker Compose (local), Render + Netlify (production)

## Project Structure
```
backend/
  app/
    api/v1/endpoints/    # FastAPI routers (core, academic, finance, operational)
    models/              # SQLAlchemy ORM models (38 models)
    schemas/             # Pydantic request/response schemas
    crud/                # Data access layer
    services/            # Business logic
    core/                # Config, security, database, cache, storage, exceptions
    middlewares/         # Tenant, request_id, metrics, quota
    utils/               # Audit logging utilities
  alembic/               # Database migrations

src/                     # Frontend (React)
  api/                   # Axios client
  components/            # UI + feature components
  contexts/              # Auth, Tenant, Theme providers
  hooks/                 # Custom React hooks
  i18n/                  # Internationalization (5 languages)
  pages/                 # 152 page components across 6 portals
  queries/               # React Query hooks
  routes/                # Route definitions per role
  stores/                # Zustand global state
  lib/                   # Types, utilities
```

## Key Conventions

### Backend
- All models use UUID primary keys (UUIDMixin)
- Tenant-scoped models use TenantMixin (adds tenant_id FK)
- Row-Level Security (RLS) enforced at PostgreSQL level
- Permission decorators: `@require_permission("resource:action")`
- 11 roles: SUPER_ADMIN, TENANT_ADMIN, DIRECTOR, DEPARTMENT_HEAD, TEACHER, STUDENT, PARENT, ALUMNI, STAFF, ACCOUNTANT, SECRETARY
- SUPER_ADMIN has tenant_id=NULL (platform-level)
- Endpoints return JSON, use SQLAlchemy text() for complex queries
- Alembic migrations auto-run at startup

### Frontend
- Routes are lazy-loaded per role portal
- Auth managed via React Context (AuthContext) + Zustand sync
- Tenant resolved from URL slug (/:tenantSlug/...) via TenantRoute component
- API calls via `apiClient` (Axios with token refresh interceptor)
- Token stored in localStorage key: `schoolflow:access_token`
- UI: Radix primitives + Tailwind + Lucide icons
- i18n: French default, with EN/ES/ZH/AR

### Naming
- Files: kebab-case (components), snake_case (Python)
- Components: PascalCase
- API endpoints: kebab-case with trailing slash
- Database: snake_case tables and columns
- Env vars: SCREAMING_SNAKE_CASE

## Common Commands
```bash
# Frontend
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run test         # Vitest unit tests

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Docker (full stack)
docker-compose up -d

# Migrations
cd backend
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## Environment
- `.env.example` — main template
- `.env.docker.example` — Docker-specific template
- Required: DATABASE_URL, SECRET_KEY (32+ chars), ADMIN_DEFAULT_PASSWORD
- Optional: GROQ_API_KEY, MINIO_*, REDIS_URL, SENTRY_DSN

## Testing
- Frontend: Vitest + Playwright
- Backend: pytest + pytest-asyncio
- E2E tests in `tests/e2e/`

## Important Notes
- Never use @supabase/supabase-js — legacy dependency removed
- Operational tables without ORM models are managed in `app/core/operational_tables.py`
- npm install requires `--legacy-peer-deps` flag
- Production build needs `VITE_API_URL` or runtime config via `window.__SCHOOLFLOW_CONFIG__`
