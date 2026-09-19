"""Shared CSV-parsing and row-writing logic for the student bulk import.

Extracted out of app/api/v1/endpoints/core/imports.py (national-readiness
audit, 2026-09, priority 5 — "finish migrating BackgroundTasks to Arq")
so the exact same import logic can run either synchronously (Redis down,
or a caller that doesn't need async) or from an Arq worker task
(app/workers/tasks.py::import_students_job) — never two divergent copies
of "how a row becomes a Student row".
"""
import csv
import io
import random
import string
from datetime import datetime, date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

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


def detect_columns(headers: list[str], column_map: dict) -> dict[str, Optional[str]]:
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


def parse_date(val: str) -> Optional[date]:
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def parse_gender(val: str) -> str:
    v = val.strip().upper()
    if v in ("M", "MALE", "MASCULIN", "H", "HOMME", "GARCON", "GARÇON"):
        return "MALE"
    if v in ("F", "FEMALE", "FEMININ", "FÉMININ", "FEMME", "FILLE"):
        return "FEMALE"
    return "OTHER"


def generate_registration(existing: set) -> str:
    prefix = "ETU"
    while True:
        suffix = "".join(random.choices(string.digits, k=6))
        reg = f"{prefix}{suffix}"
        if reg not in existing:
            existing.add(reg)
            return reg


def parse_csv_bytes(content: bytes) -> tuple[list[str], list[dict]]:
    """Auto-detect delimiter (;  or ,) and return (headers, rows)."""
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Fallback: try latin-1 (common for Excel exports from Windows)
        try:
            decoded = content.decode("latin-1")
        except UnicodeDecodeError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Encodage du fichier non supporté. Veuillez utiliser UTF-8 ou Latin-1. Détail : {exc}",
            )
    sample = decoded[:2048]
    semicolons = sample.count(";")
    commas = sample.count(",")
    delim = ";" if semicolons > commas else ","
    reader = csv.DictReader(io.StringIO(decoded), delimiter=delim)
    headers = reader.fieldnames or []
    rows = [dict(r) for r in reader]
    return list(headers), rows


def run_student_import(
    db: Session,
    tenant_id: str,
    headers: list[str],
    rows: list[dict],
    *,
    skip_errors: bool,
    default_academic_year: str,
) -> dict:
    """Write every row to the students table. Returns
    {created, skipped, error_rows} — the same shape the endpoint has
    always returned, now shared with the async job path."""
    mapping = detect_columns(headers, STUDENT_COLUMN_MAP)

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
            dob = parse_date(dob_str) if dob_str else None
            if not dob:
                if not skip_errors:
                    error_rows.append({"row": i, "error": f"Date naissance invalide: '{dob_str}'", "data": dict(row)})
                    skipped += 1
                    continue
                dob = date(2000, 1, 1)  # Default fallback

            gender = parse_gender(get("gender")) if get("gender") else "OTHER"
            reg = get("registration_number")
            if not reg or reg in existing_regs:
                reg = generate_registration(existing_regs)
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
            error_rows.append({"row": i, "error": str(exc), "data": dict(row)})
            skipped += 1

    return {"created": created, "skipped": skipped, "error_rows": error_rows}
