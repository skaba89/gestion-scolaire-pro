"""Shared CSV-parsing and row-writing logic for the parent bulk import.

Extracted out of app/api/v1/endpoints/core/imports.py (national-readiness
audit, 2026-09 — extending the async-import "polling" pattern from students,
see docs/ASYNC_JOBS_GUIDE.md, to parents) so the exact same import logic can
run either synchronously (Redis down, or a caller that doesn't need async)
or from an Arq worker task (app/workers/tasks.py::import_parents_job) —
never two divergent copies of "how a row becomes a parent account + links".
"""
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.parent_student import ParentStudent as ParentStudentModel
from app.models.student import Student
from app.models.user import User
from app.models.user_role import UserRole
from app.services.student_import import detect_columns

logger = logging.getLogger(__name__)

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


def parse_bool(val: str) -> bool:
    return val.strip().lower() in ("1", "true", "vrai", "oui", "yes", "y", "o")


def split_list(val: str) -> list[str]:
    return [v.strip() for v in val.split(",") if v.strip()]


def run_parent_import(
    db: Session,
    tenant_id: str,
    headers: list[str],
    rows: list[dict],
    *,
    skip_errors: bool,
) -> dict:
    """Create/reuse a parent account per row and link it to the referenced
    student(s). Returns {created_parents, reused_parents, created_links,
    skipped_links, skipped_rows, error_rows} — the same shape the endpoint
    has always returned, now shared with the async job path."""
    mapping = detect_columns(headers, PARENT_COLUMN_MAP)

    created_parents = 0
    reused_parents = 0
    created_links = 0
    skipped_links = 0
    skipped_rows = 0
    error_rows = []

    # Parents created/reused earlier in THIS batch — avoids re-querying and
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
                error_rows.append({"row": i, "error": "Nom/prénom/email manquant", "data": dict(row)})
                continue

            reg_numbers = split_list(get("student_registration_numbers"))
            student_emails = [e.lower() for e in split_list(get("student_emails"))]
            if not reg_numbers and not student_emails:
                skipped_rows += 1
                error_rows.append({"row": i, "error": "Aucun élève référencé (matricule ou email élève)", "data": dict(row)})
                continue

            # ── Resolve the parent account ──────────────────────────────
            parent = parents_in_batch.get(email)
            if parent is None:
                existing = db.query(User).filter(func.lower(User.email) == email).first()
                if existing is not None:
                    if str(existing.tenant_id) != tenant_id:
                        skipped_rows += 1
                        error_rows.append({
                            "row": i,
                            "error": f"Email '{email}' déjà utilisé par un compte d'un autre établissement",
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
                            "error": f"Email '{email}' déjà utilisé par un compte non-parent existant",
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

            # ── Resolve referenced students — THIS tenant only ──────────
            student_ids: set[str] = set()
            if reg_numbers:
                found = db.query(Student).filter(
                    Student.tenant_id == tenant_id,
                    Student.registration_number.in_(reg_numbers),
                ).all()
                found_regs = {s.registration_number for s in found}
                student_ids.update(str(s.id) for s in found)
                for missing in set(reg_numbers) - found_regs:
                    error_rows.append({"row": i, "error": f"Élève introuvable (matricule '{missing}')", "data": dict(row)})
            if student_emails:
                found = db.query(Student).filter(
                    Student.tenant_id == tenant_id,
                    func.lower(Student.email).in_(student_emails),
                ).all()
                found_emails = {(s.email or "").lower() for s in found}
                student_ids.update(str(s.id) for s in found)
                for missing in set(student_emails) - found_emails:
                    error_rows.append({"row": i, "error": f"Élève introuvable (email '{missing}')", "data": dict(row)})

            if not student_ids:
                skipped_rows += 1
                continue

            relation_type = get("relation_type") or None
            is_primary = parse_bool(get("is_primary"))

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

    return {
        "created_parents": created_parents,
        "reused_parents": reused_parents,
        "created_links": created_links,
        "skipped_links": skipped_links,
        "skipped_rows": skipped_rows,
        "error_rows": error_rows,
    }
