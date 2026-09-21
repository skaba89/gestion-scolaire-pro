#!/usr/bin/env python3
"""
Seed a full LMD test tenant: "Université La Source" (test).

Populates the structure documented in the "Plan de données de test —
Université La Source de Guinée" (facultés/départements/filières inspired by
the real institution's public program list, all people/students/grades are
FICTITIOUS test data): 4 facultés, 9 départements, UE avec ECTS/coefficient/
prérequis, 2 filières entièrement câblées pour les scénarios de progression
semestrielle (Génie Informatique et Droit), enseignants, étudiants, parents,
notes.

Usage:
    cd backend/
    DATABASE_URL=postgresql://... python -m scripts.seed_universite_la_source

Idempotent: re-running the script skips any row that already exists (looked
up by its natural key — slug, email, registration_number, code, name) and
reuses its id, same convention as seed_demo_tenants.py/create_admin.py.

Design notes / known limitations (see the plan document for full context):
  - Génie Informatique's semesters use number=1/2, Droit's use number=11/12.
    Semester has no program/filière scope in the current schema — two
    filières sharing number=1 in the same academic year would make the
    progression endpoint's "find the previous semester" lookup ambiguous
    (it matches on academic_year_id + number alone). Distinct numbers per
    filière sidestep this until the schema gains a real filière scope.
  - No formal teacher->subject assignment table is populated (out of scope
    for LMD testing); teacher accounts are created so they can be assigned
    manually via the UI if desired.
  - A password is fixed for every seeded human account: see PASSWORD below.
    Change it (or deactivate these accounts) before using this tenant for
    anything beyond local/staging testing.
"""
import sys
import os
import uuid
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
PASSWORD = "TestLMD@2026"
PASSWORD_HASH = pwd_context.hash(PASSWORD)

TENANT_SLUG = "universite-la-source-test"
TENANT_NAME = "Université La Source (test)"
DOMAIN = "lasource-test.gn"

now = lambda: datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def fetch_one(db, query: str, params: dict):
    return db.execute(text(query), params).fetchone()


def get_or_create_tenant(db) -> str:
    row = fetch_one(db, "SELECT id FROM tenants WHERE slug = :slug", {"slug": TENANT_SLUG})
    if row:
        return str(row[0])
    tenant_id = new_id()
    db.execute(text("""
        INSERT INTO tenants (id, name, slug, type, is_active, settings, created_at, updated_at, country)
        VALUES (:id, :name, :slug, 'university', true, '{}', :now, :now, 'GN')
    """), {"id": tenant_id, "name": TENANT_NAME, "slug": TENANT_SLUG, "now": now()})
    return tenant_id


def get_or_create_user(db, *, tenant_id: str, email: str, first_name: str, last_name: str, role: str) -> str:
    row = fetch_one(db, "SELECT id FROM users WHERE email = :email", {"email": email})
    if row:
        user_id = str(row[0])
    else:
        user_id = new_id()
        db.execute(text("""
            INSERT INTO users (id, tenant_id, email, username, password_hash, first_name, last_name,
                                is_active, is_superuser, is_verified, mfa_enabled, must_change_password,
                                created_at, updated_at)
            VALUES (:id, :tid, :email, :username, :pwd, :fn, :ln, true, false, true, false, false, :now, :now)
        """), {
            "id": user_id, "tid": tenant_id, "email": email, "username": email.split("@")[0],
            "pwd": PASSWORD_HASH, "fn": first_name, "ln": last_name, "now": now(),
        })
    role_row = fetch_one(db, "SELECT 1 FROM user_roles WHERE user_id = :uid AND role = :role", {"uid": user_id, "role": role})
    if not role_row:
        db.execute(text("""
            INSERT INTO user_roles (id, tenant_id, user_id, role, created_at, updated_at)
            VALUES (:id, :tid, :uid, :role, :now, :now)
        """), {"id": new_id(), "tid": tenant_id, "uid": user_id, "role": role, "now": now()})
    return user_id


