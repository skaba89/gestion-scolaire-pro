"""
Operational table DDL for tables that have no SQLAlchemy ORM model.

These tables are referenced by SQL-based endpoints (library, inventory, clubs,
surveys, messaging, alumni, forums, etc.) but are not covered by
``Base.metadata.create_all()`` because no ORM model exists for them.

Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so it is safe
to run on every startup.

TODO: Long-term, these should be converted to proper SQLAlchemy models
and managed via Alembic migrations. This module exists as a transitional
step to keep main.py clean while preserving existing behavior.
"""
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


# fmt: off
_DDL = [
    # ── Library ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS library_categories (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(50),
        description VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_library_categories_tenant_id
        ON library_categories(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS library_resources (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category_id UUID REFERENCES library_categories(id) ON DELETE SET NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        author VARCHAR(255),
        resource_type VARCHAR(100),
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_library_resources_tenant_id
        ON library_resources(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_library_resources_category_id
        ON library_resources(category_id)""",

    # ── Inventory ────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS inventory_categories (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_inventory_categories_tenant_id
        ON inventory_categories(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS inventory_items (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        unit_price FLOAT NOT NULL DEFAULT 0,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_inventory_items_tenant_id
        ON inventory_items(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_inventory_items_category_id
        ON inventory_items(category_id)""",

    """CREATE TABLE IF NOT EXISTS inventory_transactions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_inventory_transactions_tenant_id
        ON inventory_transactions(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_inventory_transactions_item_id
        ON inventory_transactions(item_id)""",

    """CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        total_amount FLOAT NOT NULL,
        payment_method VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_orders_tenant_id ON orders(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_orders_student_id ON orders(student_id)""",

    """CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
        item_name VARCHAR(255),
        quantity INTEGER NOT NULL,
        unit_price FLOAT NOT NULL,
        total_price FLOAT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_order_items_order_id ON order_items(order_id)""",

    # ── Clubs ────────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS clubs (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        advisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
        max_members INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_clubs_tenant_id ON clubs(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS club_memberships (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        role VARCHAR(50),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_club_memberships_tenant_id
        ON club_memberships(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_club_memberships_student_id
        ON club_memberships(student_id)""",
    """CREATE INDEX IF NOT EXISTS ix_club_memberships_club_id
        ON club_memberships(club_id)""",

    # ── Surveys ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS surveys (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        target_audience VARCHAR(100) DEFAULT 'ALL',
        is_anonymous BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_surveys_tenant_id ON surveys(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_surveys_created_by ON surveys(created_by)""",

    """CREATE TABLE IF NOT EXISTS survey_questions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        question_type VARCHAR(50) NOT NULL,
        options JSONB,
        order_index INTEGER NOT NULL DEFAULT 0,
        is_required BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_survey_questions_tenant_id
        ON survey_questions(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_survey_questions_survey_id
        ON survey_questions(survey_id)""",

    """CREATE TABLE IF NOT EXISTS survey_responses (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id UUID,
        response_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_survey_responses_tenant_id
        ON survey_responses(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_survey_responses_survey_id
        ON survey_responses(survey_id)""",

    # ── Announcements ────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        target_roles JSONB,
        pinned BOOLEAN DEFAULT false,
        published_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_announcements_tenant_id
        ON announcements(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_announcements_author_id
        ON announcements(author_id)""",

    # ── Conversations & Messaging ────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'DIRECT',
        title VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_conversations_tenant_id
        ON conversations(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS conversation_participants (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_conversation_participants_conversation_id
        ON conversation_participants(conversation_id)""",
    """CREATE INDEX IF NOT EXISTS ix_conversation_participants_user_id
        ON conversation_participants(user_id)""",

    """CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_messages_conversation_id
        ON messages(conversation_id)""",
    """CREATE INDEX IF NOT EXISTS ix_messages_tenant_id ON messages(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_messages_sender_id ON messages(sender_id)""",
    """CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages(created_at)""",

    """CREATE TABLE IF NOT EXISTS user_message_status (
        id UUID PRIMARY KEY,
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_user_message_status_message_id
        ON user_message_status(message_id)""",
    """CREATE INDEX IF NOT EXISTS ix_user_message_status_user_id
        ON user_message_status(user_id)""",

    # ── Forums ───────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS student_forums (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_student_forums_tenant_id
        ON student_forums(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_student_forums_created_by
        ON student_forums(created_by)""",

    """CREATE TABLE IF NOT EXISTS forum_posts (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        forum_id UUID NOT NULL REFERENCES student_forums(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_forum_posts_tenant_id ON forum_posts(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_forum_posts_forum_id ON forum_posts(forum_id)""",

    # ── School Life ──────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS student_badges (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        badge_type VARCHAR(100) NOT NULL,
        badge_name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_student_badges_tenant_id
        ON student_badges(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_student_badges_student_id
        ON student_badges(student_id)""",

    """CREATE TABLE IF NOT EXISTS career_event_registrations (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES career_events(id) ON DELETE CASCADE,
        student_id UUID,
        alumni_id UUID,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_career_event_registrations_tenant_id
        ON career_event_registrations(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_career_event_registrations_event_id
        ON career_event_registrations(event_id)""",

    # ── Alumni ───────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS alumni_document_requests (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        alumni_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_type VARCHAR(100) NOT NULL,
        document_description TEXT,
        purpose VARCHAR(500) NOT NULL,
        urgency VARCHAR(50) NOT NULL DEFAULT 'normal',
        delivery_method VARCHAR(50) NOT NULL DEFAULT 'email',
        delivery_address VARCHAR(500),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        validation_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_alumni_document_requests_tenant_id
        ON alumni_document_requests(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_alumni_document_requests_alumni_id
        ON alumni_document_requests(alumni_id)""",

    """CREATE TABLE IF NOT EXISTS alumni_request_history (
        id UUID PRIMARY KEY,
        request_id UUID NOT NULL REFERENCES alumni_document_requests(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        new_status VARCHAR(50),
        performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_alumni_request_history_request_id
        ON alumni_request_history(request_id)""",

    """CREATE TABLE IF NOT EXISTS job_offers (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        offer_type VARCHAR(100),
        description TEXT,
        location VARCHAR(255),
        is_remote BOOLEAN DEFAULT false,
        application_deadline TIMESTAMPTZ,
        contact_email VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_job_offers_tenant_id ON job_offers(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS alumni_mentors (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        current_position VARCHAR(255),
        current_company VARCHAR(255),
        bio TEXT,
        expertise_areas JSONB,
        linkedin_url VARCHAR(500),
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_alumni_mentors_tenant_id
        ON alumni_mentors(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS career_events (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        event_type VARCHAR(100),
        start_datetime TIMESTAMPTZ NOT NULL,
        end_datetime TIMESTAMPTZ,
        location VARCHAR(255),
        is_online BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_career_events_tenant_id
        ON career_events(tenant_id)""",

    """CREATE TABLE IF NOT EXISTS mentorship_requests (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        mentor_id UUID REFERENCES alumni_mentors(id) ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_mentorship_requests_tenant_id
        ON mentorship_requests(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_mentorship_requests_student_id
        ON mentorship_requests(student_id)""",
    """CREATE INDEX IF NOT EXISTS ix_mentorship_requests_mentor_id
        ON mentorship_requests(mentor_id)""",

    """CREATE TABLE IF NOT EXISTS job_applications (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        job_offer_id UUID NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
        cover_letter TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_job_applications_tenant_id
        ON job_applications(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_job_applications_student_id
        ON job_applications(student_id)""",
    """CREATE INDEX IF NOT EXISTS ix_job_applications_job_offer_id
        ON job_applications(job_offer_id)""",

    # ── Finance ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS fees (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        amount FLOAT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_fees_tenant_id ON fees(tenant_id)""",

    # ── School Settings ──────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS school_settings (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_school_settings_tenant_id
        ON school_settings(tenant_id)""",

    # ── Invoices ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        invoice_number VARCHAR(100),
        subtotal FLOAT NOT NULL DEFAULT 0,
        tax_amount FLOAT NOT NULL DEFAULT 0,
        discount_amount FLOAT NOT NULL DEFAULT 0,
        total_amount FLOAT NOT NULL DEFAULT 0,
        paid_amount FLOAT NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'GNF',
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        due_date DATE,
        issue_date DATE,
        description VARCHAR(500),
        items JSONB,
        notes TEXT,
        has_payment_plan BOOLEAN DEFAULT FALSE,
        installments_count INTEGER DEFAULT 1,
        pdf_url VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_invoices_tenant_id ON invoices(tenant_id)""",
    # ── Invoices: add missing columns for existing databases ──────────────
    """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal FLOAT NOT NULL DEFAULT 0""",
    """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount FLOAT NOT NULL DEFAULT 0""",
    """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount FLOAT NOT NULL DEFAULT 0""",
    """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GNF'""",
    """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description VARCHAR(500)""",
    """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(500)""",

    # ── Payment Schedules ──────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS payment_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        installment_number INTEGER NOT NULL,
        amount FLOAT NOT NULL DEFAULT 0,
        due_date DATE NOT NULL,
        paid_date TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_payment_schedules_tenant_id ON payment_schedules(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_payment_schedules_invoice_id ON payment_schedules(invoice_id)""",

    # ── Teacher Assignments ───────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS teacher_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
        classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_teacher_assignments_tenant_id ON teacher_assignments(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_teacher_assignments_user_id ON teacher_assignments(user_id)""",

    # ── Homework ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS homework (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
        classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        due_date DATE,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_homework_tenant_id ON homework(tenant_id)""",

    # ── Exams ─────────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS exams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
        classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        exam_date DATE,
        max_score FLOAT DEFAULT 20,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_exams_tenant_id ON exams(tenant_id)""",

    # ── Incidents ─────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS incidents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
        incident_type VARCHAR(100),
        description TEXT,
        severity VARCHAR(50) DEFAULT 'LOW',
        status VARCHAR(50) DEFAULT 'OPEN',
        incident_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_incidents_tenant_id ON incidents(tenant_id)""",

    # ── Audit Logs — add missing columns (severity, user_agent) ──────────
    """ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'INFO'""",
    """CREATE INDEX IF NOT EXISTS ix_audit_logs_severity ON audit_logs(severity)""",
    """ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT""",

    # ── Student Risk Scores ───────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS student_risk_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE CASCADE,
        risk_level VARCHAR(50) DEFAULT 'LOW',
        risk_score FLOAT DEFAULT 0,
        factors JSONB,
        calculated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_student_risk_scores_tenant_id ON student_risk_scores(tenant_id)""",

    # ── Appointment Slots ──────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS appointment_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        max_appointments INTEGER DEFAULT 1,
        location VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_appointment_slots_tenant_id ON appointment_slots(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_appointment_slots_teacher_id ON appointment_slots(teacher_id)""",

    # ── Appointments (Parent-Teacher) ──────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
        teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        student_id UUID REFERENCES students(id) ON DELETE CASCADE,
        appointment_date DATE NOT NULL,
        appointment_time TIME,
        slot_id UUID REFERENCES appointment_slots(id) ON DELETE SET NULL,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'REQUESTED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_appointments_tenant_id ON appointments(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_appointments_parent_id ON appointments(parent_id)""",

    # ── Check-In Sessions ──────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS check_in_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
        session_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_check_in_sessions_tenant_id ON check_in_sessions(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_check_in_sessions_teacher_id ON check_in_sessions(teacher_id)""",

    # ── Check-In Assignments ───────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS check_in_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        session_id UUID REFERENCES check_in_sessions(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'PENDING',
        mood VARCHAR(50),
        notes TEXT,
        checked_in_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_check_in_assignments_tenant_id ON check_in_assignments(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_check_in_assignments_session_id ON check_in_assignments(session_id)""",

    # ── Webhooks ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        events TEXT[] NOT NULL DEFAULT '{}',
        description VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        secret TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_webhooks_tenant_id ON webhooks(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_webhooks_tenant_active ON webhooks(tenant_id, is_active)""",

    # ── Achievement Definitions (Gamification) ────────────────────────────
    """CREATE TABLE IF NOT EXISTS achievement_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        category VARCHAR(50) DEFAULT 'general',
        points_value INTEGER NOT NULL DEFAULT 10,
        trigger_type VARCHAR(50) DEFAULT 'manual',
        trigger_threshold INTEGER DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_achieve_def_tenant ON achievement_definitions(tenant_id)""",
    """CREATE TABLE IF NOT EXISTS student_achievements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES users(id),
        achievement_id UUID NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
        earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        awarded_by UUID REFERENCES users(id),
        UNIQUE(student_id, achievement_id)
    )""",
    """CREATE INDEX IF NOT EXISTS ix_student_achieve_tenant ON student_achievements(tenant_id)""",

    # ── Data Quality Anomalies ────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS data_quality_anomalies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL DEFAULT 'data',
        severity VARCHAR(20) NOT NULL DEFAULT 'medium',
        title VARCHAR(200) NOT NULL,
        description TEXT,
        resource_type VARCHAR(100),
        resource_id UUID,
        affected_count INTEGER NOT NULL DEFAULT 0,
        is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_dq_tenant ON data_quality_anomalies(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_dq_tenant_resolved ON data_quality_anomalies(tenant_id, is_resolved)""",

    # ── E-Learning Courses ────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS elearning_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        subject_id UUID REFERENCES subjects(id),
        level_id UUID REFERENCES levels(id),
        teacher_id UUID REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        thumbnail_url TEXT,
        duration_hours NUMERIC(5,1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_elearning_courses_tenant ON elearning_courses(tenant_id)""",
    """CREATE TABLE IF NOT EXISTS elearning_modules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS elearning_enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES users(id),
        enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        progress_pct INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMPTZ,
        UNIQUE(course_id, student_id)
    )""",
    """CREATE INDEX IF NOT EXISTS ix_elearning_enroll_course ON elearning_enrollments(course_id)""",

    # ── Shared Notes (collaboration) ──────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS shared_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        author_id UUID REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        visibility VARCHAR(20) NOT NULL DEFAULT 'class',
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        view_count INTEGER NOT NULL DEFAULT 0,
        tags TEXT[] DEFAULT '{}',
        classroom_id UUID,
        subject_id UUID REFERENCES subjects(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_shared_notes_tenant ON shared_notes(tenant_id)""",
    """CREATE TABLE IF NOT EXISTS shared_note_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID NOT NULL REFERENCES shared_notes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(note_id, user_id)
    )""",
    """CREATE INDEX IF NOT EXISTS ix_shared_note_likes_note ON shared_note_likes(note_id)""",
    """CREATE TABLE IF NOT EXISTS shared_note_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID NOT NULL REFERENCES shared_notes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_shared_note_comments_note ON shared_note_comments(note_id)""",

    # ── Grade History (audit trail for grade changes) ─────────────────────
    """CREATE TABLE IF NOT EXISTS grade_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        grade_id UUID NOT NULL,
        user_id UUID REFERENCES users(id),
        old_score NUMERIC(5,2),
        new_score NUMERIC(5,2),
        old_comment TEXT,
        new_comment TEXT,
        change_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_grade_history_grade ON grade_history(grade_id)""",

    # ── Consent records (RGPD) ────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS user_consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        user_id UUID NOT NULL REFERENCES users(id),
        consent_type VARCHAR(50) NOT NULL,
        consent_given BOOLEAN NOT NULL DEFAULT FALSE,
        consent_version VARCHAR(20) NOT NULL DEFAULT '1.0',
        ip_address VARCHAR(45),
        user_agent TEXT,
        details JSONB,
        withdrawal_date TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_user_consents_user ON user_consents(user_id)""",

    # ── Course discussions ────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS course_discussions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        content TEXT NOT NULL,
        parent_id UUID REFERENCES course_discussions(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_course_discussions_course ON course_discussions(course_id)""",

    # ── Trusted devices (2FA bypass) ──────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS trusted_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name VARCHAR(200),
        device_fingerprint TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(user_id, device_fingerprint)
    )""",
    """CREATE INDEX IF NOT EXISTS ix_trusted_devices_user ON trusted_devices(user_id)""",

    # ── Point transactions (gamification) ────────────────────────────────
    """CREATE TABLE IF NOT EXISTS point_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        category VARCHAR(100) DEFAULT 'manual',
        reference_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE INDEX IF NOT EXISTS ix_point_transactions_tenant ON point_transactions(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_point_transactions_student ON point_transactions(student_id)""",

    # ── Quiz questions (e-learning) ───────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS quiz_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        quiz_id UUID NOT NULL,
        question_text TEXT NOT NULL,
        question_type VARCHAR(50) DEFAULT 'single_choice',
        options JSONB,
        correct_answer TEXT,
        points INTEGER DEFAULT 1,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE INDEX IF NOT EXISTS ix_quiz_questions_tenant ON quiz_questions(tenant_id)""",
    """CREATE INDEX IF NOT EXISTS ix_quiz_questions_quiz ON quiz_questions(quiz_id)""",

    # ── Tenant-scoped unique constraints ──────────────────────────────────
    """DO $$ BEGIN
        ALTER TABLE subjects ADD CONSTRAINT uq_subjects_tenant_name UNIQUE (tenant_id, name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$""",
    """DO $$ BEGIN
        ALTER TABLE departments ADD CONSTRAINT uq_departments_tenant_name UNIQUE (tenant_id, name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$""",
    """DO $$ BEGIN
        ALTER TABLE levels ADD CONSTRAINT uq_levels_tenant_name UNIQUE (tenant_id, name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$""",
]
# fmt: on


def ensure_operational_tables(engine) -> None:
    """Execute all operational DDL statements.

    Each statement runs in its own transaction so a single failure
    (e.g. table already exists with a different schema) does not
    block subsequent statements.
    """
    with engine.connect() as conn:
        for stmt in _DDL:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                logger.warning("Operational DDL skipped: %s (%s)", stmt[:80], exc)
