# 🚀 Getting Started - Fresh Project Guide

**Status**: ✅ Project running with clean database  
**Frontend**: http://localhost:8080/  
**Backend**: http://localhost:8000/ (Kong Gateway)  
**Studio**: http://localhost:3001/ (Supabase)

---

## 🎯 What's Ready

✅ **Frontend** - React app running in dev mode  
✅ **Database** - PostgreSQL with 36 tables, no test data  
✅ **Authentication** - GoTrue auth system ready  
✅ **API** - PostgREST REST API running  
✅ **Real-time** - Supabase Realtime ready  
✅ **Storage** - File storage initialized  
✅ **Email** - MailHog for testing  

---

## 🔐 Initial Setup

### 1. Access Supabase Studio
Go to: **http://localhost:3001/**

You can use Supabase Studio to:
- View database schema
- Manage users and roles
- Configure authentication
- Test API calls
- View real-time subscriptions

### 2. Create First Admin Account

**Option A: Via Supabase Studio**
1. Go to http://localhost:3001/
2. Navigate to "Authentication" → "Users"
3. Create a new user with your email

**Option B: Via Frontend**
1. Go to http://localhost:8080/
2. Look for "Sign Up" button
3. Create account with email/password

### 3. Set as Tenant Admin

After creating the user, you need to:
1. Open Supabase Studio
2. Go to "SQL Editor"
3. Run this SQL to create a tenant and assign role:

```sql
-- Create a tenant (school/organization)
INSERT INTO public.tenants (name, slug, email, phone, website, type, is_active)
VALUES ('My School', 'my-school', 'admin@school.com', '+1234567890', 'https://school.com', 'SCHOOL', true)
RETURNING id;

-- Then use the returned tenant_id to assign role:
INSERT INTO public.user_roles (user_id, tenant_id, role)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),  -- Your user
  'YOUR_TENANT_ID_HERE',                 -- From above
  'TENANT_ADMIN'
)
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'TENANT_ADMIN';
```

### 4. Log In to App

1. Go to http://localhost:8080/
2. Click "Sign In"
3. Use your email and password
4. You should now be logged in as TENANT_ADMIN

---

## 📊 Database Access

### Using Adminer (Web UI)
**URL**: http://localhost:8082/

- **Server**: supabase-db
- **User**: postgres
- **Password**: postgres
- **Database**: postgres

### Using psql (Command Line)
```bash
docker exec -it schoolflow-pro-supabase-db-1 psql -U postgres -d postgres
```

### Using DBeaver or Similar Tools
- **Host**: localhost
- **Port**: 5432
- **User**: postgres
- **Password**: postgres
- **Database**: postgres

---

## 🔍 Database Schema

Current tables in the database:

### Core Tables (No Data)
- `tenants` - Organizations/schools
- `profiles` - User profiles
- `user_roles` - User roles per tenant
- `students` - Student records
- `classrooms` - Class definitions
- `levels` - Grade/level definitions
- `departments` - School departments
- `enrollments` - Student enrollments
- `subjects` - Subjects/courses
- `grades` - Student grades
- `attendance` - Attendance records
- And many more (36 total)

### Storage
- `storage.buckets` - File storage buckets
- Avatar, document, and file upload ready

### Realtime
- All tables have realtime enabled
- Subscribe to changes with Supabase client

---

## 🧪 Test API Calls

### Using Supabase Studio

1. Go to http://localhost:3001/
2. Click "API Docs"
3. Try these endpoints:

**Get all tenants** (will be empty initially)
```
GET /rest/v1/tenants
```

**Get your profile** (after login)
```
GET /rest/v1/profiles?select=*
```

### Using curl

```bash
# Get tenants
curl http://localhost:8000/rest/v1/tenants \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Create a tenant
curl -X POST http://localhost:8000/rest/v1/tenants \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test School",
    "slug": "test-school",
    "email": "info@school.com",
    "phone": "+1234567890",
    "website": "https://school.com",
    "type": "SCHOOL",
    "is_active": true
  }'
```

---

## 📧 Email Testing

**MailHog** is running for email testing:
- **UI**: http://localhost:8026/
- **SMTP**: localhost:1026

When the app sends emails (password reset, invitations, etc.), they appear in MailHog instead of being sent.

---

## 📝 Creating Test Data

### Example: Create a Tenant with Student

```sql
-- 1. Create tenant
INSERT INTO public.tenants (name, slug, email, phone, website, type, is_active)
VALUES ('Lincoln High School', 'lincoln-high', 'info@lincolnhigh.edu', '+1234567890', 'https://lincolnhigh.edu', 'SCHOOL', true)
RETURNING id;
-- Keep the ID (e.g., 'tenant-123')

-- 2. Create a level (grade)
INSERT INTO public.levels (tenant_id, name, code, order_number, is_active)
VALUES ('tenant-123', '10th Grade', 'GRADE_10', 10, true)
RETURNING id;

-- 3. Create a classroom
INSERT INTO public.classrooms (tenant_id, name, code, level_id, capacity, is_active)
VALUES ('tenant-123', '10-A', '10A', 'level-id-from-above', 30, true)
RETURNING id;

-- 4. Create a student
INSERT INTO public.students (tenant_id, first_name, last_name, email, phone, level_id, classroom_id, is_active)
VALUES ('tenant-123', 'John', 'Doe', 'john@school.edu', '+9876543210', 'level-id', 'classroom-id', true)
RETURNING id;
```

