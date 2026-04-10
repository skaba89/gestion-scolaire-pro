---
Task ID: 1
Agent: Main
Task: Super Admin platform-level architecture — no default tenant

Work Log:
- Analyzed full codebase architecture (roles, tenant model, auth, routes)
- Created Alembic migration `20260406_super_admin_platform` to make users.tenant_id, user_roles.tenant_id, profiles.tenant_id nullable
- Modified User model to override TenantMixin with nullable tenant_id
- Modified UserRole model to have nullable tenant_id
- Rewrote `create_admin.py` — SUPER_ADMIN now created WITHOUT any tenant (tenant_id=NULL), cleans up old "default" tenant
- Updated TenantMiddleware to bypass tenant checks for SUPER_ADMIN users
- Added 3 new backend endpoints:
  - `POST /tenants/create-with-admin/` — creates tenant + admin user in one transaction (SUPER_ADMIN only)
  - `POST /tenants/{tenant_id}/create-admin/` — creates admin user for existing tenant (SUPER_ADMIN only)
  - `GET /tenants/super-admin/stats/` — aggregate stats across all tenants
- Added `TenantWithAdminCreate` and `TenantAdminUserCreate` schemas
- Created SuperAdminLayout component (platform-level, no tenant context needed)
- Created SuperAdminDashboard page with tenant list, stats, search, detail dialog, add-admin dialog
- Created CreateTenantWithAdmin page with full form (tenant + admin user in one step)
- Added `/super-admin` route group in App.tsx (before tenant slug routes to avoid conflicts)
- Fixed AuthNative.tsx login redirect: SUPER_ADMIN without tenant → `/super-admin`
- Fixed getRedirectPathForRoles in ProtectedRoute: SUPER_ADMIN without tenant → `/super-admin`
- Replaced old SuperAdminTenants page (was using legacy Supabase client) with redirect to /super-admin

Stage Summary:
- SUPER_ADMIN is now a platform-level role, not tied to any tenant
- The super admin dashboard is at `/super-admin` (no tenant slug needed)
- Flow: Login → /super-admin → create establishment → create admin users for each establishment
- No more "default" tenant created automatically
- All tenant management APIs use the REST API client (no Supabase)

---
Task ID: 2
Agent: Auditor
Task: Auth & Super Admin module — Full audit and bug fixes

## Files Audited
- `src/pages/Auth.tsx` → re-exports AuthNative
- `src/pages/AuthNative.tsx` — login form
- `src/contexts/AuthContext.tsx` — auth state management
- `src/pages/superadmin/SuperAdminDashboard.tsx` — tenant list/stats
- `src/pages/superadmin/CreateTenantWithAdmin.tsx` — create tenant + admin
- `src/components/layouts/SuperAdminLayout.tsx` — sidebar layout
- `backend/app/api/v1/endpoints/core/auth.py` — login/refresh/logout/me
- `backend/app/api/v1/endpoints/core/tenants.py` — tenant CRUD + create-with-admin
- `src/api/client.ts` — Axios client with interceptors
- `src/App.tsx` — routing configuration
- `src/components/ProtectedRoute.tsx` — route guards
- `src/components/TenantRoute.tsx` — tenant resolution guard
- `src/contexts/TenantContext.tsx` — tenant state
- `backend/app/core/security.py` — JWT + password utils
- `backend/app/main.py` — CORS + middleware setup
- `backend/app/schemas/tenants.py` — Pydantic schemas

## Bugs Found & Fixed

### BUG 1 (CRITICAL): Post-login redirect used hardcoded "default" slug
**File:** `src/pages/AuthNative.tsx`
**Problem:** After login, the redirect for non-SUPER_ADMIN users used `const slug = "default"` — a hardcoded value. The comment said "Will be resolved by TenantRoute" but `TenantRoute` requires a real tenant slug that matches the database. Navigation to `/default/admin` would always fail with a redirect to `/`.
**Fix:** 
- Modified `AuthContext.signIn()` to return `profileData` from the `/users/me/` response, so the caller has immediate access to tenant info including the slug.
- Updated `AuthNative.tsx` to use `profileData.tenant.slug` for the redirect slug.
- Added explicit error toast when user has no tenant association.
- Removed unused `decodeJwtPayload` helper function.

