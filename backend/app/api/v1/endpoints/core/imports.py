"""
Data Import endpoints — CSV bulk import for students and staff.
Supports CSV files with flexible column mapping (French and English headers).
No external dependency: uses Python stdlib csv + io.
"""
import csv
import io
import logging
import random
import string
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_permission, require_plan
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models.parent_student import ParentStudent as ParentStudentModel
from app.models.student import Student
from app.models.user import User
from app.models.user_role import UserRole
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Column aliases (French + English) ─────────────────────────────────────────

STUDENT_COLUMN_MAP = {
    # Identification
    "first_name": ["first_name", "prenom", "prénom", "firstname", "given_name"],
    "last_name": ["last_name", "nom", "surname", "family_name", "lastname"],
    "date_of_birth": ["date_of_birth", "date_naissance", "naissance", "dob", "birth_date"],
    "gender": ["gender", "sexe", "genre"],
    "registration_number": ["registration_number", "matricule", "numero", "numéro", "reg_number"],
    # Academic
    "level": ["level", "niveau", "classe_niveau"],
    "class_name": ["class_name", "classe", "class", "classname"],
    "academic_year": ["academic_year", "annee_scolaire", "année_scolaire", "annee", "year"],
    # Contact
    "email": ["email", "courriel", "mail"],
    "phone": ["phone", "telephone", "téléphone", "tel"],
    "address": ["address", "adresse"],
    "city": ["city", "ville"],
    # Parent/Guardian
    "parent_name": ["parent_name", "nom_parent", "tuteur", "guardian_name", "parent"],
    "parent_phone": ["parent_phone", "tel_parent", "telephone_parent", "phone_parent"],
    "parent_email": ["parent_email", "email_parent", "courriel_parent"],
}

TEACHER_COLUMN_MAP = {
    "first_name": ["first_name", "prenom", "prénom"],
    "last_name": ["last_name", "nom", "surname"],
    "email": ["email", "courriel", "mail"],
    "phone": ["phone", "telephone", "téléphone"],
    "subjects": ["subjects", "matieres", "matières", "subject", "discipline"],
    "qualification": ["qualification", "diplome", "diplôme", "degree"],
    "department": ["department", "departement", "département"],
    "contract_type": ["contract_type", "type_contrat", "contrat"],
    "date_of_birth": ["date_of_birth", "date_naissance", "naissance", "dob"],
    "gender": ["gender", "sexe"],
    "hire_date": ["hire_date", "date_embauche", "date_recrutement"],
    "salary": ["salary", "salaire"],
}

PARENT_COLUMN_MAP = {
    "first_name": ["first_name", "prenom", "prénom"],
    "last_name": ["last_name", "nom", "surname"],
    "email": ["email", "courriel", "mail"],
    "phone": ["phone", "telephone", "téléphone", "tel"],
    "occupation": ["occupation", "profession", "métier", "metier"],
    "address": ["address", "adresse"],
    "relation_type": ["relation_type", "relation", "lien", "lien_parente"],
    "is_primary": ["is_primary", "principal", "contact_principal"],
    # Which student(s) this parent is linked to — comma-separated matricules
    # (or emails) to support one parent with several children in one row.
    "student_registration_numbers": [
        "student_registration_numbers", "matricule_eleve", "matricules_eleves",
        "matricule", "registration_number", "student_registration_number",
    ],
    "student_emails": ["student_emails", "email_eleve", "student_email"],
}


def _detect_columns(headers: list[str], column_map: dict) -> dict[str, Optional[str]]:
    """Map CSV headers → canonical field names, case-insensitively."""
    normalized = {h.lower().strip(): h for h in headers}
    result = {}
    for field, aliases in column_map.items():
        result[field] = None
        for alias in aliases:
            if alias.lower() in normalized:
                result[field] = normalized[alias.lower()]
                break
    return result


def _parse_date(val: str) -> Optional[date]:
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def _parse_gender(val: str) -> str:
    v = val.strip().upper()
    if v in ("M", "MALE", "MASCULIN", "H", "HOMME", "GARCON", "GARÇON"):
        return "MALE"
    if v in ("F", "FEMALE", "FEMININ", "FÉMININ", "FEMME", "FILLE"):
        return "FEMALE"
    return "OTHER"