def get_or_create_faculty(db, *, tenant_id: str, name: str, code: str) -> str:
    row = fetch_one(db, "SELECT id FROM faculties WHERE tenant_id = :tid AND name = :name", {"tid": tenant_id, "name": name})
    if row:
        return str(row[0])
    faculty_id = new_id()
    db.execute(text("""
        INSERT INTO faculties (id, tenant_id, name, code, description, created_at, updated_at)
        VALUES (:id, :tid, :name, :code, :desc, :now, :now)
    """), {"id": faculty_id, "tid": tenant_id, "name": name, "code": code, "desc": None, "now": now()})
    return faculty_id


def get_or_create_department(db, *, tenant_id: str, name: str, code: str, faculty_id: str, head_id: str = None) -> str:
    row = fetch_one(db, "SELECT id FROM departments WHERE tenant_id = :tid AND name = :name", {"tid": tenant_id, "name": name})
    if row:
        dept_id = str(row[0])
        if head_id:
            db.execute(text("UPDATE departments SET head_id = :hid WHERE id = :id"), {"hid": head_id, "id": dept_id})
        return dept_id
    dept_id = new_id()
    db.execute(text("""
        INSERT INTO departments (id, tenant_id, name, code, description, head_id, faculty_id, created_at, updated_at)
        VALUES (:id, :tid, :name, :code, NULL, :hid, :fid, :now, :now)
    """), {"id": dept_id, "tid": tenant_id, "name": name, "code": code, "hid": head_id, "fid": faculty_id, "now": now()})
    return dept_id


def get_or_create_academic_year(db, *, tenant_id: str, name: str, code: str, start: date, end: date, is_current: bool) -> str:
    row = fetch_one(db, "SELECT id FROM academic_years WHERE tenant_id = :tid AND code = :code", {"tid": tenant_id, "code": code})
    if row:
        return str(row[0])
    ay_id = new_id()
    db.execute(text("""
        INSERT INTO academic_years (id, tenant_id, name, code, start_date, end_date, is_current, created_at, updated_at)
        VALUES (:id, :tid, :name, :code, :start, :end, :cur, :now, :now)
    """), {"id": ay_id, "tid": tenant_id, "name": name, "code": code, "start": start, "end": end, "cur": is_current, "now": now()})
    return ay_id


def get_or_create_semester(db, *, tenant_id: str, academic_year_id: str, name: str, number: int,
                            start: date, end: date, credits_required_to_advance=None) -> str:
    row = fetch_one(db, "SELECT id FROM semesters WHERE tenant_id = :tid AND name = :name", {"tid": tenant_id, "name": name})
    if row:
        return str(row[0])
    sem_id = new_id()
    db.execute(text("""
        INSERT INTO semesters (id, tenant_id, academic_year_id, name, number, start_date, end_date,
                                is_active, credits_required_to_advance, created_at, updated_at)
        VALUES (:id, :tid, :ay, :name, :num, :start, :end, false, :credits, :now, :now)
    """), {
        "id": sem_id, "tid": tenant_id, "ay": academic_year_id, "name": name, "num": number,
        "start": start, "end": end, "credits": credits_required_to_advance, "now": now(),
    })
    return sem_id


def get_or_create_subject(db, *, tenant_id: str, name: str, code: str, ects: float, coefficient: float,
                           cm: int = 0, td: int = 0, tp: int = 0, semester_id: str = None,
                           department_ids: list = None) -> str:
    row = fetch_one(db, "SELECT id FROM subjects WHERE tenant_id = :tid AND code = :code", {"tid": tenant_id, "code": code})
    if row:
        subject_id = str(row[0])
    else:
        subject_id = new_id()
        db.execute(text("""
            INSERT INTO subjects (id, tenant_id, name, code, coefficient, ects, cm_hours, td_hours, tp_hours,
                                   description, semester_id, created_at, updated_at)
            VALUES (:id, :tid, :name, :code, :coeff, :ects, :cm, :td, :tp, NULL, :sem, :now, :now)
        """), {
            "id": subject_id, "tid": tenant_id, "name": name, "code": code, "coeff": coefficient,
            "ects": ects, "cm": cm, "td": td, "tp": tp, "sem": semester_id, "now": now(),
        })
    for dept_id in (department_ids or []):
        link = fetch_one(db, """
            SELECT 1 FROM subject_departments WHERE subject_id = :sid AND department_id = :did AND tenant_id = :tid
        """, {"sid": subject_id, "did": dept_id, "tid": tenant_id})
        if not link:
            db.execute(text("""
                INSERT INTO subject_departments (tenant_id, subject_id, department_id) VALUES (:tid, :sid, :did)
            """), {"tid": tenant_id, "sid": subject_id, "did": dept_id})
    return subject_id


