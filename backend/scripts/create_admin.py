#!/usr/bin/env python3
"""
Create a platform-level SUPER_ADMIN user for SchoolFlow Pro.

The SUPER_ADMIN does NOT belong to any tenant. They operate at the platform
level and can create/manage establishments (tenants) and their admin users.

Usage:
    cd backend/
    python -m scripts.create_admin

Checks if a SUPER_ADMIN user already exists. If not, creates:
  - A SUPER_ADMIN user (email: admin@schoolflow.local, password: Admin@123456)
  - The SUPER_ADMIN role assignment (tenant_id = NULL)

Supports both PostgreSQL (via psycopg v3) and SQLite backends.
"""
import sys
import os
import uuid

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)

_IS_SQLITE = DATABASE_URL.startswith("sqlite:")

# Normalize to synchronous driver
if not _IS_SQLITE:
    # Strip any async driver prefix
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://"):
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = DATABASE_URL.replace(prefix, "postgresql://", 1)
            break
    # Ensure psycopg v3 driver for sync
    if not DATABASE_URL.startswith("postgresql+psycopg://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# SQLite needs check_same_thread=False for our usage
connect_args = {}
if _IS_SQLITE:
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_EMAIL = "admin@schoolflow.local"
ADMIN_PASSWORD = "Admin@123456"


def _datetime_now(db):
    """Return a datetime expression appropriate for the current dialect."""
    if _IS_SQLITE:
        return text("datetime('now')")
    return text("NOW()")


def main():
    db = SessionLocal()
    try:
        # ------------------------------------------------------------------
        # 1. Check if a SUPER_ADMIN user already exists
        # ------------------------------------------------------------------
        existing_admin = db.execute(
            text("""
                SELECT CAST(u.id AS TEXT) FROM users u
                JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'SUPER_ADMIN'
                LIMIT 1
            """)
        ).fetchone()

        if existing_admin:
            admin_id = existing_admin[0]
            print(f"[OK] SUPER_ADMIN user already exists (id={admin_id}). Nothing to do.")
            return

        # ------------------------------------------------------------------
        # 2. Create the SUPER_ADMIN user (NO tenant — platform level)
        # ------------------------------------------------------------------
        admin_id = str(uuid.uuid4())
        password_hash = pwd_context.hash(ADMIN_PASSWORD)

        if _IS_SQLITE:
            db.execute(
                text("""
                    INSERT INTO users (id, email, username, password_hash, first_name, last_name,
                                       tenant_id, is_active, is_verified, created_at, updated_at)
                    VALUES (:id, :email, :email, :pw, 'Admin', 'SchoolFlow',
                            NULL, 1, 1, datetime('now'), datetime('now'))
                """),
                {
                    "id": admin_id,
                    "email": ADMIN_EMAIL,
                    "pw": password_hash,
                },
            )
        else:
            db.execute(
                text("""
                    INSERT INTO users (id, email, username, password_hash, first_name, last_name,
                                       tenant_id, is_active, is_verified, created_at, updated_at)
                    VALUES (:id, :email, :email, :pw, 'Admin', 'SchoolFlow',
                            NULL, true, true, NOW(), NOW())
                """),
                {
                    "id": admin_id,
                    "email": ADMIN_EMAIL,
                    "pw": password_hash,
                },
            )
        print(f"[CREATED] SUPER_ADMIN user (id={admin_id}, email={ADMIN_EMAIL})")

        # ------------------------------------------------------------------
        # 3. Assign SUPER_ADMIN role (tenant_id = NULL — platform level)
        # ------------------------------------------------------------------
        role_id = str(uuid.uuid4())
        if _IS_SQLITE:
            db.execute(
                text("""
                    INSERT INTO user_roles (id, user_id, tenant_id, role, created_at, updated_at)
                    VALUES (:id, :user_id, NULL, 'SUPER_ADMIN', datetime('now'), datetime('now'))
                """),
                {"id": role_id, "user_id": admin_id},
            )
        else:
            db.execute(
                text("""
                    INSERT INTO user_roles (id, user_id, tenant_id, role, created_at, updated_at)
                    VALUES (:id, :user_id, NULL, 'SUPER_ADMIN', NOW(), NOW())
                    ON CONFLICT DO NOTHING
                """),
                {"id": role_id, "user_id": admin_id},
            )
        print(f"[CREATED] Role assignment: SUPER_ADMIN for user {admin_id} (platform level, no tenant)")

        # ------------------------------------------------------------------
        # 4. Remove the old "default" tenant if it exists (cleanup)
        # ------------------------------------------------------------------
        default_tenant = db.execute(
            text("SELECT CAST(id AS TEXT) FROM tenants WHERE slug = 'default'")
        ).fetchone()
        if default_tenant:
            dt_id = default_tenant[0]
            # Check if any non-SUPER_ADMIN users are in this tenant
            users_in_default = db.execute(
                text("""
                    SELECT COUNT(*) FROM users u
                    WHERE u.tenant_id = :tid
                    AND u.id NOT IN (
                        SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'SUPER_ADMIN'
                    )
                """),
                {"tid": dt_id}
            ).scalar()
            if users_in_default == 0:
                db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": dt_id})
                print(f"[CLEANED] Removed old 'default' tenant (id={dt_id})")
            else:
                print(f"[SKIP] 'default' tenant still has {users_in_default} users, not removing")

        # ------------------------------------------------------------------
        # Commit
        # ------------------------------------------------------------------
        db.commit()
        print("\n=== Summary ===")
        print(f"  Role   : SUPER_ADMIN (platform level — no tenant)")
        print(f"  Email  : {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print("  IMPORTANT: Change this password after first login!")
        print("  NOTE: This user has NO tenant. Create establishments from the dashboard.\n")

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
