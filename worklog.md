# SchoolFlow Pro — Keycloak Removal Worklog

**Date**: 2025
**Task**: Complete removal of Keycloak/OIDC dependencies; migrate to native JWT auth (HS256)

---

## Summary

All 14 fixes applied successfully. Keycloak has been fully removed from the backend codebase (excluding Alembic migrations). The project now uses native JWT authentication with `passlib` bcrypt for password hashing.

---

## Changes by File

### Deleted Files
| File | Reason |
|------|--------|
| `app/core/keycloak_admin.py` | Keycloak admin API wrapper — no longer needed |
| `app/api/v1/endpoints/core/webhooks.py` | Keycloak webhook handler — no longer needed |
| `app/services/storage.py` | Duplicate of `app/core/storage.py` — dead code |
| `app/db/session.py` | Dead async session code — never used |

### Modified Files

#### 1. `app/core/config.py`
- Removed `_KEYCLOAK_EXTERNAL_HOSTNAME` variable and all `_DEFAULT_KEYCLOAK_*` URL builders
- Removed 10 `KEYCLOAK_*` fields from `Settings` class (`KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ISSUER`, `KEYCLOAK_AUDIENCE`, `KEYCLOAK_JWKS_URL`, etc.)
- Removed `validate_keycloak_secret` pydantic validator

#### 2. `app/api/v1/router.py`
- Removed `webhooks` from imports and `include_router()` call

#### 3. `app/api/v1/endpoints/core/health.py`
- Removed `import httpx`
- Removed `keycloak` field from `HealthResponse` model
- Removed `_check_keycloak()` function
- Updated `health_check()` to only check database and redis
- Updated docstring to remove Keycloak reference

#### 4. `app/api/v1/endpoints/core/users.py`
- **`UserCreate` schema**: Added `password: str` field
- **`reset_user_password()`**: Replaced Keycloak admin API call with native password reset — generates a random 16-char temp password, hashes it with bcrypt via `get_password_hash()`, saves to `password_hash` column
- **`create_user()`**: Removed Keycloak comments; now hashes the provided password with `get_password_hash()` and inserts `password_hash` into the SQL INSERT; sets `keycloak_id` to `NULL`
- **`convert_to_account()`**: Changed `keycloak_id` value from user UUID to `NULL`

#### 5. `app/api/v1/endpoints/core/rgpd.py`
- **`process_deletion_request()`**: Removed try/except block importing and calling `delete_keycloak_user`; replaced with comment that user is anonymized in local DB only
- **`direct_delete_user()`**: Same — removed Keycloak deletion try/except block

#### 6. `app/middlewares/tenant.py`
- Removed `"/webhooks/keycloak"` from `public_paths` list

#### 7. `app/middlewares/quota.py`
- Removed `from app.models.teacher import Teacher` import and the `max_teachers` quota check block (no Teacher model exists)
- `max_teachers` quota key now returns `0` (will be implemented when Teacher model is added)

#### 8. `app/models/user.py`
- Changed `keycloak_id` column from `nullable=False` to `nullable=True`
- Updated comment to "Legacy field kept for backward compatibility, no longer used"

#### 9. `app/models/audit_log.py`
- Updated comment from "User who performed the action (Keycloak ID)" to "User who performed the action (User ID)"

#### 10. `app/api/v1/endpoints/core/tenants.py` (bonus cleanup)
- Updated comment from "Keycloak usually provides UUID strings" to "JWT tokens contain UUID strings"
- Removed log message reference to keycloak_id lookup
- Changed fallback user lookup from `User.keycloak_id` to `User.username`
- Changed `keycloak_id=user_id_str` to `keycloak_id=None`

### New Files

#### 11. `scripts/create_admin.py`
Admin seed script that:
1. Connects to the database using `DATABASE_URL` (sync psycopg2 driver)
2. Checks if a SUPER_ADMIN user already exists
3. If not, creates a default tenant (slug: `default`, name: `Default School`)
4. Creates a SUPER_ADMIN user with email `admin@schoolflow.local`, password `Admin@123456`
5. Assigns the SUPER_ADMIN role
6. Hashes the password using passlib bcrypt
7. Prints clear output about what was created

### Test File Updates
- `tests/conftest.py`: Removed `KEYCLOAK_*` env vars and `KeycloakOpenID`/`get_keycloak_public_key` patches
- `tests/test_health.py`: Removed Keycloak mock patches
- `tests/test_security.py`: Removed entire `TestJWKSCacheLogic` class (tested Keycloak JWKS caching — no longer applicable)
- `tests/test_auth.py`: Removed all `keycloak_openid` patches; replaced with DB/Redis patches

### Documentation
- `README.md`: Updated auth from "Keycloak (JWT)" to "Native JWT (HS256)"; removed `KEYCLOAK_*` env vars from example; added `SECRET_KEY`

---

## Remaining `keycloak_id` References

The only remaining `keycloak` string occurrences are **database column name references** in:
- `app/models/user.py` — the `keycloak_id = Column(...)` definition
- `app/api/v1/endpoints/core/users.py` — SQL INSERT statements setting `keycloak_id = NULL`
- `app/api/v1/endpoints/core/tenants.py` — setting `keycloak_id=None`

These are all setting the column to `NULL` and cannot be renamed without an Alembic migration (out of scope). The column is a legacy DB artifact that will be dropped in a future migration.

---

## Next Actions
1. Run `alembic revision --autogenerate -m "make keycloak_id nullable"` to create a migration for the model change
2. Run `python -m scripts.create_admin` to seed the initial admin user
3. Update any frontend Keycloak configuration references
4. Remove Keycloak from docker-compose if present
---
Task ID: 1
Agent: Super Z (main)
Task: Fix academic_years 'code' column missing from database causing 500 on tenant creation

Work Log:
- Analyzed the error: `psycopg2.errors.UndefinedColumn column "code" of relation "academic_years" does not exist`
- Found that the SQLAlchemy model `AcademicYear` defines `code = Column(String, nullable=False)` but NO migration ever added this column to the DB
- The initial migration `20260218_2220` creates `academic_years` without a `code` column
- Both tenant creation endpoints (`POST /tenants/` and `POST /tenants/create-with-admin/`) create `AcademicYear()` objects without providing `code`
- Created migration `20260406_add_academic_year_code.py` that:
  - Adds `code` VARCHAR column (nullable initially)
  - Backfills existing rows with `code = name`
  - Sets NOT NULL constraint
- Fixed both tenant endpoints to generate `code=f"AY{start}-{end}"` (e.g., "AY2025-2026")
- Committed and pushed to GitHub

Stage Summary:
- Root cause: Model/DB mismatch - `code` column existed in Python model but never migrated to PostgreSQL
- Files changed: `backend/alembic/versions/20260406_add_academic_year_code.py` (new), `backend/app/api/v1/endpoints/core/tenants.py` (modified)
- All 3 AcademicYear instantiation sites verified to include `code` parameter
- Commit: d8cb0ab pushed to origin/main
- User needs to run `alembic upgrade head` in the backend container to apply the migration