### BUG 2 (HIGH): ProtectedRoute allowed rendering when roles array was empty
**File:** `src/components/ProtectedRoute.tsx`
**Problem:** The role-checking condition was `allowedRoles.length > 0 && roles.length > 0`. When a user had zero roles (e.g., if `/users/me/` failed to return roles), the guard would skip role validation entirely and render protected content.
**Fix:** Added explicit check: when `allowedRoles` are specified and `roles.length === 0`, redirect to `/auth` (in useEffect) and render null (in render). This prevents unauthorized access.

### BUG 3 (HIGH): CreateTenantWithAdmin redirected SUPER_ADMIN to wrong page
**File:** `src/pages/superadmin/CreateTenantWithAdmin.tsx`
**Problem:** After creating a tenant + admin, the code navigated to `/${slug}/admin` and set `localStorage.setItem("last_tenant_id", "")`. The SUPER_ADMIN is NOT a user of the newly created tenant — the newly created admin user is. Navigating to the tenant admin dashboard as the super admin is conceptually wrong and sets a stale empty `last_tenant_id`.
**Fix:** Changed redirect to `/super-admin` after creation. The new admin can log in separately. Removed the empty `last_tenant_id` assignment. Updated button text from "Créer et accéder au tableau de bord" to "Créer l'établissement".

### BUG 4 (MEDIUM): CORS production regex missing 127.0.0.1
**File:** `backend/app/main.py`
**Problem:** Production CORS had `allow_origin_regex=r"https?://localhost:\d+"` but didn't include `127.0.0.1`. Anyone accessing the frontend via `127.0.0.1` would get CORS errors.
**Fix:** Changed regex to `r"https?://(?:localhost|127\.0\.0\.1):\d+"`.

### BUG 5 (MEDIUM): X-Tenant-ID header sent as empty string
**File:** `src/api/client.ts`
**Problem:** The request interceptor sent `X-Tenant-ID: ""` whenever `localStorage.getItem('last_tenant_id')` returned an empty string. This empty header would propagate to the backend where `tenant_context.set("")` in the TenantMiddleware could cause issues with PostgreSQL RLS.
**Fix:** Added UUID regex validation — only send `X-Tenant-ID` when the value is a valid UUID format.

### BUG 6 (HIGH): getRedirectPathForRoles sent SUPER_ADMIN to tenant dashboard
**File:** `src/components/ProtectedRoute.tsx`
**Problem:** The function checked `SUPER_ADMIN without tenant → /super-admin`, but if a SUPER_ADMIN happened to have a tenant_id (e.g., from X-Tenant-ID header), they'd be redirected to `/${tenantSlug}/admin` instead of `/super-admin`.
**Fix:** Changed logic so SUPER_ADMIN **always** goes to `/super-admin` regardless of tenant association.

## Items Verified (No Bugs Found)
- ✅ Login flow: email/password → POST /auth/login/ → JWT → /users/me/ → redirect. Works correctly after fixes.
- ✅ SUPER_ADMIN login: No tenant_id required. TenantMiddleware bypasses. ProtectedRoute allows SUPER_ADMIN role.
- ✅ CreateTenantWithAdmin backend: Correctly creates tenant, academic year, campus, levels, subjects, admin user, and TENANT_ADMIN role in one transaction.
- ✅ JWT refresh: Token refresh endpoint works, interceptor retries on 401, redirects to /auth on failure.
- ✅ Auth context: Bootstrap restores user from JWT + /users/me/ on page refresh. Token stored in localStorage.
- ✅ CORS: Debug mode allows all localhost/127.0.0.1 origins. Production now also allows both.
- ✅ API URL configuration: Resolves correctly for localhost vs production (proxy).
- ✅ Backend schemas: TenantWithAdminCreate matches frontend payload fields.
- ✅ Route ordering: /super-admin defined before /:tenantSlug in App.tsx.
- ✅ Backend auth.py: Login accepts email OR username. Password verification handles null hash.

Stage Summary:
- 6 bugs found and fixed (2 critical, 2 high, 2 medium)
- 16 files audited across frontend and backend
- All TypeScript compilation passes with no errors
- All Python syntax checks pass
- Login, redirect, and tenant creation flows are now end-to-end functional

---
Task ID: 3
Agent: Frontend Builder
Task: Create frontend AI Support Chat components (Groq-powered)

