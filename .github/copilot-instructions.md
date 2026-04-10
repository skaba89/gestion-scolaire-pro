# Copilot Instructions - SchoolFlow Pro

SchoolFlow Pro is a **multi-tenant school management platform** built with React/Vite frontend and FastAPI backend with native JWT authentication. Key architectural decisions require understanding tenant isolation, role-based access, and JWT patterns.

## Architecture Overview

### Frontend Stack
- **React 18 + TypeScript** with Vite (SWC compiler)
- **shadcn/ui** components with Tailwind CSS
- **TanStack Query** for data fetching and caching
- **React Router** for navigation with lazy-loaded routes
- **Axios** for HTTP requests to the FastAPI backend
- **Capacitor** for native mobile app builds (iOS/Android)
- **PWA** enabled with offline support and workbox caching

### Backend Architecture (FastAPI + Docker)
```
Frontend (React/Vite — Port 3000)
  ↓ HTTP/JSON
FastAPI Backend (Port 8000)
  ├─ /api/v1/auth/*      → JWT authentication (login, register, refresh, me)
  ├─ /api/v1/users/*     → User management
  ├─ /api/v1/students/*  → Student CRUD
  ├─ /api/v1/grades/*    → Grade management
  ├─ /api/v1/attendance/*→ Attendance tracking
  ├─ /api/v1/tenants/*   → Multi-tenant management
  └─ /docs               → OpenAPI/Swagger

PostgreSQL 16 (5432)
  ├─ public schema (app tables: tenants, users, students, etc.)
  └─ managed by SQLAlchemy ORM + Alembic migrations

Redis (6379)
  └─ Session cache, rate limiting

MinIO (9000)
  └─ S3-compatible file storage
```

### Authentication (Native JWT)
- **FastAPI** handles auth natively — no external identity provider
- JWT tokens signed with `SECRET_KEY` (HS256)
- Login endpoint returns access_token + refresh_token
- Token includes `user_id`, `tenant_id`, `roles` claims
- Middleware extracts user context from `Authorization: Bearer <token>`
- Password hashing with bcrypt

### Tenant Isolation Pattern
**This is critical to understand** — every request is tenant-scoped:

1. **Auth Context** (`src/contexts/AuthContext.tsx`) manages:
   - User session (JWT stored in localStorage/memory)
   - User profile → includes `tenant_id`
   - User roles per tenant
   - Current tenant → stored in auth context

2. **Tenant Context** (`src/contexts/TenantContext.tsx`) maintains:
   - `currentTenant` object
   - Switching tenants updates all downstream queries

3. **Backend enforcement** ensures tenant access:
   - Every table has `tenant_id` column
   - API endpoints filter by tenant from JWT claims
   - SQLAlchemy queries scoped to `tenant_id` from current user

4. **Query Pattern** — Always filter by tenant via API:
   ```tsx
   // ✅ Correct — API automatically scopes to current tenant
   const { data } = await api.get('/api/v1/students');
   
   // Backend extracts tenant_id from JWT and filters automatically
   ```

## Role-Based Access Control (RBAC)

**AppRole types** (`src/lib/types.ts`):
```typescript
type AppRole = 
  | "SUPER_ADMIN"      // Platform-wide admin
  | "TENANT_ADMIN"     // School admin for one tenant
  | "DIRECTOR"         // Department/principal
  | "TEACHER"          // Instructor
  | "STUDENT"          // Learner
  | "PARENT"           // Student guardian
  | "ACCOUNTANT"       // Finance staff
  | "STAFF";           // Support staff
```

**Usage in ProtectedRoute** (`src/components/ProtectedRoute.tsx`):
```tsx
<ProtectedRoute allowedRoles={["TEACHER", "DIRECTOR"]}>
  <GradeBook />
</ProtectedRoute>
```

**Auth context helpers**:
- `hasRole(role)` → Check single role
- `isAdmin()` → Check if SUPER_ADMIN or TENANT_ADMIN
- `profile.email` → User email from API

## Key Data Models & Relationships

### Tenants (Organizations)
- SQLAlchemy model in `backend/app/models/`
- Columns: `id, name, slug, logo_url, address, phone, email, website, type, is_active, settings, created_by, created_at`
- Unique constraint on `slug`

### Users
- Table: `public.users` with SQLAlchemy model
- Foreign key on `tenant_id`
- Password hashed with bcrypt
- Columns: `email, first_name, last_name, phone, avatar_url, is_active, hashed_password`

### User Roles (Tenant-specific)
- Table: `public.user_roles` (`user_id, tenant_id, role`)
- Composite primary key: `(user_id, tenant_id)`

### Students, Grades, Attendance
- Student table includes: `tenant_id, level_id, classroom_id, academic_year_id`
- Grades are per: `student_id, subject_id, academic_year_id, term_id`
- Attendance tracked: `student_id, date, status (PRESENT|ABSENT|LATE|EXCUSED)`

## Development Workflows

### Setup Local Development
```bash
# Frontend
npm install
npm run dev  # Starts on http://localhost:5173

# Backend (in separate terminal)
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Start Full Infrastructure (Docker)
```bash
# Ensure .env.docker has required variables
docker compose --env-file .env.docker up -d