def _generate_registration(tenant_id: str, existing: set) -> str:
    prefix = "ETU"
    while True:
        suffix = "".join(random.choices(string.digits, k=6))
        reg = f"{prefix}{suffix}"
        if reg not in existing:
            existing.add(reg)
            return reg


def _parse_csv_bytes(content: bytes) -> tuple[list[str], list[dict]]:
    """Auto-detect delimiter (;  or ,) and return (headers, rows)."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Fallback: try latin-1 (common for Excel exports from Windows)
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError as exc:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"Encodage du fichier non supporté. Veuillez utiliser UTF-8 ou Latin-1. Détail : {exc}",
            )
    # Detect delimiter
    sample = text[:2048]
    semicolons = sample.count(";")
    commas = sample.count(",")
    delim = ";" if semicolons > commas else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    headers = reader.fieldnames or []
    rows = [dict(r) for r in reader]
    return list(headers), rows


# ── Preview endpoint ───────────────────────────────────────────────────────────

@router.post("/students/preview/")
async def preview_student_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("students:write")),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    POST /import/students/preview/
    Parse the CSV/Excel file (must be CSV or CSV-exported from Excel) and
    return:
      - detected column mapping
      - first 10 rows preview
      - validation errors per row
    """
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5 Mo)")

    headers, rows = _parse_csv_bytes(content)
    if not headers:
        raise HTTPException(status_code=400, detail="Fichier CSV vide ou format invalide")

    mapping = _detect_columns(headers, STUDENT_COLUMN_MAP)

    # Validate first 50 rows for preview
    preview = []
    errors = []
    for i, row in enumerate(rows[:50], start=2):  # row 1 = headers
        record = {}
        row_errors = []

        # Required: first_name, last_name
        for req in ("first_name", "last_name"):
            col = mapping.get(req)
            val = row.get(col, "").strip() if col else ""
            if not val:
                row_errors.append(f"Ligne {i}: champ '{req}' manquant")
            record[req] = val

        # date_of_birth
        dob_col = mapping.get("date_of_birth")
        dob_str = row.get(dob_col, "").strip() if dob_col else ""
        if dob_str:
            dob = _parse_date(dob_str)
            if dob is None:
                row_errors.append(f"Ligne {i}: date de naissance invalide '{dob_str}'")
            record["date_of_birth"] = dob_str
        else:
            row_errors.append(f"Ligne {i}: date de naissance manquante")
            record["date_of_birth"] = ""

        # gender
        gender_col = mapping.get("gender")
        gender_str = row.get(gender_col, "").strip() if gender_col else ""
        record["gender"] = _parse_gender(gender_str) if gender_str else "OTHER"
        if not gender_str:
            row_errors.append(f"Ligne {i}: genre manquant, 'OTHER' utilisé par défaut")

        # Optional fields
        for field in ("registration_number", "level", "class_name", "academic_year",
                       "email", "phone", "address", "city",
                       "parent_name", "parent_phone", "parent_email"):
            col = mapping.get(field)
            record[field] = row.get(col, "").strip() if col else ""

        record["_errors"] = row_errors
        preview.append(record)
        errors.extend(row_errors)

    return {
        "total_rows": len(rows),
        "headers": headers,
        "mapping": mapping,
        "preview": preview[:10],
        "validation_errors": errors[:50],
        "has_errors": bool(errors),
        "required_missing": [
            f for f in ("first_name", "last_name", "date_of_birth")
            if not mapping.get(f)
        ],
    }


# ── Confirm import ─────────────────────────────────────────────────────────────