def add_prerequisite(db, *, tenant_id: str, subject_id: str, prerequisite_subject_id: str) -> None:
    link = fetch_one(db, """
        SELECT 1 FROM subject_prerequisites WHERE subject_id = :sid AND prerequisite_subject_id = :pid AND tenant_id = :tid
    """, {"sid": subject_id, "pid": prerequisite_subject_id, "tid": tenant_id})
    if not link:
        db.execute(text("""
            INSERT INTO subject_prerequisites (tenant_id, subject_id, prerequisite_subject_id)
            VALUES (:tid, :sid, :pid)
        """), {"tid": tenant_id, "sid": subject_id, "pid": prerequisite_subject_id})


def get_or_create_student(db, *, tenant_id: str, reg_number: str, first_name: str, last_name: str,
                           dob: date, gender: str, level: str) -> str:
    row = fetch_one(db, "SELECT id FROM students WHERE registration_number = :reg", {"reg": reg_number})
    if row:
        return str(row[0])
    student_id = new_id()
    db.execute(text("""
        INSERT INTO students (id, tenant_id, registration_number, first_name, last_name, date_of_birth,
                               gender, status, level, created_at, updated_at)
        VALUES (:id, :tid, :reg, :fn, :ln, :dob, :gender, 'ACTIVE', :level, :now, :now)
    """), {
        "id": student_id, "tid": tenant_id, "reg": reg_number, "fn": first_name, "ln": last_name,
        "dob": dob, "gender": gender, "level": level, "now": now(),
    })
    return student_id


def link_parent(db, *, tenant_id: str, parent_id: str, student_id: str, relation: str, is_primary: bool) -> None:
    row = fetch_one(db, """
        SELECT 1 FROM parent_students WHERE tenant_id = :tid AND parent_id = :pid AND student_id = :sid
    """, {"tid": tenant_id, "pid": parent_id, "sid": student_id})
    if not row:
        db.execute(text("""
            INSERT INTO parent_students (id, tenant_id, parent_id, student_id, is_primary, relation_type, created_at, updated_at)
            VALUES (:id, :tid, :pid, :sid, :primary, :rel, :now, :now)
        """), {"id": new_id(), "tid": tenant_id, "pid": parent_id, "sid": student_id, "primary": is_primary, "rel": relation, "now": now()})


def register_student_subject(db, *, tenant_id: str, student_id: str, subject_id: str) -> None:
    row = fetch_one(db, """
        SELECT 1 FROM student_subjects WHERE tenant_id = :tid AND student_id = :sid AND subject_id = :subid
    """, {"tid": tenant_id, "sid": student_id, "subid": subject_id})
    if not row:
        db.execute(text("""
            INSERT INTO student_subjects (tenant_id, student_id, subject_id, created_at)
            VALUES (:tid, :sid, :subid, :now)
        """), {"tid": tenant_id, "sid": student_id, "subid": subject_id, "now": now()})