---

## 🛠️ Development Workflow

### 1. Make Changes to Code
- Edit files in `src/`
- Changes automatically reload (hot reload)

### 2. Test in Browser
- http://localhost:8080/
- See changes instantly

### 3. Check Database
- Use Adminer or Supabase Studio
- View data changes

### 4. Test API
- Use Studio API Docs
- Or use curl/Postman

### 5. Build for Production
```bash
npm run build
# Creates dist/ folder with optimized build
```

---

## 🔧 Troubleshooting

### "Cannot connect to database"
```bash
# Check if containers are running
docker-compose ps

# Check database logs
docker logs schoolflow-pro-supabase-db-1

# Restart containers
docker-compose restart
```

### "Hot reload not working"
```bash
# Clear node_modules cache
rm -r node_modules/.vite

# Restart npm run dev
npm run dev
```

### "RLS policy denies access"
- Make sure your user has the right role
- Check user_roles table:
  ```sql
  SELECT * FROM public.user_roles WHERE user_id = 'your-id';
  ```

### "Studio unhealthy"
- Wait 30 seconds for it to start
- Or restart: `docker-compose restart schoolflow-pro-supabase-studio-1`

---

## 🎓 Learning Resources

### Read First
- [START_HERE.md](./START_HERE.md) - Project overview
- [docs/QUICK_START.md](./docs/QUICK_START.md) - Quick navigation
- [PROJECT_RESTART_COMPLETE.md](./PROJECT_RESTART_COMPLETE.md) - What was done

### French Documentation
- [docs/french/README_REFERENCE_RAPIDE.md](./docs/french/README_REFERENCE_RAPIDE.md) - 5-minute summary
- [docs/french/GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md](./docs/french/GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md) - Complete guide
- [docs/french/DEMARRAGE_PARAMETRES_DYNAMIQUES.md](./docs/french/DEMARRAGE_PARAMETRES_DYNAMIQUES.md) - Getting started

### English Documentation
- [docs/english/README_QUICK_REFERENCE.md](./docs/english/README_QUICK_REFERENCE.md) - Quick reference
- [docs/english/DYNAMIC_SETTINGS_SYSTEM_GUIDE.md](./docs/english/DYNAMIC_SETTINGS_SYSTEM_GUIDE.md) - Complete guide
- [docs/english/GETTING_STARTED_DYNAMIC_SETTINGS.md](./docs/english/GETTING_STARTED_DYNAMIC_SETTINGS.md) - Getting started

---

## 🌐 URLs Reference

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend** | http://localhost:8080/ | React app (dev) |
| **Frontend Docker** | http://localhost:3000/ | React app (docker) |
| **API Gateway** | http://localhost:8000/ | Kong API Gateway |
| **Database** | localhost:5432 | PostgreSQL (direct) |
| **PgBouncer** | localhost:6432 | Connection pool |
| **Supabase Studio** | http://localhost:3001/ | Database management |
| **Adminer** | http://localhost:8082/ | Web DB UI |
| **MailHog** | http://localhost:8026/ | Email testing |
| **Edge Functions** | http://localhost:9000/ | Serverless functions |

---

## 🚀 Next Steps

1. **Create your first tenant**
   - Use Supabase Studio or API
   - Add your name, email, phone

2. **Create test users**
   - Create admin user
   - Assign TENANT_ADMIN role

3. **Explore the UI**
   - Navigate http://localhost:8080/
   - Understand the structure

4. **Read documentation**
   - Choose language (French/English)
   - Read for your role (Admin/Dev/etc)

5. **Start building**
   - Make code changes
   - See hot reload in action
   - Deploy when ready

---

## 💡 Tips

- **Multi-tenant**: Every table has `tenant_id` - always filter by it
- **RLS**: Row-Level Security is enabled - users see only their tenant's data
- **Hot Reload**: Changes in src/ reload instantly
- **Reset DB**: `docker volume rm schoolflow-pro_db-data && docker-compose up -d`
- **View Logs**: `docker logs schoolflow-pro-frontend-1`

---

## ✅ You're Ready!

Everything is set up and ready to use:
- ✅ Database running
- ✅ Frontend running
- ✅ API ready
- ✅ All services healthy
- ✅ Documentation complete

**Happy developing!**  
**Bon développement!**

---

Generated: 26 Janvier 2026  
Project: SchoolFlow Pro  
Status: ✅ Ready for Development