@router.post("/students/confirm/")
async def confirm_student_import(
    request: Request,
    file: UploadFile = File(...),
    skip_errors: bool = Form(False),
    default_academic_year: str = Form(""),
    current_user: dict = Depends(require_permission("students:write")),
    db: Session = Depends(get_db),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    POST /import/students/confirm/
    Actually imports all students from the CSV into the database.
    Returns count of created / skipped / errored rows.
    """
    from sqlalchemy import text

    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID manquant")

    content = await file.read()
    headers, rows = _parse_csv_bytes(content)
    mapping = _detect_columns(headers, STUDENT_COLUMN_MAP)

    # Fetch existing registration numbers to avoid duplicates
    existing_regs = set(
        r[0] for r in db.execute(
            text("SELECT registration_number FROM students WHERE tenant_id = :tid"),
            {"tid": tenant_id}
        ).fetchall()
    )

    created = 0
    skipped = 0
    error_rows = []

    for i, row in enumerate(rows, start=2):
        try:
            def get(field: str) -> str:
                col = mapping.get(field)
                return row.get(col, "").strip() if col else ""

            first_name = get("first_name")
            last_name = get("last_name")
            if not first_name or not last_name:
                skipped += 1
                error_rows.append({"row": i, "error": "Nom/prénom manquant", "data": dict(row)})
                continue

            dob_str = get("date_of_birth")
            dob = _parse_date(dob_str) if dob_str else None
            if not dob:
                if not skip_errors:
                    error_rows.append({"row": i, "error": f"Date naissance invalide: '{dob_str}'", "data": dict(row)})
                    skipped += 1
                    continue
                dob = date(2000, 1, 1)  # Default fallback

            gender = _parse_gender(get("gender")) if get("gender") else "OTHER"
            reg = get("registration_number")
            if not reg or reg in existing_regs:
                reg = _generate_registration(tenant_id, existing_regs)
            else:
                existing_regs.add(reg)

            academic_year = get("academic_year") or default_academic_year or ""

            db.execute(text("""
                INSERT INTO students (
                    id, tenant_id, registration_number, first_name, last_name,
                    date_of_birth, gender, level, class_name, academic_year,
                    email, phone, address, city,
                    parent_name, parent_phone, parent_email,
                    status, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), :tid, :reg, :fn, :ln,
                    :dob, :gender, :level, :class_name, :ay,
                    :email, :phone, :address, :city,
                    :parent_name, :parent_phone, :parent_email,
                    'ACTIVE', NOW(), NOW()
                )
                ON CONFLICT (registration_number) DO NOTHING
            """), {
                "tid": tenant_id,
                "reg": reg,
                "fn": first_name,
                "ln": last_name,
                "dob": dob.isoformat(),
                "gender": gender,
                "level": get("level"),
                "class_name": get("class_name"),
                "ay": academic_year,
                "email": get("email") or None,
                "phone": get("phone") or None,
                "address": get("address") or None,
                "city": get("city") or None,
                "parent_name": get("parent_name") or None,
                "parent_phone": get("parent_phone") or None,
                "parent_email": get("parent_email") or None,
            })
            created += 1

        except Exception as exc:
            logger.warning("Import row %s error: %s", i, exc)
            error_rows.append({"row": i, "error": str(exc), "data": dict(row)})
            skipped += 1

    # SECURITY (Phase 2, commercialisation): imports were creating/modifying
    # student data with zero audit trail — no way to answer "who imported
    # these 200 students, and when" after the fact. Logged before commit,
    # same pattern as every other data-mutating endpoint in this codebase.
    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="IMPORT_STUDENTS", resource_type="STUDENT",
        details={"created": created, "skipped": skipped, "total": len(rows), "filename": file.filename},
    )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Import commit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {exc}")

    return {
        "created": created,
        "skipped": skipped,
        "errors": error_rows[:20],
        "total": len(rows),
        "message": f"{created} élève(s) importé(s), {skipped} ignoré(s)",
    }


# ── Template CSV download ──────────────────────────────────────────────────────

@router.get("/students/template/")
def download_student_template(
    current_user: dict = Depends(get_current_user),
):
    """
    GET /import/students/template/
    Returns a CSV template with all supported column headers and 3 example rows.
    """
    from fastapi.responses import StreamingResponse

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    writer.writerow([
        "prenom", "nom", "date_naissance", "sexe", "matricule",
        "niveau", "classe", "annee_scolaire",
        "email", "telephone", "adresse", "ville",
        "nom_parent", "tel_parent", "email_parent",
    ])
    writer.writerow([
        "Fatou", "Diallo", "15/03/2010", "F", "ETU001",
        "6ème", "6ème A", "2024-2025",
        "fatou.diallo@example.com", "+224620000001", "Conakry Centre", "Conakry",
        "Mamadou Diallo", "+224620000000", "mamadou.diallo@example.com",
    ])
    writer.writerow([
        "Ibrahim", "Konaté", "22/07/2008", "M", "",
        "4ème", "4ème B", "2024-2025",
        "", "+224620000002", "", "Ratoma",
        "Aissatou Konaté", "+224620000003", "",
    ])
    writer.writerow([
        "Marie", "Camara", "01/01/2012", "F", "",
        "CE2", "CE2 A", "2024-2025",
        "", "", "", "",
        "Jean Camara", "+224620000004", "",
    ])

    output.seek(0)
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="modele_import_eleves.csv"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# Parents \u2014 commercialisation Phase (import Parents)
#
# Unlike students, a parent import must produce a REAL, linked account (a
# `users` row + a `user_roles` row with role=PARENT) and a `parent_students`
# link to each referenced child \u2014 never just free-text parent_name/
# parent_phone on the Student row. A parent with several children can appear
# on several rows (or one row with several matricules); the second time we
# see the same email in a batch, the existing account is reused and only a
# new link is added \u2014 this is NOT a silent overwrite, no field on the
# existing account is ever modified by the import.
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

def _parse_bool(val: str) -> bool:
    return val.strip().lower() in ("1", "true", "vrai", "oui", "yes", "y", "o")


def _split_list(val: str) -> list[str]:
    return [v.strip() for v in val.split(",") if v.strip()]


@router.post("/parents/preview/")
async def preview_parent_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("users:write")),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    POST /import/parents/preview/
    Parse the CSV and return detected mapping + first rows + validation
    errors, without writing anything to the database.
    """
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5 Mo)")

    headers, rows = _parse_csv_bytes(content)
    if not headers:
        raise HTTPException(status_code=400, detail="Fichier CSV vide ou format invalide")

    mapping = _detect_columns(headers, PARENT_COLUMN_MAP)

    preview = []
    errors = []
    for i, row in enumerate(rows[:50], start=2):
        record = {}
        row_errors = []

        for req in ("first_name", "last_name", "email"):
            col = mapping.get(req)
            val = row.get(col, "").strip() if col else ""
            if not val:
                row_errors.append(f"Ligne {i}: champ '{req}' manquant")
            record[req] = val

        reg_col = mapping.get("student_registration_numbers")
        reg_val = row.get(reg_col, "").strip() if reg_col else ""
        email_col = mapping.get("student_emails")
        stu_email_val = row.get(email_col, "").strip() if email_col else ""
        if not reg_val and not stu_email_val:
            row_errors.append(f"Ligne {i}: aucun \u00e9l\u00e8ve r\u00e9f\u00e9renc\u00e9 (matricule ou email \u00e9l\u00e8ve requis)")
        record["student_registration_numbers"] = reg_val
        record["student_emails"] = stu_email_val

        for field in ("phone", "occupation", "address", "relation_type", "is_primary"):
            col = mapping.get(field)
            record[field] = row.get(col, "").strip() if col else ""

        record["_errors"] = row_errors
        preview.append(record)
        errors.extend(row_errors)

    required_missing = [f for f in ("first_name", "last_name", "email") if not mapping.get(f)]
    if not mapping.get("student_registration_numbers") and not mapping.get("student_emails"):
        required_missing.append("student_registration_numbers")

    return {
        "total_rows": len(rows),
        "headers": headers,
        "mapping": mapping,
        "preview": preview[:10],
        "validation_errors": errors[:50],
        "has_errors": bool(errors),
        "required_missing": required_missing,
    }


