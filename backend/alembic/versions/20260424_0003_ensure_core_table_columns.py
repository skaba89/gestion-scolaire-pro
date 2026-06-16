"""Extract _ensure_all_table_columns DDL from main.py into a proper migration.

Revision ID: 20260424_0003
Revises: 20260424_0002
Create Date: 2026-04-24

Pourquoi :
- La fonction _ensure_all_table_columns dans main.py exécutait des ALTER TABLE
  ADD COLUMN IF NOT EXISTS à chaque démarrage, ce qui est non-idempotent en prod,
  lent, et masquait des incohérences de schéma.
- Cette migration déplace cette logique vers Alembic où elle appartient.
- SQLite : ignorée silencieusement (ADD COLUMN IF NOT EXISTS non supporté uniformément).
- PostgreSQL : chaque colonne ajoutée via DO block EXCEPTION handler — si la table
  n'existe pas encore elle est ignorée (couverture forward-compatible).

Note : après application de cette migration, _ensure_all_table_columns peut être
retiré de main.py et son appel dans lifespan peut être supprimé.
"""
from alembic import op
from sqlalchemy import text

revision = "20260424_0003"
down_revision = "20260424_0002"
branch_labels = None
depends_on = None

# Tables → colonnes à ajouter si absentes
TABLE_COLUMNS: dict[str, list[str]] = {
    "tenants": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "name VARCHAR(255)",
        "slug VARCHAR(100)",
        "type VARCHAR(50)",
        "country VARCHAR(2) DEFAULT 'GN'",
        "currency VARCHAR(3) DEFAULT 'GNF'",
        "timezone VARCHAR(50) DEFAULT 'Africa/Conakry'",
        "email VARCHAR(255)",
        "phone VARCHAR(50)",
        "address VARCHAR(500)",
        "website VARCHAR(255)",
        "is_active BOOLEAN DEFAULT TRUE",
        "settings JSON",
        "director_name VARCHAR(255)",
        "director_signature_url VARCHAR(500)",
        "secretary_name VARCHAR(255)",
        "secretary_signature_url VARCHAR(500)",
        "city VARCHAR(255)",
    ],
    "users": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "email VARCHAR(255)",
        "username VARCHAR(100)",
        "password_hash VARCHAR(255)",
        "first_name VARCHAR(100)",
        "last_name VARCHAR(100)",
        "phone VARCHAR(20)",
        "avatar_url VARCHAR(500)",
        "is_active BOOLEAN DEFAULT TRUE",
        "is_superuser BOOLEAN DEFAULT FALSE",
        "is_verified BOOLEAN DEFAULT FALSE",
        "mfa_enabled BOOLEAN DEFAULT FALSE",
        "must_change_password BOOLEAN DEFAULT FALSE",
    ],
    "user_roles": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "user_id UUID",
        "role VARCHAR(50)",
    ],
    "profiles": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "phone VARCHAR(50)",
        "avatar_url VARCHAR(500)",
    ],
    "students": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "registration_number VARCHAR(50)",
        "first_name VARCHAR(100)",
        "last_name VARCHAR(100)",
        "date_of_birth DATE",
        "gender VARCHAR(20)",
        "email VARCHAR(255)",
        "phone VARCHAR(20)",
        "address VARCHAR(500)",
        "city VARCHAR(100)",
        "level VARCHAR(50)",
        "class_name VARCHAR(100)",
        "academic_year VARCHAR(20)",
        "status VARCHAR(20) DEFAULT 'ACTIVE'",
        "photo_url VARCHAR(500)",
        "parent_name VARCHAR(200)",
        "parent_phone VARCHAR(20)",
        "parent_email VARCHAR(255)",
    ],
    "academic_years": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "code VARCHAR(50)",
        "start_date DATE",
        "end_date DATE",
        "is_current BOOLEAN DEFAULT FALSE",
    ],
    "terms": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "academic_year_id UUID",
        "name VARCHAR(255)",
        "start_date DATE",
        "end_date DATE",
        "sequence_number INTEGER DEFAULT 1",
        "is_active BOOLEAN DEFAULT FALSE",
    ],
    "audit_logs": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "user_id VARCHAR(255)",
        "action VARCHAR(50)",
        "severity VARCHAR(20) DEFAULT 'INFO'",
        "resource_type VARCHAR(50)",
        "resource_id VARCHAR(255)",
        "details JSON",
        "ip_address VARCHAR(45)",
        "user_agent TEXT",
    ],
    "grades": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "student_id UUID",
        "assessment_id UUID",
        "subject_id UUID",
        "academic_year_id UUID",
        "score FLOAT",
        "max_score FLOAT DEFAULT 20.0",
        "coefficient FLOAT DEFAULT 1.0",
        "comments VARCHAR(500)",
    ],
    "invoices": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "student_id UUID",
        "invoice_number VARCHAR(50)",
        "issue_date DATE",
        "due_date DATE",
        "subtotal FLOAT",
        "tax_amount FLOAT DEFAULT 0.0",
        "discount_amount FLOAT DEFAULT 0.0",
        "total_amount FLOAT",
        "paid_amount FLOAT DEFAULT 0.0",
        "currency VARCHAR(3) DEFAULT 'GNF'",
        "status VARCHAR(20) DEFAULT 'DRAFT'",
        "description VARCHAR(500)",
        "notes VARCHAR(500)",
        "items JSON",
        "has_payment_plan BOOLEAN DEFAULT FALSE",
        "installments_count INTEGER DEFAULT 1",
        "pdf_url VARCHAR(500)",
    ],
    "payments": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "student_id UUID",
        "invoice_id UUID",
        "amount FLOAT",
        "currency VARCHAR(3) DEFAULT 'GNF'",
        "payment_date DATE",
        "payment_method VARCHAR(20)",
        "status VARCHAR(20) DEFAULT 'PENDING'",
        "reference VARCHAR(100)",
        "transaction_id VARCHAR(255)",
        "notes VARCHAR(500)",
        "receipt_url VARCHAR(500)",
    ],
    "departments": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "code VARCHAR(50)",
        "description VARCHAR(500)",
        "head_id UUID",
    ],
    "subjects": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "code VARCHAR(50)",
        "coefficient FLOAT DEFAULT 1.0",
        "ects FLOAT DEFAULT 0",
        "cm_hours INTEGER DEFAULT 0",
        "td_hours INTEGER DEFAULT 0",
        "tp_hours INTEGER DEFAULT 0",
        "description TEXT",
    ],
    "levels": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "code VARCHAR(50)",
        "label VARCHAR(255)",
        "order_index INTEGER DEFAULT 0",
    ],
    "campuses": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "address VARCHAR(500)",
        "phone VARCHAR(50)",
        "is_main BOOLEAN DEFAULT FALSE",
    ],
    "rooms": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "capacity INTEGER",
        "campus_id UUID",
    ],
    "programs": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "code VARCHAR(50)",
        "description VARCHAR(500)",
    ],
    "classes": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "capacity INTEGER",
        "level_id UUID",
        "campus_id UUID",
        "program_id UUID",
        "academic_year_id UUID",
        "main_room_id UUID",
    ],
    "enrollments": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "student_id UUID",
        "class_id UUID",
        "academic_year_id UUID",
        "enrollment_date DATE",
        "status VARCHAR(50) DEFAULT 'ACTIVE'",
    ],
    "assessments": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "name VARCHAR(255)",
        "max_score FLOAT DEFAULT 20.0",
        "date TIMESTAMP",
        "assessment_type VARCHAR(50)",
        "subject_id UUID",
        "academic_year_id UUID",
        "term_id UUID",
    ],
    "attendance": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "date DATE",
        "status VARCHAR(50)",
        "reason TEXT",
        "student_id UUID",
        "subject_id UUID",
        "classroom_id UUID",
    ],
    "employees": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "employee_number VARCHAR(50)",
        "first_name VARCHAR(100)",
        "last_name VARCHAR(100)",
        "email VARCHAR(255)",
        "phone VARCHAR(50)",
        "job_title VARCHAR(100)",
        "department VARCHAR(100)",
        "hire_date DATE",
        "is_active BOOLEAN DEFAULT TRUE",
        "date_of_birth DATE",
        "place_of_birth VARCHAR(100)",
        "nationality VARCHAR(100)",
        "social_security_number VARCHAR(100)",
        "address VARCHAR(255)",
        "city VARCHAR(100)",
        "postal_code VARCHAR(20)",
        "country VARCHAR(100)",
        "bank_name VARCHAR(100)",
        "bank_iban VARCHAR(100)",
        "bank_bic VARCHAR(50)",
        "emergency_contact_name VARCHAR(100)",
        "emergency_contact_phone VARCHAR(50)",
    ],
    "employment_contracts": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "contract_number VARCHAR(50)",
        "contract_type VARCHAR(50)",
        "start_date DATE",
        "end_date DATE",
        "trial_period_end DATE",
        "job_title VARCHAR(100)",
        "gross_monthly_salary FLOAT",
        "weekly_hours FLOAT DEFAULT 35.0",
        "notes VARCHAR(1000)",
        "is_current BOOLEAN DEFAULT TRUE",
        "employee_id UUID",
    ],
    "leave_requests": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "leave_type VARCHAR(50)",
        "start_date DATE",
        "end_date DATE",
        "total_days INTEGER",
        "status VARCHAR(50) DEFAULT 'PENDING'",
        "reason TEXT",
        "reviewed_at DATE",
        "employee_id UUID",
    ],
    "payslips": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "period_month INTEGER",
        "period_year INTEGER",
        "gross_salary FLOAT",
        "net_salary FLOAT",
        "pay_date DATE",
        "is_final VARCHAR(50) DEFAULT 'false'",
        "pdf_url VARCHAR(500)",
        "employee_id UUID",
    ],
    "notifications": [
        "user_id UUID",
        "tenant_id UUID",
        "title VARCHAR(255)",
        "message TEXT",
        "type VARCHAR(50) DEFAULT 'info'",
        "link VARCHAR(255)",
        "is_read BOOLEAN DEFAULT FALSE",
        "created_at TIMESTAMPTZ DEFAULT NOW()",
        "updated_at TIMESTAMPTZ DEFAULT NOW()",
    ],
    "school_events": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "title VARCHAR(255)",
        "description TEXT",
        "start_date TIMESTAMP",
        "end_date TIMESTAMP",
        "location VARCHAR(255)",
        "is_all_day BOOLEAN DEFAULT FALSE",
        "event_type VARCHAR(50)",
    ],
    "student_check_ins": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "checked_at TIMESTAMP",
        "direction VARCHAR(20) DEFAULT 'IN'",
        "source VARCHAR(50)",
        "student_id UUID",
    ],
    "parent_students": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "parent_id UUID",
        "student_id UUID",
        "is_primary BOOLEAN DEFAULT FALSE",
        "relation_type VARCHAR(50)",
    ],
    "admission_applications": [
        "tenant_id UUID",
        "academic_year_id UUID",
        "level_id UUID",
        "student_first_name VARCHAR(100)",
        "student_last_name VARCHAR(100)",
        "student_date_of_birth TIMESTAMP",
        "student_gender VARCHAR(20)",
        "student_address VARCHAR(500)",
        "student_previous_school VARCHAR(255)",
        "parent_first_name VARCHAR(100)",
        "parent_last_name VARCHAR(100)",
        "parent_email VARCHAR(255)",
        "parent_phone VARCHAR(50)",
        "parent_address VARCHAR(500)",
        "parent_occupation VARCHAR(255)",
        "status VARCHAR(20) DEFAULT 'DRAFT'",
        "notes VARCHAR(1000)",
        "documents JSON",
        "submitted_at TIMESTAMP",
        "reviewed_at TIMESTAMP",
        "reviewed_by UUID",
        "converted_student_id UUID",
        "created_at TIMESTAMPTZ DEFAULT NOW()",
        "updated_at TIMESTAMPTZ DEFAULT NOW()",
    ],
    "tenant_security_settings": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "mfa_required BOOLEAN DEFAULT FALSE",
        "password_expiry_days INTEGER DEFAULT 90",
        "session_timeout_minutes INTEGER DEFAULT 60",
    ],
    "account_deletion_requests": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "user_id UUID",
        "reason TEXT",
        "status VARCHAR(20) DEFAULT 'PENDING'",
        "requested_at TIMESTAMP DEFAULT NOW()",
        "processed_at TIMESTAMP",
        "processed_by UUID",
        "rejection_reason TEXT",
    ],
    "rgpd_logs": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "user_id UUID",
        "action VARCHAR(255)",
        "target_user_id UUID",
        "details JSON",
        "status VARCHAR(50) DEFAULT 'SUCCESS'",
    ],
    "push_subscriptions": [
        "user_id UUID",
        "tenant_id UUID",
        "endpoint TEXT",
        "p256dh VARCHAR(255)",
        "auth VARCHAR(255)",
        "platform VARCHAR(50) DEFAULT 'web'",
        "is_active BOOLEAN DEFAULT TRUE",
        "created_at TIMESTAMPTZ DEFAULT NOW()",
        "updated_at TIMESTAMPTZ DEFAULT NOW()",
    ],
    "public_pages": [
        "created_at TIMESTAMP DEFAULT NOW()",
        "updated_at TIMESTAMP DEFAULT NOW()",
        "tenant_id UUID",
        "title VARCHAR(200)",
        "slug VARCHAR(200)",
        "page_type VARCHAR(50) DEFAULT 'CUSTOM'",
        "content JSON",
        "template VARCHAR(50) DEFAULT 'default'",
        "primary_color VARCHAR(7)",
        "secondary_color VARCHAR(7)",
        "is_published BOOLEAN DEFAULT FALSE",
        "sort_order INTEGER DEFAULT 0",
        "meta_title VARCHAR(200)",
        "meta_description TEXT",
        "show_in_nav BOOLEAN DEFAULT TRUE",
        "nav_label VARCHAR(100)",
    ],
    "schedule": [
        "tenant_id UUID",
        "class_id UUID",
        "subject_id UUID",
        "teacher_id UUID",
        "day_of_week INTEGER",
        "start_time TIME",
        "end_time TIME",
        "room_id UUID",
        "created_at TIMESTAMPTZ DEFAULT NOW()",
        "updated_at TIMESTAMPTZ DEFAULT NOW()",
    ],
}