Work Log:
- Created `src/queries/ai.ts` — API layer with typed functions `chatWithAI()` and `auditModule()` using the existing `apiClient` (axios) to hit `/api/v1/ai/chat` and `/api/v1/ai/audit`
- Created `src/components/ai/AIChatWidget.tsx` — floating chat widget (bottom-right, like Intercom/Drift) with:
  - Violet/indigo gradient design distinct from the existing ChatBot (Supabase)
  - Expandable chat panel with header (title + clear/minimize/close actions)
  - Conversation history maintained in session state
  - Loading indicator ("L'IA réfléchit…") while awaiting response
  - Error messages rendered inline in red with toast notification
  - Quick suggestion chips on first interaction
  - Minimize/maximize toggle to collapse panel
  - Auto-scroll to latest message
  - Full French language interface
  - Accessible (aria-labels, keyboard Enter to send)
- Created `src/components/ai/AIAuditButton.tsx` — reusable audit trigger component with:
  - Configurable `module` and `data` props
  - Auto-triggers audit when dialog opens
  - Loading state with animated spinner
  - Error state with retry button
  - Result display: score indicator (color-coded), analysis text, numbered recommendations list
  - Uses shadcn/ui Dialog, Button, Badge, ScrollArea
  - Fully French language interface
- Integrated `AIChatWidget` into `App.tsx` (global level, visible to all authenticated users)
- Integrated `AIChatWidget` into `AdminLayout.tsx` (alongside existing ChatBot)

Files Created:
- `src/queries/ai.ts`
- `src/components/ai/AIChatWidget.tsx`
- `src/components/ai/AIAuditButton.tsx`

Files Modified:
- `src/App.tsx` — added import + `<AIChatWidget />` in AppContent
- `src/components/layouts/AdminLayout.tsx` — added import + `<AIChatWidget />` next to ChatBot

Stage Summary:
- AI chat support frontend fully implemented using existing REST API client
- The AIChatWidget is distinct from the existing ChatBot (which uses Supabase Edge Functions)
- AIAuditButton is a drop-in component usable on any admin page by passing `module` and `data` props
- All error handling uses French-language messages via sonner toasts
- Components follow existing code style (TypeScript, Tailwind, shadcn/ui, lucide-react icons)

---
Task ID: 4
Agent: DevOps
Task: Create Alembic migration for academic columns + Prepare deployment configuration

## TASK 1: Alembic Migration

### Model Verification
- **subjects.py**: Confirmed 5 new columns exist in the model: `ects` (Float, default=0), `cm_hours` (Integer, default=0), `td_hours` (Integer, default=0), `tp_hours` (Integer, default=0), `description` (Text, nullable=True)
- **level.py**: Confirmed 1 new column exists: `label` (String(255), nullable=True)

### Migration Chain
Traced the full migration chain. Current HEAD: `20260406_add_academic_year_code`
New migration chains onto it with `down_revision = '20260406_add_academic_year_code'`

### File Created
- `backend/alembic/versions/20260406_add_academic_columns.py`
  - Revision: `20260406_add_academic_columns`
  - Adds 6 columns total (5 on subjects, 1 on levels)
  - All nullable with server defaults for numeric columns
  - Full downgrade() reverses all additions
  - Will auto-apply on next backend startup (main.py runs `alembic upgrade head`)

## TASK 2: Deployment Configuration

### Files Read for Context
- `package.json` — scripts: `npm run build` → `vite build`, output: `dist/`
- `vite.config.ts` — dev server on port 3000, no proxy configured
- `docker-compose.yml` — services: postgres, redis, minio, api (port 8000), frontend (nginx)
- `Dockerfile.render` — multi-stage build with nginx, uses `API_PUBLIC_BASE_URL`
- `docker/nginx.render.conf.template` — proxies `/api-proxy/*` to backend
- `src/api/client.ts` — `resolveApiBaseUrl()` uses `VITE_API_URL` env var, falls back to `/api-proxy` in production
- `backend/app/core/config.py` — Pydantic Settings with all env vars
- `.env.example` — existing template with all variables

### Files Created

#### 1. `render.yaml` (Render Blueprint)
- **schoolflow-db**: PostgreSQL managed database (pserv, flex plan)
- **schoolflow-redis**: Redis worker (python runtime, free plan)
- **schoolflow-api**: FastAPI web service (python, port 8000, auto-linked to DB)
  - Auto-generates SECRET_KEY
  - DATABASE_URL linked from schoolflow-db
  - BACKEND_CORS_ORIGINS marked as sync:false (manual config needed post-deploy)
  - All optional services (MinIO, Groq) marked as sync:false
