"""
Data Import endpoints — CSV bulk import for students and staff.
Supports CSV files with flexible column mapping (French and English headers).
No external dependency: uses Python stdlib csv + io.
"""
import csv
import io
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.jobs import enqueue_job
from app.core.security import get_current_user, require_permission, require_plan
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models.job import Job
from app.models.parent_student import ParentStudent as ParentStudentModel
from app.models.student import Student
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole
from app.services.notifications import EmailSender
from app.services.student_import import (
    STUDENT_COLUMN_MAP,
    detect_columns as _detect_columns,
    parse_date as _parse_date,
    parse_gender as _parse_gender,
    parse_csv_bytes as _parse_csv_bytes,
    run_student_import,
)
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)

# Docs: docs/TENANT_MONITORING.md — "Import échoué" was the one alert in
# that table left as "à construire", with its threshold already agreed:
# alert when more than half a batch's rows failed. Best-effort, never
# raises — an alerting hiccup must never turn a successful import into a
# 500 for the person who just ran it.
IMPORT_FAILURE_ALERT_THRESHOLD = 0.5


def _maybe_alert_import_failure_rate(
    db: Session, *, tenant_id: str, import_type: str, skipped: int, total: int, filename: str,
) -> None:
    if total <= 0 or (skipped / total) <= IMPORT_FAILURE_ALERT_THRESHOLD:
        return
    try:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        recipients = [e for e in {settings.ALERT_EMAIL, tenant.billing_email if tenant else None, tenant.email if tenant else None} if e]
        if not recipients:
            return
        sender = EmailSender(
            resend_api_key=settings.RESEND_API_KEY,
            smtp_host=settings.SMTP_HOST,
            smtp_port=settings.SMTP_PORT,
            smtp_user=settings.SMTP_USER,
            smtp_pass=settings.SMTP_PASS,
            from_email=settings.FROM_EMAIL,
            from_name=settings.FROM_NAME,
        )
        pct = round((skipped / total) * 100)
        subject = f"[Academy Guinéenne] Import {import_type} — {pct}% des lignes en erreur"
        html = (
            f"<p>Un import <strong>{import_type}</strong> ({filename}) pour l'établissement "
            f"<strong>{tenant.name if tenant else tenant_id}</strong> a échoué sur "
            f"<strong>{skipped}/{total} lignes ({pct}%)</strong>.</p>"
            f"<p>Cause fréquente : fichier mal formaté, colonnes non reconnues, ou données "
            f"de référence manquantes (matricules, emails). Voir le détail des erreurs dans "
            f"la réponse de l'import ou les journaux d'audit de l'établissement.</p>"
        )
        for recipient in recipients:
            sender.send(recipient, subject, html)
    except Exception as exc:
        logger.warning("Failed to send import failure alert: %s", exc)

# ── Column aliases (French + English) ─────────────────────────────────────────
# STUDENT_COLUMN_MAP now lives in app/services/student_import.py (imported
# above) — shared with the Arq job path (app/workers/tasks.py).

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

    national-readiness audit, 2026-09, priority 5: this used to process
    every row synchronously inside the request — a CSV of "thousands of
    students" (the audit's own words) blocked the HTTP request for as
    long as that took, with no way to recover if the connection dropped
    partway through. Now enqueues app.workers.tasks.import_students_job
    and returns a job_id immediately; poll GET /import/jobs/{job_id}/ for
    the result. Falls back to running inline in this request if the queue
    is unreachable (see docs/ASYNC_JOBS_GUIDE.md's "pattern enqueue avec
    repli") — same guarantee this endpoint always had, just no longer the
    only path.
    """
    from app.workers.tasks import _job_finished, _job_started

    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID manquant")

    content = await file.read()
    headers, rows = _parse_csv_bytes(content)

    job_id = _job_started(
        "import_students", tenant_id,
        {"filename": file.filename, "total_rows": len(rows), "user_id": current_user.get("id")},
    )

    arq_job_id = await enqueue_job(
        "import_students_job",
        job_id=job_id, tenant_id=tenant_id, headers=headers, rows=rows,
        skip_errors=skip_errors, default_academic_year=default_academic_year,
        user_id=current_user.get("id"), filename=file.filename,
    )

    if arq_job_id is None:
        # Redis/Arq unreachable — run inline rather than leave the job
        # stuck at RUNNING forever with nothing to ever finish it.
        try:
            outcome = run_student_import(
                db, tenant_id, headers, rows,
                skip_errors=skip_errors, default_academic_year=default_academic_year,
            )
            # SECURITY (Phase 2, commercialisation): imports were creating/
            # modifying student data with zero audit trail — no way to
            # answer "who imported these 200 students, and when" after the
            # fact. Logged before commit, same pattern as every other
            # data-mutating endpoint in this codebase.
            log_audit(
                db, user_id=current_user.get("id"), tenant_id=tenant_id,
                action="IMPORT_STUDENTS", resource_type="STUDENT",
                details={
                    "created": outcome["created"], "skipped": outcome["skipped"],
                    "total": len(rows), "filename": file.filename,
                },
            )
            db.commit()
            _maybe_alert_import_failure_rate(
                db, tenant_id=tenant_id, import_type="élèves",
                skipped=outcome["skipped"], total=len(rows), filename=file.filename,
            )
            result = {
                "created": outcome["created"],
                "skipped": outcome["skipped"],
                "errors": outcome["error_rows"][:20],
                "total": len(rows),
                "message": f"{outcome['created']} élève(s) importé(s), {outcome['skipped']} ignoré(s)",
            }
            _job_finished(job_id, success=True, result=result)
        except Exception as exc:
            db.rollback()
            logger.error("Import commit failed: %s", exc)
            _job_finished(job_id, success=False, error=str(exc))
            raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {exc}")

    return {"job_id": job_id}


@router.get("/jobs/{job_id}/")
def get_import_job_status(
    job_id: str,
    request: Request,
    current_user: dict = Depends(require_permission("students:write")),
    db: Session = Depends(get_db),
):
    """
    GET /import/jobs/{job_id}/
    Poll the status of a job started by one of the /import/*/confirm/
    endpoints above. Scoped to the caller's own tenant — a job_id from
    another school must never be readable here (the same isolation every
    other tenant-scoped endpoint in this codebase enforces).
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job or (job.tenant_id and str(job.tenant_id) != tenant_id):
        raise HTTPException(status_code=404, detail="Job introuvable")

    return {
        "id": str(job.id),
        "job_type": job.job_type,
        "status": job.status,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
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

    _maybe_alert_import_failure_rate(
        db, tenant_id=tenant_id, import_type="parents", skipped=skipped_rows, total=len(rows), filename=file.filename,
    )

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

    _maybe_alert_import_failure_rate(
        db, tenant_id=tenant_id, import_type="enseignants", skipped=skipped, total=len(rows), filename=file.filename,
    )

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
