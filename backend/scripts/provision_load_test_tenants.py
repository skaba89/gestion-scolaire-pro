#!/usr/bin/env python3
"""
Provision N synthetic tenants for the k6 load-test campaign
(load-tests/campaign.js, saturation.js, resilience.js).

Per load-tests/seed-load-test-tenants.md: the k6 scripts never create
tenants themselves (account creation is itself rate-limited and doesn't
belong in a load loop) — they read a TENANTS_FILE JSON listing tenants
already provisioned on the target. This script is that provisioning step,
run once before the campaign, directly against the database (bypassing
the rate-limited HTTP signup path entirely, since this is setup, not load).

Each tenant gets: a TENANT_ADMIN login (has grades:write/attendance:write,
needed by the campaign's write scenarios), one classroom, one subject, one
student enrolled in that classroom, and one assessment on that subject —
matching every *_id field load-tests/lib/scenarios.js's write flows need
(attendanceWrite, gradesWrite) plus the read flows (dashboard, students,
results, payments, notifications).

Usage:
    cd backend/
    DATABASE_URL=postgresql://... python -m scripts.provision_load_test_tenants \
        --count 100 --prefix loadtest --out ../load-tests/tenants.100.json
"""
import sys
import os
import json
import uuid
import argparse
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pyotp
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[ERROR] DATABASE_URL environment variable is required.")
    sys.exit(1)