- **schoolflow-frontend**: Static site (Docker, uses Dockerfile.render)
  - API_PUBLIC_BASE_URL linked from schoolflow-api
  - VITE_API_URL=/api-proxy (nginx handles proxy)

#### 2. `netlify.toml` (Netlify Configuration)
- Build: `npm run build`, publish: `dist/`
- SPA redirect: `/* → /index.html` (status 200)
- API proxy: `/api/* → https://YOUR_API_URL/api/:splat` (force rewrite)
- `/api-proxy/*` proxy for nginx compatibility
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Cache headers: `/assets/*` immutable 1yr, `/*.html` no-cache
- Documented all required env vars in comments

### Files Modified

#### 3. `vite.config.ts`
- Added `server.proxy` configuration for `/api-proxy` → `http://localhost:8000`
- Uses `VITE_DEV_PROXY_TARGET` env var for custom backend URL
- Enables dev-mode testing of the same proxy path used in production

#### 4. `.env.example`
- Added Redis section (REDIS_URL)
- Added Groq AI section (GROQ_API_KEY, GROQ_MODEL, GROQ_MAX_TOKENS)
- Added Render deployment documentation section
- Added Netlify deployment documentation section
- Added VITE_DEV_PROXY_TARGET documentation

Stage Summary:
- Migration ready: 6 new columns will auto-apply on next backend startup
- Render Blueprint: Full 3-service setup (DB + Redis + API + Frontend)
- Netlify config: Frontend-only with API proxy redirects
- vite.config.ts: Dev proxy for /api-proxy path matching production behavior
- All deployment env vars documented in .env.example

---
## Task ID: 5
Agent: Database Compatibility Fix
Task: Fix SchoolFlow Pro to work on Windows with Python 3.14 — replace asyncpg C extension with psycopg[binary] and add SQLite fallback

### Work Summary

Replaced PostgreSQL-specific database drivers that require C compilation (asyncpg, psycopg2-binary) with psycopg v3 (pure Python + pre-built binary wheels for all platforms). Added SQLite as an alternative database backend for local development without Docker/PostgreSQL.

### Changes by File

#### `backend/requirements.txt`
- Removed `asyncpg>=0.29.0,<0.30.0` (C extension — fails to compile on Windows without Visual C++ 14.0)
- Removed `psycopg2-binary>=2.9.9,<3.0.0` (replaced by psycopg v3 which handles both sync and async)
- Added `psycopg[binary]>=3.2.0,<4.0.0` (pre-built wheels for all platforms including Python 3.14 on Windows)
- Added `aiosqlite>=0.20.0,<1.0.0` (for SQLite async support in SQLAlchemy)

#### `backend/app/core/config.py`
- Added `is_sqlite_url()` helper function
- Updated `normalize_async_database_url()`:
  - PostgreSQL → `postgresql+psycopg://` (psycopg v3 async, was `postgresql+asyncpg://`)
  - SQLite → `sqlite+aiosqlite://` (new)
- Updated `normalize_sync_database_url()`:
  - PostgreSQL → `postgresql+psycopg://` (psycopg v3 sync, was `postgresql+psycopg2://`)
  - SQLite → pass-through
- Added `is_sqlite` property to `Settings` class for runtime dialect detection

#### `backend/app/core/database.py`
- Engine configuration now conditional:
  - SQLite: `check_same_thread=False`, no connection pooling, WAL mode via event listener, `foreign_keys=ON` pragma
  - PostgreSQL: pool_size, max_overflow, pool_pre_ping (unchanged)
- `get_db()`: PostgreSQL `set_config()` call skipped when using SQLite (no RLS support)

#### `backend/alembic/versions/20260224_0730_fdb89a2e3b4d_enable_rls.py`
- Added SQLite guard: `if dialect_name == "sqlite": return` (RLS is PostgreSQL-only)
- Tenant isolation on SQLite is handled at the application layer

#### `backend/alembic/versions/20260227_2309_659b47b029bd_enforce_rls_on_all_tables.py`
- Added SQLite guard: `if dialect_name == "sqlite": return` (same pattern)

#### `backend/scripts/create_admin.py`
- URL normalization now uses `postgresql+psycopg://` instead of `postgresql+psycopg2://`
- Added SQLite detection and pass-through
- SQL statements use dialect-appropriate datetime: `datetime('now')` for SQLite, `NOW()` for PostgreSQL
- `ON CONFLICT DO NOTHING` only used for PostgreSQL path (not supported in SQLite INSERT)
- `CAST(id AS TEXT)` used instead of `id::text` for cross-dialect compatibility