def grade_student(db, *, tenant_id: str, student_id: str, subject_id: str, academic_year_id: str,
                   score: float, label: str) -> None:
    """Creates one Assessment + one Grade for `subject_id`, then registers the
    student on the subject (idempotent — safe to call once per student per
    subject)."""
    register_student_subject(db, tenant_id=tenant_id, student_id=student_id, subject_id=subject_id)

    existing = fetch_one(db, """
        SELECT 1 FROM grades WHERE tenant_id = :tid AND student_id = :sid AND subject_id = :subid
    """, {"tid": tenant_id, "sid": student_id, "subid": subject_id})
    if existing:
        return

    assessment_id = new_id()
    db.execute(text("""
        INSERT INTO assessments (id, tenant_id, name, max_score, date, assessment_type, weight,
                                  subject_id, academic_year_id, created_at, updated_at)
        VALUES (:id, :tid, :name, 20.0, :date, 'EXAM', 1.0, :subid, :ay, :now, :now)
    """), {"id": assessment_id, "tid": tenant_id, "name": label, "date": now(), "subid": subject_id, "ay": academic_year_id, "now": now()})

    db.execute(text("""
        INSERT INTO grades (id, tenant_id, student_id, assessment_id, subject_id, academic_year_id,
                             score, max_score, coefficient, created_at, updated_at)
        VALUES (:id, :tid, :sid, :aid, :subid, :ay, :score, 20.0, 1.0, :now, :now)
    """), {
        "id": new_id(), "tid": tenant_id, "sid": student_id, "aid": assessment_id, "subid": subject_id,
        "ay": academic_year_id, "score": score, "now": now(),
    })