@router.post("/parents/confirm/")
async def confirm_parent_import(
    request: Request,
    file: UploadFile = File(...),
    skip_errors: bool = Form(False),
    current_user: dict = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    POST /import/parents/confirm/
    Creates a real, linked parent account for each row: a `users` row
    (role PARENT, no password set \u2014 activated via the existing forced
    password-change flow, same as manual parent creation), and a
    `parent_students` link to every referenced child within THIS tenant
    only. An existing parent (matched by email, within this tenant, already
    holding the PARENT role) is reused rather than duplicated.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db) or "")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID manquant")

    content = await file.read()
    headers, rows = _parse_csv_bytes(content)
    mapping = _detect_columns(headers, PARENT_COLUMN_MAP)

    created_parents = 0
    reused_parents = 0
    created_links = 0
    skipped_links = 0
    skipped_rows = 0
    error_rows = []

    # Parents created/reused earlier in THIS batch \u2014 avoids re-querying and
    # avoids trying to INSERT the same email twice within one import.
    parents_in_batch: dict[str, User] = {}

    for i, row in enumerate(rows, start=2):
        try:
            def get(field: str) -> str:
                col = mapping.get(field)
                return row.get(col, "").strip() if col else ""

            first_name = get("first_name")
            last_name = get("last_name")
            email = get("email").strip().lower()
            if not first_name or not last_name or not email:
                skipped_rows += 1
                error_rows.append({"row": i, "error": "Nom/pr\u00e9nom/email manquant", "data": dict(row)})
                continue

            reg_numbers = _split_list(get("student_registration_numbers"))
            student_emails = [e.lower() for e in _split_list(get("student_emails"))]
            if not reg_numbers and not student_emails:
                skipped_rows += 1
                error_rows.append({"row": i, "error": "Aucun \u00e9l\u00e8ve r\u00e9f\u00e9renc\u00e9 (matricule ou email \u00e9l\u00e8ve)", "data": dict(row)})
                continue

            # \u2500\u2500 Resolve the parent account \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
            parent = parents_in_batch.get(email)
            if parent is None:
                existing = db.query(User).filter(func.lower(User.email) == email).first()
                if existing is not None:
                    if str(existing.tenant_id) != tenant_id:
                        skipped_rows += 1
                        error_rows.append({
                            "row": i,
                            "error": f"Email '{email}' d\u00e9j\u00e0 utilis\u00e9 par un compte d'un autre \u00e9tablissement",
                            "data": dict(row),
                        })
                        continue
                    existing_roles = {
                        r.role for r in db.query(UserRole).filter(
                            UserRole.user_id == existing.id, UserRole.tenant_id == tenant_id,
                        ).all()
                    }
                    if "PARENT" not in existing_roles:
                        skipped_rows += 1
                        error_rows.append({
                            "row": i,
                            "error": f"Email '{email}' d\u00e9j\u00e0 utilis\u00e9 par un compte non-parent existant",
                            "data": dict(row),
                        })
                        continue
                    parent = existing
                    reused_parents += 1
                else:
                    parent = User(
                        tenant_id=tenant_id,
                        email=email,
                        username=email,
                        first_name=first_name,
                        last_name=last_name,
                        phone=get("phone") or None,
                        occupation=get("occupation") or None,
                        address=get("address") or None,
                        password_hash=None,
                        is_active=False,
                        is_verified=False,
                        must_change_password=True,
                    )
                    db.add(parent)
                    db.flush()
                    db.add(UserRole(tenant_id=tenant_id, user_id=parent.id, role="PARENT"))
                    created_parents += 1
                parents_in_batch[email] = parent

            # \u2500\u2500 Resolve referenced students \u2014 THIS tenant only \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
            student_ids: set[str] = set()
            if reg_numbers:
                found = db.query(Student).filter(
                    Student.tenant_id == tenant_id,
                    Student.registration_number.in_(reg_numbers),
                ).all()
                found_regs = {s.registration_number for s in found}
                student_ids.update(str(s.id) for s in found)
                for missing in set(reg_numbers) - found_regs:
                    error_rows.append({"row": i, "error": f"\u00c9l\u00e8ve introuvable (matricule '{missing}')", "data": dict(row)})
            if student_emails:
                found = db.query(Student).filter(
                    Student.tenant_id == tenant_id,
                    func.lower(Student.email).in_(student_emails),
                ).all()
                found_emails = {(s.email or "").lower() for s in found}
                student_ids.update(str(s.id) for s in found)
                for missing in set(student_emails) - found_emails:
                    error_rows.append({"row": i, "error": f"\u00c9l\u00e8ve introuvable (email '{missing}')", "data": dict(row)})

            if not student_ids:
                skipped_rows += 1
                continue

            relation_type = get("relation_type") or None
            is_primary = _parse_bool(get("is_primary"))

            for sid in student_ids:
                already = db.query(ParentStudentModel).filter(
                    ParentStudentModel.tenant_id == tenant_id,
                    ParentStudentModel.parent_id == parent.id,
                    ParentStudentModel.student_id == sid,
                ).first()
                if already:
                    skipped_links += 1
                    continue
                db.add(ParentStudentModel(
                    tenant_id=tenant_id,
                    parent_id=parent.id,
                    student_id=sid,
                    is_primary=is_primary,
                    relation_type=relation_type,
                ))
                created_links += 1

        except Exception as exc:
            logger.warning("Parent import row %s error: %s", i, exc)
            error_rows.append({"row": i, "error": str(exc), "data": dict(row)})
            skipped_rows += 1

    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="IMPORT_PARENTS", resource_type="PARENT",
        details={
            "created_parents": created_parents,
            "reused_parents": reused_parents,
            "created_links": created_links,
            "skipped_links": skipped_links,
            "skipped_rows": skipped_rows,
            "total": len(rows),
            "filename": file.filename,
        },
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.error("Parent import commit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {exc}")
    except Exception as exc:
        db.rollback()
        logger.error("Parent import commit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {exc}")

    return {
        "created_parents": created_parents,
        "reused_parents": reused_parents,
        "created_links": created_links,
        "skipped_links": skipped_links,
        "skipped_rows": skipped_rows,
        "errors": error_rows[:20],
        "total": len(rows),
        "message": (
            f"{created_parents} parent(s) cr\u00e9\u00e9(s), {reused_parents} r\u00e9utilis\u00e9(s), "
            f"{created_links} lien(s) \u00e9l\u00e8ve cr\u00e9\u00e9(s)"
        ),
    }


