# Copilot Instructions - SchoolFlow Pro

SchoolFlow Pro is a **multi-tenant school management platform** built with React/Vite frontend and Supabase backend. Key architectural decisions require understanding tenant isolation, role-based access, and Supabase patterns.

## Architecture Overview

### Frontend Stack
- **React 18 + TypeScript** with Vite (SWC compiler)
- **shadcn/ui** components with Tailwind CSS
- **TanStack Query** for data fetching and caching
- **React Router** for navigation with lazy-loaded routes
- **Capacitor** for native mobile app builds (iOS/Android)
- **PWA** enabled with offline support and workbox caching

### Backend Architecture (Docker-Compose)
```
Frontend (React) 
  ↓
Kong API Gateway (Port 8000)
  ├─ PostgREST (/rest/v1/*) → PostgreSQL queries
  ├─ GoTrue (/auth/v1/*) → User authentication
  ├─ Realtime (/realtime/v1/*) → WebSocket subscriptions
  └─ Storage (/storage/*) → File management

PostgreSQL 15 (5432)
  ├─ auth schema (GoTrue managed)
  ├─ public schema (app tables: tenants, profiles, students, etc.)
  └─ storage schema (file buckets)
```

### Tenant Isolation Pattern
**This is critical to understand** — every request is tenant-scoped:

1. **Auth Context** (`src/contexts/AuthContext.tsx`) fetches:
   - User profile → includes `tenant_id`
   - User roles per tenant → `user_roles` table with `tenant_id`
   - Current tenant → stored in auth context

2. **Tenant Context** (`src/contexts/TenantContext.tsx`) maintains:
   - `currentTenant` object (5-minute cache)
   - Switching tenants updates all downstream queries

3. **RLS (Row-Level Security)** enforces tenant access:
   - Every table has `tenant_id` column
   - RLS policies filter: `WHERE tenant_id = auth.jwt_claim('tenant_id')`
   - ⚠️ **JWT must include tenant_id claim** in auth context setup

4. **Query Pattern** — Always filter by tenant:
   ```tsx
   // ✅ Correct - uses tenant_id from auth context
   const { data } = await supabase
     .from("students")
     .select("*")
     .eq("tenant_id", currentTenant.id);
   
   // ❌ Wrong - skips tenant isolation
   const { data } = await supabase
     .from("students")
     .select("*");
   ```

## Role-Based Access Control (RBAC)

**AppRole types** (`src/lib/types.ts`):
```typescript
type AppRole = 
  | "SUPER_ADMIN"      // Only Lovable admins
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
- `profile.email` → User email from profiles table

## Key Data Models & Relationships

### Tenants (Organizations)
- Table: `public.tenants` (23 columns)
- Columns: `id, name, slug, logo_url, address, phone, email, website, type, is_active, settings, created_by, created_at`
- Unique constraint on `slug` for subdomain routing
- Trigger auto-populates `created_by` from `auth.uid()`
- ⚠️ **Important**: `settings` is JSONB — use `.->` operator for queries

### Profiles (Users per Tenant)
- Table: `public.profiles` (tied to `auth.users`)
- Foreign key on `tenant_id` — user can have one primary tenant
- Used in `AuthContext` for user metadata
- Additional columns: `first_name, last_name, phone, avatar_url, is_active`

### User Roles (Tenant-specific)
- Table: `public.user_roles` (`user_id, tenant_id, role`)
- Composite primary key: `(user_id, tenant_id)` 
- **Upsert pattern recommended** when assigning roles to avoid conflicts
- Always query with both `user_id` AND `tenant_id`

### Students, Grades, Attendance
- Student table includes: `tenant_id, level_id, classroom_id, academic_year_id`
- Grades are per: `student_id, subject_id, academic_year_id, term_id`
- Attendance tracked: `student_id, date, status (PRESENT|ABSENT|LATE|EXCUSED)`

## Development Workflows

### Setup Local Development
```bash
npm install
npm run dev  # Starts on http://localhost:8080
```

### Start Full Infrastructure (Docker)
```bash
# Ensure .env has required variables
docker-compose up