def seed():
    db = SessionLocal()
    try:
        tenant_id = get_or_create_tenant(db)
        db.commit()
        print(f"Tenant: {TENANT_NAME} ({TENANT_SLUG}) -> {tenant_id}")

        # ── Année académique ────────────────────────────────────────────
        ay_id = get_or_create_academic_year(
            db, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start=date(2026, 9, 1), end=date(2027, 6, 30), is_current=True,
        )

        # ── Facultés ─────────────────────────────────────────────────────
        fac_fmp = get_or_create_faculty(db, tenant_id=tenant_id, name="Faculté de Médecine et Pharmacie", code="FMP")
        fac_fdspri = get_or_create_faculty(db, tenant_id=tenant_id, name="Faculté de Droit, Sc. Politiques et Relations Internationales", code="FDSPRI")
        fac_fseg = get_or_create_faculty(db, tenant_id=tenant_id, name="Faculté des Sciences Économiques et de Gestion", code="FSEG")
        fac_fst = get_or_create_faculty(db, tenant_id=tenant_id, name="Faculté des Sciences et Techniques", code="FST")

        # ── Enseignants (créés avant les départements pour pouvoir les nommer chefs) ──
        t_camara = get_or_create_user(db, tenant_id=tenant_id, email=f"m.camara@{DOMAIN}", first_name="Mamadou", last_name="Camara", role="TEACHER")
        t_barry = get_or_create_user(db, tenant_id=tenant_id, email=f"f.barry@{DOMAIN}", first_name="Fatoumata", last_name="Barry", role="TEACHER")
        t_diallo = get_or_create_user(db, tenant_id=tenant_id, email=f"is.diallo@{DOMAIN}", first_name="Ibrahima Sory", last_name="Diallo", role="TEACHER")
        t_balde = get_or_create_user(db, tenant_id=tenant_id, email=f"a.balde@{DOMAIN}", first_name="Aïssatou", last_name="Baldé", role="TEACHER")
        t_conde = get_or_create_user(db, tenant_id=tenant_id, email=f"s.conde@{DOMAIN}", first_name="Sékou", last_name="Condé", role="DEPARTMENT_HEAD")
        t_sow = get_or_create_user(db, tenant_id=tenant_id, email=f"m.sow@{DOMAIN}", first_name="Mariama", last_name="Sow", role="DEPARTMENT_HEAD")
        t_bah = get_or_create_user(db, tenant_id=tenant_id, email=f"ao.bah@{DOMAIN}", first_name="Alpha Oumar", last_name="Bah", role="TEACHER")
        t_toure = get_or_create_user(db, tenant_id=tenant_id, email=f"k.toure@{DOMAIN}", first_name="Kadiatou", last_name="Touré", role="TEACHER")

        # ── Administrateur de l'établissement ───────────────────────────
        admin_id = get_or_create_user(db, tenant_id=tenant_id, email=f"admin@{DOMAIN}", first_name="Directeur", last_name="Général", role="TENANT_ADMIN")

        # ── Départements ─────────────────────────────────────────────────
        dep_medecine = get_or_create_department(db, tenant_id=tenant_id, name="Département de Médecine", code="MED", faculty_id=fac_fmp)
        dep_pharmacie = get_or_create_department(db, tenant_id=tenant_id, name="Département de Pharmacie", code="PHAR", faculty_id=fac_fmp)
        dep_droit_prive = get_or_create_department(db, tenant_id=tenant_id, name="Département de Droit Privé", code="DRTP", faculty_id=fac_fdspri, head_id=t_sow)
        dep_droit_public = get_or_create_department(db, tenant_id=tenant_id, name="Département de Droit Public", code="DRTPU", faculty_id=fac_fdspri)
        dep_ri_socio = get_or_create_department(db, tenant_id=tenant_id, name="Département Relations Internationales & Sociologie", code="RISOC", faculty_id=fac_fdspri)
        dep_eco = get_or_create_department(db, tenant_id=tenant_id, name="Département d'Économie", code="ECO", faculty_id=fac_fseg)
        dep_gestion = get_or_create_department(db, tenant_id=tenant_id, name="Département de Gestion", code="GEST", faculty_id=fac_fseg)
        dep_info = get_or_create_department(db, tenant_id=tenant_id, name="Département de Génie Informatique", code="INFO", faculty_id=fac_fst, head_id=t_conde)
        dep_env = get_or_create_department(db, tenant_id=tenant_id, name="Département Environnement & Développement Durable", code="ENV", faculty_id=fac_fst)

        # ── Semestres — Génie Informatique (number=1/2) ─────────────────
        gi_s1 = get_or_create_semester(
            db, tenant_id=tenant_id, academic_year_id=ay_id, name="S1 - Génie Informatique", number=1,
            start=date(2026, 9, 1), end=date(2027, 1, 31), credits_required_to_advance=15.0,
        )
        gi_s2 = get_or_create_semester(
            db, tenant_id=tenant_id, academic_year_id=ay_id, name="S2 - Génie Informatique", number=2,
            start=date(2027, 2, 1), end=date(2027, 6, 30),
        )

        # ── Semestres — Droit (number=11/12, voir note en tête de fichier) ──
        drt_s1 = get_or_create_semester(
            db, tenant_id=tenant_id, academic_year_id=ay_id, name="S1 - Droit", number=11,
            start=date(2026, 9, 1), end=date(2027, 1, 31), credits_required_to_advance=12.0,
        )
        drt_s2 = get_or_create_semester(
            db, tenant_id=tenant_id, academic_year_id=ay_id, name="S2 - Droit", number=12,
            start=date(2027, 2, 1), end=date(2027, 6, 30),
        )

        # ── Matières — Licence Génie Informatique L1 ────────────────────
        info101 = get_or_create_subject(db, tenant_id=tenant_id, name="Algorithmique et Programmation 1", code="INFO101", ects=6, coefficient=3, cm=30, td=20, tp=20, semester_id=gi_s1, department_ids=[dep_info])
        info102 = get_or_create_subject(db, tenant_id=tenant_id, name="Architecture des Ordinateurs", code="INFO102", ects=5, coefficient=2, cm=30, td=10, tp=10, semester_id=gi_s1, department_ids=[dep_info])
        math101 = get_or_create_subject(db, tenant_id=tenant_id, name="Mathématiques Discrètes", code="MATH101", ects=5, coefficient=2, cm=30, td=20, semester_id=gi_s1, department_ids=[dep_info])
        angl101 = get_or_create_subject(db, tenant_id=tenant_id, name="Anglais Technique", code="ANGL101", ects=2, coefficient=1, cm=20, semester_id=gi_s1, department_ids=[dep_info])
        info103 = get_or_create_subject(db, tenant_id=tenant_id, name="Algorithmique et Programmation 2", code="INFO103", ects=6, coefficient=3, cm=30, td=20, tp=20, semester_id=gi_s2, department_ids=[dep_info])
        info104 = get_or_create_subject(db, tenant_id=tenant_id, name="Bases de Données 1", code="INFO104", ects=6, coefficient=3, cm=20, td=10, tp=20, semester_id=gi_s2, department_ids=[dep_info])
        math102 = get_or_create_subject(db, tenant_id=tenant_id, name="Analyse et Algèbre Linéaire", code="MATH102", ects=5, coefficient=2, cm=30, td=20, semester_id=gi_s2, department_ids=[dep_info])
        sys101 = get_or_create_subject(db, tenant_id=tenant_id, name="Systèmes d'Exploitation", code="SYS101", ects=5, coefficient=2, cm=20, td=10, tp=20, semester_id=gi_s2, department_ids=[dep_info])
        add_prerequisite(db, tenant_id=tenant_id, subject_id=info103, prerequisite_subject_id=info101)

        # ── Matières — Licence Droit L1 ──────────────────────────────────
        drt101 = get_or_create_subject(db, tenant_id=tenant_id, name="Introduction au Droit et Droit Civil", code="DRT101", ects=6, coefficient=3, cm=40, td=20, semester_id=drt_s1, department_ids=[dep_droit_prive])
        drt102 = get_or_create_subject(db, tenant_id=tenant_id, name="Droit Constitutionnel", code="DRT102", ects=5, coefficient=2, cm=30, td=10, semester_id=drt_s1, department_ids=[dep_droit_public])
        soc101 = get_or_create_subject(db, tenant_id=tenant_id, name="Sociologie Générale", code="SOC101", ects=4, coefficient=2, cm=30, semester_id=drt_s1, department_ids=[dep_ri_socio])
        angl102 = get_or_create_subject(db, tenant_id=tenant_id, name="Anglais Juridique", code="ANGL102", ects=2, coefficient=1, cm=20, semester_id=drt_s1, department_ids=[dep_droit_prive])
        drt103 = get_or_create_subject(db, tenant_id=tenant_id, name="Droit Civil des Personnes et de la Famille", code="DRT103", ects=6, coefficient=3, cm=30, td=20, semester_id=drt_s2, department_ids=[dep_droit_prive])
        drt104 = get_or_create_subject(db, tenant_id=tenant_id, name="Institutions Internationales", code="DRT104", ects=5, coefficient=2, cm=30, td=10, semester_id=drt_s2, department_ids=[dep_ri_socio])
        soc102 = get_or_create_subject(db, tenant_id=tenant_id, name="Méthodologie des Sciences Sociales", code="SOC102", ects=4, coefficient=2, cm=20, td=10, semester_id=drt_s2, department_ids=[dep_ri_socio])
        add_prerequisite(db, tenant_id=tenant_id, subject_id=drt103, prerequisite_subject_id=drt101)

        # ── Échantillon Médecine / Pharmacie / Économie / Masters (hors LMD, sans semestre) ──
        get_or_create_subject(db, tenant_id=tenant_id, name="Anatomie Générale", code="MED101", ects=8, coefficient=3, department_ids=[dep_medecine])
        get_or_create_subject(db, tenant_id=tenant_id, name="Biologie Cellulaire", code="MED102", ects=6, coefficient=2, department_ids=[dep_medecine])
        get_or_create_subject(db, tenant_id=tenant_id, name="Chimie Pharmaceutique 1", code="PHAR101", ects=6, coefficient=2, department_ids=[dep_pharmacie])
        eco101 = get_or_create_subject(db, tenant_id=tenant_id, name="Microéconomie", code="ECO101", ects=6, coefficient=2, department_ids=[dep_eco])
        get_or_create_subject(db, tenant_id=tenant_id, name="Macroéconomie", code="ECO102", ects=6, coefficient=2, department_ids=[dep_eco])
        get_or_create_subject(db, tenant_id=tenant_id, name="Économie de la Santé Appliquée", code="ECOSAN501", ects=10, coefficient=3, department_ids=[dep_eco])
        get_or_create_subject(db, tenant_id=tenant_id, name="Gestion des Risques et Catastrophes", code="ENV501", ects=10, coefficient=3, department_ids=[dep_env])
        get_or_create_subject(db, tenant_id=tenant_id, name="Prévention des Risques Professionnels", code="SST501", ects=10, coefficient=3, department_ids=[dep_env])

        # UE volontairement SANS semestre — sert au test "I4 : inscription à
        # une UE hors LMD, jamais bloquée" du plan de test.
        sport = get_or_create_subject(db, tenant_id=tenant_id, name="Sport / Activités Physiques", code="SPORT101", ects=1, coefficient=1)

        db.commit()
        print("Structure académique (facultés/départements/semestres/matières) créée.")

        # ── Étudiants ────────────────────────────────────────────────────
        mohamed = get_or_create_student(db, tenant_id=tenant_id, reg_number="ULS-2026-0001", first_name="Mohamed Lamine", last_name="Keita", dob=date(2005, 3, 12), gender="MALE", level="Génie Informatique L1")
        nassira = get_or_create_student(db, tenant_id=tenant_id, reg_number="ULS-2026-0002", first_name="Nassira", last_name="Diakité", dob=date(2005, 7, 4), gender="FEMALE", level="Génie Informatique L1")
        thierno = get_or_create_student(db, tenant_id=tenant_id, reg_number="ULS-2026-0003", first_name="Thierno Amadou", last_name="Sylla", dob=date(2004, 11, 20), gender="MALE", level="Droit L1")
        djenabou = get_or_create_student(db, tenant_id=tenant_id, reg_number="ULS-2025-0104", first_name="Djénabou", last_name="Cissé", dob=date(2004, 2, 15), gender="FEMALE", level="Droit L2")
        alseny = get_or_create_student(db, tenant_id=tenant_id, reg_number="ULS-2025-0087", first_name="Alseny", last_name="Fofana", dob=date(2004, 9, 9), gender="MALE", level="Génie Informatique L2")

        # ── Parents ──────────────────────────────────────────────────────
        p_keita = get_or_create_user(db, tenant_id=tenant_id, email=f"h.keita.parent@{DOMAIN}", first_name="Hawa", last_name="Keita", role="PARENT")
        p_diakite = get_or_create_user(db, tenant_id=tenant_id, email=f"o.diakite.parent@{DOMAIN}", first_name="Ousmane", last_name="Diakité", role="PARENT")
        p_sylla = get_or_create_user(db, tenant_id=tenant_id, email=f"d.sylla.parent@{DOMAIN}", first_name="Djénabou", last_name="Sylla", role="PARENT")
        p_cisse = get_or_create_user(db, tenant_id=tenant_id, email=f"l.cisse.parent@{DOMAIN}", first_name="Lansana", last_name="Cissé", role="PARENT")
        p_fofana = get_or_create_user(db, tenant_id=tenant_id, email=f"m.fofana.parent@{DOMAIN}", first_name="Mariam", last_name="Fofana", role="PARENT")

        link_parent(db, tenant_id=tenant_id, parent_id=p_keita, student_id=mohamed, relation="MOTHER", is_primary=True)
        link_parent(db, tenant_id=tenant_id, parent_id=p_diakite, student_id=nassira, relation="FATHER", is_primary=True)
        link_parent(db, tenant_id=tenant_id, parent_id=p_sylla, student_id=thierno, relation="MOTHER", is_primary=True)
        link_parent(db, tenant_id=tenant_id, parent_id=p_cisse, student_id=djenabou, relation="FATHER", is_primary=True)
        link_parent(db, tenant_id=tenant_id, parent_id=p_fofana, student_id=alseny, relation="MOTHER", is_primary=True)

        db.commit()
        print("Étudiants et comptes parents créés.")

        # ── Cas R1 (positif) : Djénabou valide tout son S1 Droit ────────
        # 6+5+4+2 = 17 ECTS >= seuil 12 configuré sur S1 Droit -> éligible S2.
        grade_student(db, tenant_id=tenant_id, student_id=djenabou, subject_id=drt101, academic_year_id=ay_id, score=14, label="Examen S1 - Introduction au Droit")
        grade_student(db, tenant_id=tenant_id, student_id=djenabou, subject_id=drt102, academic_year_id=ay_id, score=13, label="Examen S1 - Droit Constitutionnel")
        grade_student(db, tenant_id=tenant_id, student_id=djenabou, subject_id=soc101, academic_year_id=ay_id, score=15, label="Examen S1 - Sociologie Générale")
        grade_student(db, tenant_id=tenant_id, student_id=djenabou, subject_id=angl102, academic_year_id=ay_id, score=12, label="Examen S1 - Anglais Juridique")
        # Déjà inscrite à une UE de S2 nécessitant DRT101 (validé) -> preuve du cas positif R7.
        register_student_subject(db, tenant_id=tenant_id, student_id=djenabou, subject_id=drt103)

        # ── Cas R2/R3 (négatif) : Alseny échoue une partie de son S1 Info ──
        # INFO101 (6 ECTS) et MATH101 (5 ECTS) échoués -> seuls INFO102 (5) et
        # ANGL101 (2) sont acquis = 7 ECTS < seuil 15 configuré sur S1 Info ->
        # bloqué pour s'inscrire à une UE de S2 tant qu'il n'a pas progressé.
        grade_student(db, tenant_id=tenant_id, student_id=alseny, subject_id=info101, academic_year_id=ay_id, score=8, label="Examen S1 - Algorithmique 1")
        grade_student(db, tenant_id=tenant_id, student_id=alseny, subject_id=info102, academic_year_id=ay_id, score=14, label="Examen S1 - Architecture des Ordinateurs")
        grade_student(db, tenant_id=tenant_id, student_id=alseny, subject_id=math101, academic_year_id=ay_id, score=6, label="Examen S1 - Mathématiques Discrètes")
        grade_student(db, tenant_id=tenant_id, student_id=alseny, subject_id=angl101, academic_year_id=ay_id, score=12, label="Examen S1 - Anglais Technique")

        db.commit()
        print("Notes et inscriptions de démonstration (Djénabou = éligible S2, Alseny = bloqué) créées.")

        db.commit()

        print("\n" + "=" * 72)
        print("SEED TERMINÉ —", TENANT_NAME)
        print("=" * 72)
        print(f"Slug tenant : {TENANT_SLUG}")
        print(f"Mot de passe (tous les comptes créés par ce script) : {PASSWORD}")
        print("\nComptes :")
        print(f"  Admin (TENANT_ADMIN)      : admin@{DOMAIN}")
        print(f"  Chef dépt. Info (D.HEAD)  : s.conde@{DOMAIN}")
        print(f"  Chef dépt. Droit (D.HEAD) : m.sow@{DOMAIN}")
        print(f"  Enseignants (TEACHER)     : m.camara@{DOMAIN}, f.barry@{DOMAIN}, is.diallo@{DOMAIN}, "
              f"a.balde@{DOMAIN}, ao.bah@{DOMAIN}, k.toure@{DOMAIN}")
        print(f"  Parents (PARENT)          : h.keita.parent@{DOMAIN}, o.diakite.parent@{DOMAIN}, "
              f"d.sylla.parent@{DOMAIN}, l.cisse.parent@{DOMAIN}, m.fofana.parent@{DOMAIN}")
        print("\nÉtudiants prêts pour les tests I1-I7 (aucune inscription/note pré-remplie) :")
        print(f"  Mohamed Lamine KEITA (ULS-2026-0001) — Génie Informatique L1")
        print(f"  Nassira DIAKITÉ (ULS-2026-0002) — Génie Informatique L1")
        print(f"  Thierno Amadou SYLLA (ULS-2026-0003) — Droit L1")
        print("\nÉtudiants prêts pour les tests R1-R7 (S1 déjà noté) :")
        print(f"  Djénabou CISSÉ (ULS-2025-0104) — éligible à S2 Droit (17/12 ECTS)")
        print(f"  Alseny FOFANA (ULS-2025-0087) — bloqué pour S2 Info (7/15 ECTS)")
        print("\nUE de test I3/I4 :")
        print(f"  INFO103 nécessite INFO101 (prérequis) — tester avec Mohamed/Nassira")
        print(f"  DRT103 nécessite DRT101 (prérequis) — tester avec Thierno")
        print(f"  SPORT101 n'a ni semestre ni prérequis — jamais bloquée (test I4)")
        print("=" * 72)

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Échec du seed : {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