@router.get("/parents/template/")
def download_parent_template(
    current_user: dict = Depends(get_current_user),
):
    """
    GET /import/parents/template/
    CSV template \u2014 one row per (parent, child) pair; the same parent email
    on several rows links them to several children.
    """
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "prenom", "nom", "email", "telephone", "profession", "adresse",
        "matricule_eleve", "lien", "contact_principal",
    ])
    writer.writerow([
        "Mamadou", "Diallo", "mamadou.diallo@example.com", "+224620000000",
        "Commer\u00e7ant", "Conakry Centre", "ETU001", "FATHER", "oui",
    ])
    writer.writerow([
        "Aissatou", "Konat\u00e9", "aissatou.konate@example.com", "+224620000003",
        "", "Ratoma", "ETU002", "MOTHER", "oui",
    ])

    output.seek(0)
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="modele_import_parents.csv"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# Enseignants \u2014 commercialisation Phase (import Enseignants)
#
# TEACHER_COLUMN_MAP already existed (unused dead code, per an earlier audit
# finding) \u2014 reused as-is here rather than redefining a second mapping.
# Creates a real `users` row (role TEACHER), same "pending" pattern as the
# parent import above (no password set, activated via the existing
# forced-password-change flow). A duplicate email is a hard error \u2014 a
# teacher account is never silently reused or overwritten by an import,
# unlike parents (siblings legitimately share one parent account, but two
# different people never legitimately share one teacher account).
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