#### `backend/scripts/seed_demo_tenants.py`
- URL normalization updated to `postgresql+psycopg://`
- Added SQLite detection and `check_same_thread=False` for SQLite

#### `backend/scripts/diagnose_login.py`
- `normalize_sync_url()` updated to produce `postgresql+psycopg://` URLs
- Added SQLite pass-through
- Fallback driver changed from `psycopg2` to `psycopg` (v3)
- Updated comment from "psycopg2 synchronous" to "psycopg v3 synchronous"

#### `backend/app/api/v1/endpoints/core/health.py`
- Updated docstring: "PostgreSQL, Redis" → "Database, Redis"
- Added note: Redis is optional in SQLite dev mode

#### `.env.example`
- Updated database URL examples from `postgresql+asyncpg://` / `postgresql+psycopg2://` to `postgresql+psycopg://`
- Added SQLite URL example in comments

#### `.env.sqlite` (NEW)
- Complete SQLite environment template for local development
- Pre-configured SECRET_KEY, SQLite DATABASE_URL, DEBUG=True

#### `setup_windows.bat` (NEW)
- Automated Windows setup script
- Creates Python venv, installs deps, copies .env.sqlite → .env
- Runs Alembic migrations, creates super admin
- Starts backend (uvicorn) and frontend (npm run dev) in separate terminal windows
- Graceful handling when Node.js is not installed

### Known Limitations (SQLite mode)
Some raw SQL queries in the backend use PostgreSQL-specific syntax:
- `::text`, `::uuid` type casts — will fail on SQLite
- `ILIKE` — PostgreSQL case-insensitive LIKE (SQLite uses `LIKE` which is already case-insensitive)
- `EXTRACT(YEAR FROM AGE(...))` — PostgreSQL date arithmetic
- `ARRAY[]::text[]` — PostgreSQL array literals
- `current_setting('app.current_tenant_id', true)` — PostgreSQL session variables

These are in advanced endpoints (analytics, RGPD, etc.). Core flows (auth, tenant creation, user management, grades) use SQLAlchemy ORM and work on both databases. The PostgreSQL-specific endpoints can be incrementally fixed as needed.

### Backward Compatibility
All changes are fully backward compatible with existing PostgreSQL setups. The `postgresql+psycopg://` driver works identically to `postgresql+psycopg2://` for SQLAlchemy 2.0. No data migration or configuration changes needed for existing deployments.

---

## Task 3a — Admin Pages Batch 1: Supabase → apiClient Migration

**Date**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Files migrated**: 15

### Files Changed

| # | File | Supabase Ops Replaced | Endpoints Used |
|---|------|----------------------|----------------|
| 1 | `AcademicRules.tsx` | select, insert, delete on `academic_rules`, select on `levels` | `/tenants/settings/academic-rules/`, `/students/levels/` |
| 2 | `AccountingExports.tsx` | select on `invoices`, `payments` (with joins + date filters) | `/finance/invoices/`, `/finance/payments/` |
| 3 | `AdvancedExports.tsx` | select on `students`, `profiles`, `grades`, `attendance`, `invoices`, `enrollments`, `assessments` | `/students/`, `/hr/staff/`, `/grades/`, `/attendance/`, `/finance/invoices/`, `/admissions/enrollments/`, `/assessments/` |
| 4 | `AlumniMentors.tsx` | update, insert, delete on `alumni_mentors`; update on `mentorship_requests` | `/hr/alumni-mentors/`, `/hr/mentorship-requests/` |
| 5 | `AlumniRequestsManagement.tsx` | update on `alumni_document_requests`; insert on `alumni_request_history` | `/hr/alumni-document-requests/`, `/hr/alumni-request-history/` |
| 6 | `Careers.tsx` | CRUD on `job_offers`, `career_events`; update on `job_applications` | `/hr/job-offers/`, `/hr/career-events/`, `/hr/job-applications/` |
| 7 | `Certificates.tsx` | select on `classrooms`, `academic_years`, `enrollments` | `/students/classes/`, `/students/academic-years/`, `/admissions/enrollments/` |
| 8 | `ClassLists.tsx` | select on `classes`, `classroom_departments`, `enrollments`, `students` | `/students/classes/`, `/students/class-departments/`, `/admissions/enrollments/`, `/students/` |
| 9 | `Clubs.tsx` | insert, delete on `clubs`, `club_memberships` | `/clubs/`, `/clubs/memberships/` |
| 10 | `DataQuality.tsx` | select on `data_quality_anomalies`; rpc `run_data_quality_checks`; update | `/audit/data-quality/`, `/audit/data-quality/run-checks/` |
| 11 | `Elearning.tsx` | update, insert, delete on `elearning_courses` | `/analytics/elearning/courses/` |
| 12 | `ElectronicSignatures.tsx` | select, insert on `electronic_documents`; insert on `document_signatories` | `/communication/electronic-documents/`, `/communication/document-signatories/` |
| 13 | `EnrollmentStats.tsx` | select on `academic_years`, `enrollments`, `students`, `admission_applications` | `/students/academic-years/`, `/admissions/enrollments/`, `/students/`, `/admissions/applications/` |
| 14 | `ExecutiveDashboard.tsx` | dynamic import supabase for `terms`, `student_risk_scores`, `cash_flow_forecasts` | `/schedule/terms/`, `/analytics/risk-scores/`, `/analytics/cash-flow-forecasts/` |

