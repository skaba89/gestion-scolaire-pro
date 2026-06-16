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
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_permission, require_plan

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

    tenant_id = str(current_user.get("tenant_id"))
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