# Supabase Dashboard: http://localhost:3001
# Frontend: http://localhost:3000
# API Docs: Kong routes at http://localhost:8000
```

### Database Migrations
- Migration files in `docker/init/` — numbered sequentially
- Each file runs once on container startup
- For schema changes: Create new file like `NN-description.sql`
- **RLS must be enabled** and tested before merging
- Use `SECURITY DEFINER` for triggers that need elevated perms

### Test Authentication
```bash
# Generate JWT tokens
python generate_jwt.py

# Test API endpoints
python test_auth_endpoints.py
python test_complete_tenant.py
```

### Debugging Issues
1. **Database errors** → Check `docker/init/` migration files
2. **Auth failures** → Verify JWT in `GOTRUE_JWT_SECRET` matches config
3. **RLS blocking queries** → Check user has `tenant_id` in JWT or policies assume `auth.uid()`
4. **Tenant context stale** → TenantContext has 5-min TTL cache — clear localStorage if needed
5. **Notifications not firing** → Ensure realtime subscriptions use `.on()` not `.select()`

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
│  └─ utils.ts
└─ integrations/
   └─ supabase/
      ├─ client.ts      # Auto-generated supabase client
      └─ types.ts       # Auto-generated DB types
```

### Supabase Client Initialization
```tsx
// src/integrations/supabase/client.ts (auto-generated, DON'T EDIT)
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { storage: localStorage, persistSession: true } }
);
```

### React Query Pattern (Data Fetching)
```tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function StudentList() {
  const { currentTenant } = useTenant();
  
  const { data: students, isLoading, error } = useQuery({
    queryKey: ["students", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, grades(*), attendance(*)")
        .eq("tenant_id", currentTenant!.id);
      if (error) throw error;
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
| **Role assignment fails** | Using `.insert()` when record may exist | Use `.upsert()` with `onConflict: "user_id,tenant_id"` |
| **Tenant isolation bypassed** | Forgot to add `.eq("tenant_id", id)` filter | Always include tenant filter in queries |
| **Stale tenant data** | TenantContext cache (5-min TTL) | Clear localStorage or wait for expiry |
| **RLS blocks query** | JWT missing tenant_id claim or policy too strict | Check `GOTRUE_JWT_AUD` and RLS uses `auth.jwt_claim('tenant_id')` |
| **Notifications non-reactive** | Missing button `type="button"` or form submission happens | Set `type="button"` and `e.preventDefault()` |

## Important Files Reference

- **Auth Context**: `src/contexts/AuthContext.tsx` — User session, roles, tenant from JWT
- **Tenant Context**: `src/contexts/TenantContext.tsx` — Current tenant with caching
- **Type Definitions**: `src/lib/types.ts` — All AppRole, Tenant, Profile, etc. types
- **Database Schema**: `docker/init/*.sql` — Initialize by number order
- **Docker Config**: `docker-compose.yml` — Service setup (Kong, PostgREST, GoTrue)
- **Vite Config**: `vite.config.ts` — PWA manifest, lazy route config
- **Main Entry**: `src/main.tsx` → `src/App.tsx` → Route setup

## PWA & Native Features

- **Offline-first design**: Workbox caches API responses for 24 hours
- **Native builds**: Capacitor for iOS/Android — configured in `capacitor.config.ts`
- **Notifications**: Supabase Realtime subscriptions + Push notifications via Capacitor
- **Storage**: Supabase Storage bucket for avatars, documents

## Environment Variables Required

```env
VITE_SUPABASE_URL=http://localhost:8000          # Kong gateway URL
VITE_SUPABASE_PUBLISHABLE_KEY=<anon_key>         # Anonymous key for public access
VITE_SUPABASE_PROJECT_ID=local                   # Project identifier
JWT_SECRET=super-secret-jwt-token-with-32-chars  # For GoTrue signing
SUPABASE_ANON_KEY=<anon_key>                     # Same as publishable
SUPABASE_SERVICE_ROLE_KEY=<service_key>          # For backend operations
```

---

**Last Updated**: January 14, 2026 | **Version**: 1.0