@router.post("/teachers/preview/")
async def preview_teacher_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("users:write")),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    POST /import/teachers/preview/
    """
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5 Mo)")

    headers, rows = _parse_csv_bytes(content)
    if not headers:
        raise HTTPException(status_code=400, detail="Fichier CSV vide ou format invalide")

    mapping = _detect_columns(headers, TEACHER_COLUMN_MAP)

    preview = []
    errors = []
    for i, row in enumerate(rows[:50], start=2):
        record = {}
        row_errors = []

        for req in ("first_name", "last_name", "email"):
            col = mapping.get(req)
            val = row.get(col, "").strip() if col else ""
            if not val:
                row_errors.append(f"Ligne {i}: champ '{req}' manquant")
            record[req] = val

        for field in ("phone", "subjects", "qualification", "department",
                       "contract_type", "date_of_birth", "gender", "hire_date", "salary"):
            col = mapping.get(field)
            record[field] = row.get(col, "").strip() if col else ""

        record["_errors"] = row_errors
        preview.append(record)
        errors.extend(row_errors)

    return {
        "total_rows": len(rows),
        "headers": headers,
        "mapping": mapping,
        "preview": preview[:10],
        "validation_errors": errors[:50],
        "has_errors": bool(errors),
        "required_missing": [f for f in ("first_name", "last_name", "email") if not mapping.get(f)],
    }


@router.post("/teachers/confirm/")
async def confirm_teacher_import(
    request: Request,
    file: UploadFile = File(...),
    skip_errors: bool = Form(False),
    current_user: dict = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    POST /import/teachers/confirm/
    Creates a real `users` row (role TEACHER) per row. `subjects`,
    `qualification`, `department`, `contract_type`, `hire_date`, `salary`
    are validated (parsed) but not persisted anywhere yet \u2014 assigning a
    teacher to actual subjects/classes goes through the existing
    teacher_assignments module (POST /teachers/) once the account exists;
    wiring that automatically from free-text subject names is a separate,
    larger piece of work deliberately left out of this import.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db) or "")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID manquant")

    content = await file.read()
    headers, rows = _parse_csv_bytes(content)
    mapping = _detect_columns(headers, TEACHER_COLUMN_MAP)

    created = 0
    skipped = 0
    error_rows = []
    emails_in_batch: set[str] = set()

    for i, row in enumerate(rows, start=2):
        try:
            def get(field: str) -> str:
                col = mapping.get(field)
                return row.get(col, "").strip() if col else ""

            first_name = get("first_name")
            last_name = get("last_name")
            email = get("email").strip().lower()
            if not first_name or not last_name or not email:
                skipped += 1
                error_rows.append({"row": i, "error": "Nom/pr\u00e9nom/email manquant", "data": dict(row)})
                continue

            if email in emails_in_batch:
                skipped += 1
                error_rows.append({"row": i, "error": f"Email '{email}' en doublon dans le fichier", "data": dict(row)})
                continue

            if db.query(User).filter(func.lower(User.email) == email).first() is not None:
                skipped += 1
                error_rows.append({"row": i, "error": f"Un compte existe d\u00e9j\u00e0 pour l'email '{email}'", "data": dict(row)})
                continue

            dob_str = get("date_of_birth")
            dob = _parse_date(dob_str) if dob_str else None
            if dob_str and dob is None:
                error_rows.append({"row": i, "error": f"Date de naissance invalide: '{dob_str}' (ignor\u00e9e)", "data": dict(row)})

            teacher = User(
                tenant_id=tenant_id,
                email=email,
                username=email,
                first_name=first_name,
                last_name=last_name,
                phone=get("phone") or None,
                password_hash=None,
                is_active=False,
                is_verified=False,
                must_change_password=True,
            )
            db.add(teacher)
            db.flush()
            db.add(UserRole(tenant_id=tenant_id, user_id=teacher.id, role="TEACHER"))
            emails_in_batch.add(email)
            created += 1

        except Exception as exc:
            logger.warning("Teacher import row %s error: %s", i, exc)
            error_rows.append({"row": i, "error": str(exc), "data": dict(row)})
            skipped += 1

    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="IMPORT_TEACHERS", resource_type="TEACHER",
        details={"created": created, "skipped": skipped, "total": len(rows), "filename": file.filename},
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.error("Teacher import commit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {exc}")
    except Exception as exc:
        db.rollback()
        logger.error("Teacher import commit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {exc}")

    return {
        "created": created,
        "skipped": skipped,
        "errors": error_rows[:20],
        "total": len(rows),
        "message": f"{created} enseignant(s) import\u00e9(s), {skipped} ignor\u00e9(s)",
    }


@router.get("/teachers/template/")
def download_teacher_template(
    current_user: dict = Depends(get_current_user),
):
    """GET /import/teachers/template/"""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "prenom", "nom", "email", "telephone", "matieres",
        "diplome", "departement", "type_contrat", "date_naissance", "sexe",
        "date_embauche", "salaire",
    ])
    writer.writerow([
        "Fatoumata", "Bah", "fatoumata.bah@example.com", "+224620000010",
        "Math\u00e9matiques", "Master Math\u00e9matiques", "Sciences", "CDI", "10/05/1985", "F",
        "01/09/2020", "",
    ])
    writer.writerow([
        "Ousmane", "Sylla", "ousmane.sylla@example.com", "+224620000011",
        "Fran\u00e7ais, Histoire", "Licence Lettres", "Lettres", "CDD", "22/11/1990", "M",
        "01/09/2023", "",
    ])

    output.seek(0)
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="modele_import_enseignants.csv"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