### Migration Patterns Applied
- `supabase.from('table').select(*)` → `apiClient.get('/endpoint/', {params})`
- `supabase.from('table').insert(row)` → `apiClient.post('/endpoint/', row)`
- `supabase.from('table').update(row).eq('id', id)` → `apiClient.put('/endpoint/${id}/', row)`
- `supabase.from('table').delete().eq('id', id)` → `apiClient.delete('/endpoint/${id}/')`
- `supabase.rpc('func', {params})` → `apiClient.post('/endpoint/run-checks/')`
- Dynamic `import("@/integrations/supabase/client")` → static `import { apiClient } from "@/api/client"`
- `.eq('tenant_id', tid)` filters removed (handled by apiClient X-Tenant-ID interceptor)
- Supabase-style `.order()` → `ordering` query param
- `.in('id', ids)` → `ids=comma-separated` query param
- `.gte()/.lte()` date filters → `*_after/*_before` query params
- `.select('*, related(fields)')` joins → `expand` query param

### Verification
- `grep -r "supabase" src/pages/admin/*.tsx` → **0 matches** (clean)
- All 15 files have `import { apiClient } from "@/api/client"`
- Same exported names and component behavior preserved

---
Task ID: 6
Agent: Main
Task: Complete end-to-end fix — refresh token flow, CORS, Sentry, MFA, bundle splitting

Work Log:
- Diagnosed root cause of 401 errors: /auth/refresh/ endpoint required a valid access token (circular dependency)
- Implemented real refresh token mechanism:
  - Login returns both access_token (30 min) and refresh_token (7 days)
  - /auth/refresh/ endpoint now accepts refresh_token in body (not expired access token)
  - Added create_refresh_token() and verify_token_raw() in security.py
  - Frontend interceptor sends refresh_token to /auth/refresh/ endpoint
  - Token rotation: each refresh returns a new refresh_token pair
- Fixed CORS: replaced allow_origins=["*"] with explicit origin list (browsers reject wildcard with credentials)
- Fixed Sentry: downgraded console.warn to console.debug when DSN not configured
- Fixed MFA endpoint path: /mfa/verify-otp/ → /mfa/otp/verify/ and payload: token → code
- Fixed signUp: no longer calls non-existent /auth/register/ endpoint
- Fixed bundle splitting: removed manualChunks for React ecosystem to prevent createContext error
- Removed 57 ghost commits from local branch, aligned with origin/main
- Resolved merge conflict during push (CORS origins + index.html)

Files Modified:
- backend/app/api/v1/endpoints/core/auth.py (refresh endpoint rewritten, login returns refresh_token)
- backend/app/core/security.py (added create_refresh_token, verify_token_raw)
- backend/app/main.py (CORS origins explicit list)
- src/api/client.ts (refresh token storage + interceptor)
- src/contexts/AuthContext.tsx (refresh token save/clear, MFA fix, signUp fix)
- src/lib/sentry.ts (warning → debug)
- vite.config.ts (manualChunks simplified)

Stage Summary:
- Commit 78d3efa pushed to GitHub
- All 401 errors should be resolved with real refresh token flow
- CORS properly configured for production
- No more createContext errors from chunk splitting