def _is_sqlite(conn) -> bool:
    try:
        conn.execute(text("SELECT current_database()")).fetchone()
        return False
    except Exception:
        return True


def upgrade():
    conn = op.get_bind()

    if _is_sqlite(conn):
        return

    applied = 0
    skipped = 0

    for table_name, columns in TABLE_COLUMNS.items():
        alter_stmts = "\n".join(
            f"    ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col};"
            for col in columns
        )
        # Use a SAVEPOINT so that if the DO block fails (e.g. the table doesn't exist
        # and EXCEPTION handling itself errors), we can roll back just this statement
        # without aborting the whole transaction.
        try:
            conn.execute(text(f"SAVEPOINT sp_{table_name}"))
            conn.execute(text(f"""
DO $$
BEGIN
{alter_stmts}
EXCEPTION WHEN undefined_table THEN
    NULL;
WHEN OTHERS THEN
    NULL;
END $$;
"""))
            conn.execute(text(f"RELEASE SAVEPOINT sp_{table_name}"))
            applied += 1
        except Exception as e:
            try:
                conn.execute(text(f"ROLLBACK TO SAVEPOINT sp_{table_name}"))
            except Exception:
                pass
            print(f"[0003] Warning: {table_name}: {e}")
            skipped += 1

    print(f"[0003] ensure_core_table_columns: applied={applied}, skipped={skipped}")


def downgrade():
    # ADD COLUMN IF NOT EXISTS is non-reversible without data loss risk.
    # Downgrade is intentionally a no-op.
    pass