# Frontend: http://localhost:3000
# API: http://localhost:8000
# API Docs: http://localhost:8000/docs
# PgAdmin: http://localhost:5050
# MinIO Console: http://localhost:9001
```

### Create Admin User
```bash
# After starting the backend, use the CLI or API:
cd backend
python -m app.scripts.create_admin --email admin@schoolflow.local --password <password>
```

### Database Migrations
- Alembic migrations in `backend/alembic/versions/`
- Create new migration: `alembic revision --autogenerate -m "description"`
- Apply migrations: `alembic upgrade head`
- Rollback: `alembic downgrade -1`

### Test Authentication
```bash
# Login to get JWT token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@schoolflow.local", "password": "<password>"}'

# Use token for authenticated requests
curl http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer <access_token>"
```

### Debugging Issues
1. **Database errors** → Check Alembic migrations are up to date
2. **Auth failures** → Verify SECRET_KEY matches between services, check JWT expiry
3. **Tenant isolation issues** → Verify JWT includes tenant_id claim
4. **CORS errors** → Check BACKEND_CORS_ORIGINS includes frontend URL
5. **File upload issues** → Verify MinIO is running and MINIO_BUCKET exists

## Code Organization & Patterns

### Component Structure
```
src/
├─ components/
│  ├─ layouts/          # Role-specific layouts (AdminLayout, TeacherLayout, etc.)
│  ├─ [feature]/        # Feature-scoped components (students/, grades/, etc.)
│  ├─ ui/               # shadcn/ui primitives
│  ├─ ProtectedRoute.tsx     # Role-based routing
│  ├─ TenantBranding.tsx     # Tenant logo/name
│  └─ ThemeSwitcher.tsx      # Dark mode toggle
├─ contexts/            # Auth, Tenant, Theme providers
├─ pages/               # Lazy-loaded route pages
├─ lib/
│  ├─ types.ts          # App-wide TypeScript interfaces
│  ├─ utils.ts
│  └─ api.ts            # Axios instance with JWT interceptor
└─ services/            # API service modules
```

### React Query Pattern (Data Fetching)
```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

function StudentList() {
  const { currentTenant } = useAuth();
  
  const { data: students, isLoading, error } = useQuery({
    queryKey: ["students", currentTenant?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/students');
      return data;
    },
    enabled: !!currentTenant,
  });
  
  if (error) return <div>Error: {error.message}</div>;
  if (isLoading) return <LoadingSpinner />;
  return <StudentTable students={students} />;
}
```

### Form Validation with React Hook Form
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid email"),
  first_name: z.string().min(1, "Required"),
});

export function UserForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email")} />
      {errors.email && <span>{errors.email.message}</span>}
    </form>
  );
}
```

## Common Pitfalls & Fixes

| Issue | Cause | Solution |
|-------|-------|----------|
| **Event handlers not firing** | Missing `e.preventDefault()` or `e.stopPropagation()` | Add type safety: `(e: React.MouseEvent<HTMLButtonElement>) => {}` |
| **Role assignment fails** | Duplicate key on upsert | Use proper upsert with conflict handling |
| **Tenant isolation bypassed** | Missing tenant_id in JWT | Ensure login endpoint includes tenant_id |
| **CORS errors** | Frontend URL not in allowed origins | Add to BACKEND_CORS_ORIGINS env var |
| **Token expired** | ACCESS_TOKEN_EXPIRE_MINUTES too short | Use refresh token or increase expiry |

## Important Files Reference

- **Auth Context**: `src/contexts/AuthContext.tsx` — User session, roles, tenant from JWT
- **Tenant Context**: `src/contexts/TenantContext.tsx` — Current tenant
- **Type Definitions**: `src/lib/types.ts` — All AppRole, Tenant, User, etc. types
- **API Client**: `src/lib/api.ts` — Axios instance with JWT interceptor
- **Backend Models**: `backend/app/models/` — SQLAlchemy models
- **API Routes**: `backend/app/api/` — FastAPI route handlers
- **Migrations**: `backend/alembic/versions/` — Database migrations
- **Docker Config**: `docker-compose.yml` — Service setup (Postgres, Redis, MinIO, API, Frontend)

## Environment Variables Required

```env
# Backend
SECRET_KEY=<generated-secret>                    # JWT signing key
DATABASE_URL=postgresql://...                     # PostgreSQL connection
REDIS_URL=redis://localhost:6379/0               # Redis for caching
MINIO_ENDPOINT=localhost:9000                     # MinIO S3 storage
MINIO_ACCESS_KEY=minioadmin                       # MinIO credentials
MINIO_SECRET_KEY=<minio-password>
MINIO_SECURE=false
MINIO_BUCKET=schoolflow
BACKEND_CORS_ORIGINS=http://localhost:5173        # Allowed frontend origins
DEBUG=True

# Frontend
VITE_API_URL=http://localhost:8000                # Backend API URL
```

---

**Last Updated**: June 2025 | **Version**: 2.0 (JWT-native architecture)