_IS_SQLITE = DATABASE_URL.startswith("sqlite:")
if not _IS_SQLITE:
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://"):
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = DATABASE_URL.replace(prefix, "postgresql://", 1)
            break
    if not DATABASE_URL.startswith("postgresql+psycopg://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

connect_args = {"check_same_thread": False} if _IS_SQLITE else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
PASSWORD = "LoadTest@2026"
PASSWORD_HASH = pwd_context.hash(PASSWORD)

now = lambda: datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


_MFA_TABLE_ENSURED = False


def _ensure_mfa_totp_table(db) -> None:
    """mfa_totp_secrets is a raw-SQL "phantom" table (see
    app/api/v1/endpoints/core/mfa.py::_ensure_mfa_tables) — not created by
    any Alembic migration, only lazily by that endpoint on first use.
    Since this script inserts directly, it must create it itself the same
    way; same DDL, kept in sync manually (same convention as the endpoint
    it mirrors)."""
    global _MFA_TABLE_ENSURED
    if _MFA_TABLE_ENSURED or _IS_SQLITE:
        return
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS mfa_totp_secrets (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            secret VARCHAR(64) NOT NULL,
            verified BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """))
    db.execute(text("CREATE INDEX IF NOT EXISTS ix_mfa_totp_secrets_user_id ON mfa_totp_secrets(user_id)"))
    _MFA_TABLE_ENSURED = True


def provision_tenant(db, *, index: int, prefix: str) -> dict:
    slug = f"{prefix}-{index:04d}"
    tenant_id = new_id()
    # subscription_plan defaults to 'starter' (see tenants table) — several
    # business-flow endpoints this campaign exercises are gated behind
    # require_plan() (e.g. POST /import/students/preview/ needs 'pro';
    # app/core/security.py::_PLAN_WEIGHT), added after this script was
    # first written. 'enterprise' (the highest tier) so every gated flow
    # in the campaign's scenarios runs rather than 402ing. Discovered by
    # actually running load-tests/full-journey.js against a live instance.
    db.execute(text("""
        INSERT INTO tenants (id, name, slug, type, is_active, settings, created_at, updated_at, country,
                              subscription_plan, subscription_status)
        VALUES (:id, :name, :slug, 'university', true, '{}', :now, :now, 'GN', 'enterprise', 'active')
    """), {"id": tenant_id, "name": f"Établissement Charge {index:04d}", "slug": slug, "now": now()})

    email = f"admin@{slug}.loadtest.local"
    user_id = new_id()
    db.execute(text("""
        INSERT INTO users (id, tenant_id, email, username, password_hash, first_name, last_name,
                            is_active, is_superuser, is_verified, mfa_enabled, must_change_password,
                            created_at, updated_at)
        VALUES (:id, :tid, :email, :username, :pwd, 'Admin', 'Charge', true, false, true, false, false, :now, :now)
    """), {"id": user_id, "tid": tenant_id, "email": email, "username": slug, "pwd": PASSWORD_HASH, "now": now()})
    db.execute(text("""
        INSERT INTO user_roles (id, tenant_id, user_id, role, created_at, updated_at)
        VALUES (:id, :tid, :uid, 'TENANT_ADMIN', :now, :now)
    """), {"id": new_id(), "tid": tenant_id, "uid": user_id, "now": now()})

    # SECURITY (national-readiness audit, 2026-09) made MFA mandatory for
    # privileged roles including TENANT_ADMIN (see
    # PRIVILEGED_ROLES_REQUIRING_MFA, app/api/v1/endpoints/core/auth.py) —
    # without this, login for every tenant provisioned by this script
    # returns 403 "MFA obligatoire" whenever the target enforces it
    # (ENFORCE_MFA=true, the non-DEBUG default), which is exactly what a
    # load-test target should be run as (production-like). Enrolled here
    # the same way the provisioning script already bypasses the rate-
    # limited HTTP signup path — directly against the DB, verified=TRUE
    # from the start (no /totp/verify/ round-trip needed for synthetic
    # test accounts). load-tests/lib/scenarios.js::login() computes the
    # matching TOTP code from totp_secret and completes
    # /mfa/login/verify/ automatically.
    _ensure_mfa_totp_table(db)
    totp_secret = pyotp.random_base32()
    db.execute(text("""
        INSERT INTO mfa_totp_secrets (id, user_id, secret, verified, created_at)
        VALUES (:id, :uid, :secret, TRUE, :now)
    """), {"id": new_id(), "uid": user_id, "secret": totp_secret, "now": now()})
    db.execute(text("UPDATE users SET mfa_enabled = TRUE WHERE id = :uid"), {"uid": user_id})

    ay_id = new_id()
    db.execute(text("""
        INSERT INTO academic_years (id, tenant_id, name, code, start_date, end_date, is_current, created_at, updated_at)
        VALUES (:id, :tid, '2026-2027', '2026-2027', :start, :end, true, :now, :now)
    """), {"id": ay_id, "tid": tenant_id, "start": date(2026, 9, 1), "end": date(2027, 6, 30), "now": now()})

    level_id = new_id()
    db.execute(text("""
        INSERT INTO levels (id, tenant_id, name, code, order_index, created_at, updated_at)
        VALUES (:id, :tid, 'Niveau Charge', 'LC', 0, :now, :now)
    """), {"id": level_id, "tid": tenant_id, "now": now()})

    classroom_id = new_id()
    db.execute(text("""
        INSERT INTO classes (id, tenant_id, name, level_id, academic_year_id, created_at, updated_at)
        VALUES (:id, :tid, 'Classe Charge A', :lvl, :ay, :now, :now)
    """), {"id": classroom_id, "tid": tenant_id, "lvl": level_id, "ay": ay_id, "now": now()})

    subject_id = new_id()
    db.execute(text("""
        INSERT INTO subjects (id, tenant_id, name, code, coefficient, ects, created_at, updated_at)
        VALUES (:id, :tid, 'Matière Charge', 'CHRG', 1.0, 0, :now, :now)
    """), {"id": subject_id, "tid": tenant_id, "now": now()})

    student_id = new_id()
    db.execute(text("""
        INSERT INTO students (id, tenant_id, registration_number, first_name, last_name,
                               date_of_birth, gender, status, created_at, updated_at)
        VALUES (:id, :tid, :reg, 'Etudiant', 'Charge', :dob, 'MALE', 'ACTIVE', :now, :now)
    """), {"id": student_id, "tid": tenant_id, "reg": f"LOADTEST-{slug}", "dob": date(2005, 1, 1), "now": now()})
    db.execute(text("""
        INSERT INTO enrollments (id, tenant_id, student_id, class_id, academic_year_id, enrollment_date, status, created_at, updated_at)
        VALUES (:id, :tid, :sid, :cid, :ay, :edate, 'ACTIVE', :now, :now)
    """), {"id": new_id(), "tid": tenant_id, "sid": student_id, "cid": classroom_id, "ay": ay_id, "edate": date(2026, 9, 1), "now": now()})

    assessment_id = new_id()
    db.execute(text("""
        INSERT INTO assessments (id, tenant_id, name, max_score, date, assessment_type, weight,
                                  subject_id, academic_year_id, class_id, created_at, updated_at)
        VALUES (:id, :tid, 'Évaluation Charge', 20.0, :adate, 'EXAM', 1.0, :subid, :ay, :cid, :now, :now)
    """), {"id": assessment_id, "tid": tenant_id, "adate": now(), "subid": subject_id, "ay": ay_id, "cid": classroom_id, "now": now()})

    return {
        "slug": slug,
        "email": email,
        "password": PASSWORD,
        "totp_secret": totp_secret,
        "student_id": student_id,
        "subject_id": subject_id,
        "classroom_id": classroom_id,
        "assessment_id": assessment_id,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=100, help="Number of tenants to provision")
    parser.add_argument("--prefix", type=str, default="loadtest", help="Tenant slug prefix")
    parser.add_argument("--out", type=str, default="../load-tests/tenants.generated.json", help="Output JSON path")
    args = parser.parse_args()

    db = SessionLocal()
    tenants = []
    try:
        for i in range(1, args.count + 1):
            slug = f"{args.prefix}-{i:04d}"
            existing = db.execute(text("SELECT id FROM tenants WHERE slug = :slug"), {"slug": slug}).fetchone()
            if existing:
                print(f"[skip] {slug} already exists (re-run against a fresh DB to regenerate)")
                continue
            tenants.append(provision_tenant(db, index=i, prefix=args.prefix))
            if i % 20 == 0:
                db.commit()
                print(f"[progress] {i}/{args.count} tenants committed")
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tenants, f, indent=2, ensure_ascii=False)

    print(f"\nProvisioned {len(tenants)} new tenant(s). Wrote {out_path}")
    print(f"Password for every provisioned tenant admin: {PASSWORD}")


if __name__ == "__main__":
    main()
