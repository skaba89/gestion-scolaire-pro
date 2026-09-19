"""Shared CSV-parsing and row-writing logic for the teacher bulk import.

Extracted out of app/api/v1/endpoints/core/imports.py (national-readiness
audit, 2026-09 — extending the async-import "polling" pattern from students,
see docs/ASYNC_JOBS_GUIDE.md, to teachers) so the exact same import logic
can run either synchronously (Redis down) or from an Arq worker task
(app/workers/tasks.py::import_teachers_job).
"""
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_role import UserRole
from app.services.student_import import detect_columns, parse_date

logger = logging.getLogger(__name__)

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


def run_teacher_import(
    db: Session,
    tenant_id: str,
    headers: list[str],
    rows: list[dict],
    *,
    skip_errors: bool,
) -> dict:
    """Create a `users` row (role TEACHER) per row. `subjects`,
    `qualification`, `department`, `contract_type`, `hire_date`, `salary`
    are validated (parsed) but not persisted — see confirm_teacher_import's
    docstring for why. Returns {created, skipped, error_rows} — the same
    shape the endpoint has always returned, now shared with the async job
    path."""
    mapping = detect_columns(headers, TEACHER_COLUMN_MAP)

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
                error_rows.append({"row": i, "error": "Nom/prénom/email manquant", "data": dict(row)})
                continue

            if email in emails_in_batch:
                skipped += 1
                error_rows.append({"row": i, "error": f"Email '{email}' en doublon dans le fichier", "data": dict(row)})
                continue

            if db.query(User).filter(func.lower(User.email) == email).first() is not None:
                skipped += 1
                error_rows.append({"row": i, "error": f"Un compte existe déjà pour l'email '{email}'", "data": dict(row)})
                continue

            dob_str = get("date_of_birth")
            dob = parse_date(dob_str) if dob_str else None
            if dob_str and dob is None:
                error_rows.append({"row": i, "error": f"Date de naissance invalide: '{dob_str}' (ignorée)", "data": dict(row)})

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

    return {"created": created, "skipped": skipped, "error_rows": error_rows}
