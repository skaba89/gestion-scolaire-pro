"""
Admissions module — workflow complet:
  DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTED → CONVERTED_TO_STUDENT
                                    ↘ REJECTED
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from pydantic import BaseModel
from datetime import date, datetime
import json
from slowapi import Limiter
from slowapi.util import get_remote_address
import uuid

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.core.storage import storage_client
from app.models.base import GUID
from app.models.audit_log import AuditLog
from app.models.user import User
from app.utils.audit import log_audit
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# ─── State machine ────────────────────────────────────────────────────────────

VALID_TRANSITIONS: dict = {
    "DRAFT":                ["SUBMITTED"],
    "SUBMITTED":            ["UNDER_REVIEW", "REJECTED"],
    "UNDER_REVIEW":         ["ACCEPTED", "REJECTED"],
    "ACCEPTED":             ["CONVERTED_TO_STUDENT"],
    "REJECTED":             [],
    "CONVERTED_TO_STUDENT": [],
}


# ─── Timeline / suivi de candidature ───────────────────────────────────────────
#
# Signalé par un utilisateur : le candidat (ou son parent) doit pouvoir suivre
# l'évolution de son dossier étape par étape, pas seulement voir le statut
# actuel — et l'admin doit traiter le dossier étape par étape (déjà le cas
# côté état de la machine ci-dessus/AdmissionTable.tsx, mais sans vue
# d'ensemble de l'historique). Les transitions sont déjà journalisées via
# log_audit() (transition_status/convert_to_student) — cette section
# reconstruit une timeline lisible à partir de audit_logs, plutôt que
# d'ajouter une nouvelle table dédiée.

ADMISSION_STEP_SEQUENCE = ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "CONVERTED_TO_STUDENT"]


def _status_from_audit_action(action: str) -> Optional[str]:
    """Retrouve le statut atteint par une entrée audit_logs d'admission.

    convert_to_student() journalise ADMISSION_CONVERTED (pas
    ADMISSION_CONVERTED_TO_STUDENT) — cas particulier. transition_status()
    journalise toujours ADMISSION_{new_status} littéralement.
    """
    if action == "ADMISSION_CONVERTED":
        return "CONVERTED_TO_STUDENT"
    if action and action.startswith("ADMISSION_"):
        suffix = action[len("ADMISSION_"):]
        if suffix in ADMISSION_STEP_SEQUENCE or suffix == "REJECTED":
            return suffix
    return None


def _iso(value) -> Optional[str]:
    """BUG RÉEL trouvé en testant : un SELECT text() brut renvoie les
    colonnes DateTime en tant que chaîne déjà formatée sur SQLite, mais en
    objet datetime natif sur PostgreSQL (psycopg) — `.isoformat()`
    plantait (AttributeError: 'str' object has no attribute 'isoformat')
    partout où ce module appelait ça sans garde, jamais capté faute de
    test SQLite avant cette fonctionnalité."""
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _admission_type_label(documents_field) -> str:
    """BUG RÉEL trouvé en construisant la timeline : admission_applications
    .documents est polymorphe — une LISTE de fichiers déposés pour une
    nouvelle candidature (public_apply), ou un DICT {"type": "REINSCRIPTION",
    "student_id": ...} pour une réinscription (public_reenroll), jamais les
    deux. `(r["documents"] or {}).get("type", ...)` plantait
    (AttributeError: 'list' object has no attribute 'get') dès qu'un
    candidat ayant déposé des pièces jointes consultait son statut — donc
    quasiment toute nouvelle candidature réelle utilisant l'upload de
    documents (voir AdmissionForm.tsx). Sur SQLite, un SELECT text() brut
    contourne aussi le type JSON de l'ORM et renvoie la chaîne encodée
    telle quelle plutôt qu'un objet déjà parsé."""
    value = documents_field
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            value = None
    if isinstance(value, dict):
        return value.get("type", "CANDIDATURE")
    return "CANDIDATURE"


def _build_admission_steps(current_status: str, reached: dict) -> list:
    """Construit la liste ordonnée des étapes (parcours "heureux"), chacune
    marquée done/current/pending — plus une étape REJECTED distincte quand
    le dossier a été refusé, à la place des étapes qui ne seront jamais
    atteintes."""
    steps = []
    for key in ADMISSION_STEP_SEQUENCE:
        if current_status == "REJECTED" and key in ("ACCEPTED", "CONVERTED_TO_STUDENT"):
            break
        reached_at = reached.get(key)
        if reached_at:
            state = "done"
        elif key == current_status:
            state = "current"
        else:
            state = "pending"
        steps.append({"key": key, "label": STATUS_LABELS.get(key, key), "date": _iso(reached_at), "state": state})
    if current_status == "REJECTED":
        steps.append({
            "key": "REJECTED",
            "label": STATUS_LABELS.get("REJECTED", "Refusé"),
            "date": _iso(reached.get("REJECTED")),
            "state": "rejected",
        })
    return steps


def _admission_events_reached(db: Session, tenant_id: str, admission_id: str, fallback_submitted_at=None) -> tuple:
    """Retourne (reached: {status: datetime}, events: [AuditLog]) — reached
    garde la PREMIÈRE fois que chaque statut a été atteint. SUBMITTED a un
    filet de sécurité sur application.submitted_at/created_at : les
    candidatures déposées avant l'ajout du log_audit() dans public_apply()
    n'ont pas d'entrée audit_logs pour leur toute première étape."""
    events = (
        db.query(AuditLog)
        .filter(
            AuditLog.tenant_id == tenant_id,
            AuditLog.resource_type == "ADMISSION",
            AuditLog.resource_id == str(admission_id),
        )
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    reached: dict = {}
    for e in events:
        status = _status_from_audit_action(e.action)
        if status and status not in reached:
            reached[status] = e.created_at
    if "SUBMITTED" not in reached and fallback_submitted_at:
        reached["SUBMITTED"] = fallback_submitted_at
    return reached, events


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AdmissionCreate(BaseModel):
    student_first_name: str
    student_last_name: str
    student_date_of_birth: Optional[date] = None
    student_gender: Optional[str] = None
    student_address: Optional[str] = None
    student_previous_school: Optional[str] = None
    parent_first_name: str
    parent_last_name: str
    parent_email: str
    parent_phone: str
    parent_address: Optional[str] = None
    parent_occupation: Optional[str] = None
    academic_year_id: Optional[str] = None
    level_id: Optional[str] = None
    notes: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class ConvertPayload(BaseModel):
    registration_number: Optional[str] = None
    class_name: Optional[str] = None


class AdmissionEdit(BaseModel):
    notes: Optional[str] = None
    student_address: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    academic_year_id: Optional[str] = None
    level_id: Optional[str] = None


# ─── Internal helper ──────────────────────────────────────────────────────────

def _refresh_document_urls(application: dict) -> dict:
    """Re-sign each document's storage URL at read time rather than trusting
    the one saved on the row at upload time.

    The admin review UI (AdmissionDetailDialog.tsx) had no document viewer
    at all until this feature — the documents were uploaded and stored
    (see public_upload_document()/public_apply() above) but never surfaced
    anywhere for staff to actually open. MinIO presigned URLs expire after
    7 days (storage.py::MinioStorage.get_presigned_url default) — an
    application reviewed weeks after submission would otherwise show a
    dead link for a document that genuinely exists. Local-storage URLs
    (the current production fallback) are stable and don't need this, but
    re-signing them is a harmless no-op (LocalStorage.get_presigned_url
    just rebuilds the same /uploads/{object_name} path).
    """
    documents = application.get("documents")
    # This is a raw text() SELECT, not an ORM query — SQLAlchemy's JSON
    # type decoder (json.loads on read) only applies to ORM-mapped
    # columns, so on SQLite `documents` comes back as the raw JSON-encoded
    # string, not a parsed list (PostgreSQL's native json/jsonb columns
    # get decoded by the driver either way, so this only bites on SQLite —
    # the exact recurring divergence class from the clubs/surveys ORM
    # migrations earlier this session).
    if isinstance(documents, str):
        try:
            documents = json.loads(documents)
        except (TypeError, ValueError):
            documents = None
        # Normalize the parsed value back onto the row even when we're
        # about to bail below — otherwise a JSON-encoded 'null' string
        # (SQLAlchemy's generic JSON type serializes Python None as the
        # JSON literal "null" rather than SQL NULL by default) would
        # leak out to the frontend as the literal string "null" instead
        # of an empty/absent value.
        application["documents"] = documents
    if not documents or not isinstance(documents, list):
        return application
    refreshed = []
    for doc in documents:
        if isinstance(doc, dict) and doc.get("key"):
            doc = {**doc, "url": storage_client.get_presigned_url(doc["key"])}
        refreshed.append(doc)
    application["documents"] = refreshed
    return application


def _fetch(db: Session, admission_id: str, tenant_id: str) -> dict:
    # bindparam(type_=GUID()) on id/tenant_id: on SQLite the GUID
    # TypeDecorator stores UUIDs dash-less — a plain string bind compares
    # the dashed value the caller has against the dash-less value in the
    # column and silently matches zero rows (works fine on real
    # PostgreSQL, which doesn't have this mismatch — this endpoint had no
    # test coverage before this feature and would 404 every single time
    # under SQLite otherwise).
    stmt = text("""
        SELECT a.*,
               ay.name AS academic_year_name,
               l.name  AS level_name
        FROM   admission_applications a
        LEFT JOIN academic_years ay ON a.academic_year_id = ay.id
        LEFT JOIN levels         l  ON a.level_id         = l.id
        WHERE  a.id = :id AND a.tenant_id = :tenant_id
    """).bindparams(bindparam("id", type_=GUID()), bindparam("tenant_id", type_=GUID()))
    row = db.execute(stmt, {"id": admission_id, "tenant_id": tenant_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    return _refresh_document_urls(dict(row))


# ─── GET / ────────────────────────────────────────────────────────────────────

@router.get("/")
def list_admissions(
    request: Request,
    status: Optional[str] = None,
    academic_year_id: Optional[str] = None,
    level_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    """List admission applications with optional filters."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return {"items": [], "total": 0}
    where = " WHERE a.tenant_id = :tenant_id"
    params: dict = {"tenant_id": tenant_id}
    # UUID-typed params need bindparam(type_=GUID()) below — see _fetch()'s
    # comment. status/search stay plain strings.
    guid_params = ["tenant_id"]
    if status:
        where += " AND a.status = :status"
        params["status"] = status.upper()
    if academic_year_id:
        where += " AND a.academic_year_id = :ay_id"
        params["ay_id"] = academic_year_id
        guid_params.append("ay_id")
    if level_id:
        where += " AND a.level_id = :level_id"
        params["level_id"] = level_id
        guid_params.append("level_id")
    if search:
        where += """ AND (a.student_first_name ILIKE :search OR a.student_last_name ILIKE :search
                   OR a.parent_email ILIKE :search OR a.parent_phone ILIKE :search)"""
        params["search"] = f"%{search}%"

    bindparams = [bindparam(name, type_=GUID()) for name in guid_params]

    # Separate COUNT query for accurate total
    count_stmt = text("SELECT COUNT(*) FROM admission_applications a" + where).bindparams(*bindparams)
    total = db.execute(count_stmt, params).scalar()

    q = """
        SELECT a.*, ay.name AS academic_year_name, l.name AS level_name
        FROM   admission_applications a
        LEFT JOIN academic_years ay ON a.academic_year_id = ay.id
        LEFT JOIN levels         l  ON a.level_id         = l.id
    """ + where + " ORDER BY a.created_at DESC LIMIT :limit OFFSET :offset"
    params.update({"limit": limit, "offset": offset})
    list_stmt = text(q).bindparams(*bindparams)
    rows = db.execute(list_stmt, params).mappings().all()
    return {"items": [_refresh_document_urls(dict(r)) for r in rows], "total": total}


# ─── GET /stats ───────────────────────────────────────────────────────────────

@router.get("/stats/")
def get_stats(
    request: Request,
    academic_year_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    """Counts per status for dashboard cards."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return {
            "DRAFT": 0, "SUBMITTED": 0, "UNDER_REVIEW": 0,
            "ACCEPTED": 0, "REJECTED": 0, "CONVERTED_TO_STUDENT": 0, "total": 0,
        }
    q = "SELECT status, COUNT(*) AS total FROM admission_applications WHERE tenant_id = :tenant_id"
    params: dict = {"tenant_id": tenant_id}
    if academic_year_id:
        q += " AND academic_year_id = :ay_id"
        params["ay_id"] = academic_year_id
    q += " GROUP BY status"
    rows = db.execute(text(q), params).mappings().all()
    counts = {r["status"]: r["total"] for r in rows}
    return {
        "DRAFT":                counts.get("DRAFT", 0),
        "SUBMITTED":            counts.get("SUBMITTED", 0),
        "UNDER_REVIEW":         counts.get("UNDER_REVIEW", 0),
        "ACCEPTED":             counts.get("ACCEPTED", 0),
        "REJECTED":             counts.get("REJECTED", 0),
        "CONVERTED_TO_STUDENT": counts.get("CONVERTED_TO_STUDENT", 0),
        "total":                sum(counts.values()),
    }


# ─── GET /{id} ────────────────────────────────────────────────────────────────

@router.get("/{admission_id}/")
def get_admission(
    request: Request,
    admission_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    return _fetch(db, admission_id, resolve_current_tenant_id(request, current_user, db))


# ─── GET /{id}/timeline — évolution du dossier, vue admin ────────────────────
#
# Signalé par un utilisateur : l'admin doit pouvoir suivre/traiter un
# dossier étape par étape avec une vue d'ensemble de son évolution, pas
# seulement le statut courant (déjà visible dans la table).

@router.get("/{admission_id}/timeline/")
def get_admission_timeline(
    request: Request,
    admission_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    application = _fetch(db, admission_id, tenant_id)  # 404 si absent/mauvais tenant
    reached, events = _admission_events_reached(
        db, tenant_id, admission_id, fallback_submitted_at=application.get("submitted_at") or application.get("created_at"),
    )
    steps = _build_admission_steps(application["status"], reached)

    actor_ids = {e.user_id for e in events if e.user_id and e.user_id != "public"}
    actors: dict = {}
    if actor_ids:
        for u in db.query(User).filter(User.id.in_(actor_ids)).all():
            name = f"{u.first_name or ''} {u.last_name or ''}".strip()
            actors[str(u.id)] = name or u.email

    events_out = [{
        "action": e.action,
        "status": _status_from_audit_action(e.action),
        "created_at": _iso(e.created_at),
        "actor": ("Candidat" if e.user_id == "public" else actors.get(e.user_id)),
        "details": e.details,
    } for e in events]

    return {"steps": steps, "events": events_out}


# ─── POST / ───────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_admission(
    request: Request,
    payload: AdmissionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new admission application (starts as DRAFT)."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    row = db.execute(text("""
        INSERT INTO admission_applications (
            id, tenant_id, academic_year_id, level_id,
            student_first_name, student_last_name, student_date_of_birth,
            student_gender, student_address, student_previous_school,
            parent_first_name, parent_last_name, parent_email, parent_phone,
            parent_address, parent_occupation, status, notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), :tenant_id, :academic_year_id, :level_id,
            :student_first_name, :student_last_name, :student_date_of_birth,
            :student_gender, :student_address, :student_previous_school,
            :parent_first_name, :parent_last_name, :parent_email, :parent_phone,
            :parent_address, :parent_occupation, 'DRAFT', :notes, NOW(), NOW()
        ) RETURNING *
    """), {
        "tenant_id": tenant_id, "academic_year_id": payload.academic_year_id,
        "level_id": payload.level_id,
        "student_first_name": payload.student_first_name, "student_last_name": payload.student_last_name,
        "student_date_of_birth": payload.student_date_of_birth, "student_gender": payload.student_gender,
        "student_address": payload.student_address, "student_previous_school": payload.student_previous_school,
        "parent_first_name": payload.parent_first_name, "parent_last_name": payload.parent_last_name,
        "parent_email": payload.parent_email, "parent_phone": payload.parent_phone,
        "parent_address": payload.parent_address, "parent_occupation": payload.parent_occupation,
        "notes": payload.notes,
    }).mappings().first()
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="ADMISSION_CREATED", resource_type="ADMISSION", resource_id=str(row["id"]))
    db.commit()
    return dict(row)


# ─── PATCH /{id}/status ───────────────────────────────────────────────────────

@router.patch("/{admission_id}/status/")
def transition_status(
    request: Request,
    admission_id: str,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """Move an application through its lifecycle with state machine validation."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    app = _fetch(db, admission_id, tenant_id)
    current_status = app["status"]
    new_status = payload.status.upper()
    allowed = VALID_TRANSITIONS.get(current_status, [])
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=(
            f"Cannot transition from '{current_status}' to '{new_status}'. "
            f"Allowed: {allowed if allowed else 'none — terminal state'}"
        ))
    extra = ""
    extra_params: dict = {}
    if new_status == "SUBMITTED":
        extra = ", submitted_at = NOW()"
    if new_status in ("ACCEPTED", "REJECTED", "UNDER_REVIEW"):
        extra = ", reviewed_at = NOW(), reviewed_by = :reviewer"
        extra_params["reviewer"] = current_user.get("id")
    db.execute(text(f"""
        UPDATE admission_applications
        SET status = :status, notes = COALESCE(:notes, notes), updated_at = NOW() {extra}
        WHERE id = :id AND tenant_id = :tenant_id
    """), {"status": new_status, "notes": payload.notes,
           "id": admission_id, "tenant_id": tenant_id, **extra_params})
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action=f"ADMISSION_{new_status}", resource_type="ADMISSION",
              resource_id=admission_id, details={"from": current_status, "to": new_status})
    db.commit()
    return _fetch(db, admission_id, tenant_id)


# ─── POST /{id}/convert ───────────────────────────────────────────────────────

@router.post("/{admission_id}/convert/")
def convert_to_student(
    request: Request,
    admission_id: str,
    # BUG RÉEL (reproduit en prod, 422 systématique) : ConvertPayload a
    # tous ses champs optionnels, mais SANS valeur par défaut sur le
    # paramètre lui-même, FastAPI exige quand même un corps de requête
    # présent — un appel sans corps du tout (ex. apiClient.post(url) côté
    # frontend, sans second argument) échoue la validation avant même
    # d'atteindre le code. Un défaut rend l'ensemble du corps facultatif,
    # cohérent avec le fait que chaque champ l'est déjà individuellement.
    payload: ConvertPayload = ConvertPayload(),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """
    Convert an ACCEPTED application into a Student record.
    Copies personal + parent data and marks the application as CONVERTED_TO_STUDENT.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    app = _fetch(db, admission_id, tenant_id)
    if app["status"] != "ACCEPTED":
        raise HTTPException(status_code=400,
            detail=f"Only ACCEPTED applications can be converted (current: {app['status']})")

    # Auto-generate registration number
    reg_number = payload.registration_number
    if not reg_number:
        year = datetime.now().year
        seq = (db.execute(text(
            "SELECT COUNT(*) FROM students WHERE tenant_id = :tid"
        ), {"tid": tenant_id}).scalar() or 0) + 1
        reg_number = f"STU-{year}-{seq:04d}"

    # Map gender safely
    raw_gender = (app.get("student_gender") or "").upper()
    gender = raw_gender if raw_gender in ("MALE", "FEMALE", "OTHER") else "OTHER"
    # date_of_birth is NOT NULL in students — fallback to today if missing
    dob = app.get("student_date_of_birth") or date.today()

    student = db.execute(text("""
        INSERT INTO students (
            tenant_id, registration_number,
            first_name, last_name, date_of_birth, gender,
            address, level, class_name, academic_year, status,
            parent_name, parent_phone, parent_email,
            created_at, updated_at
        ) VALUES (
            :tenant_id, :reg_number,
            :first_name, :last_name, :dob, :gender,
            :address, :level, :class_name, :academic_year, 'ACTIVE',
            :parent_name, :parent_phone, :parent_email,
            NOW(), NOW()
        ) RETURNING id, registration_number, first_name, last_name
    """), {
        "tenant_id":   tenant_id, "reg_number": reg_number,
        "first_name":  app["student_first_name"], "last_name": app["student_last_name"],
        "dob":         dob, "gender": gender,
        "address":     app.get("student_address"),
        "level":       app.get("level_name") or "",
        "class_name":  payload.class_name,
        "academic_year": app.get("academic_year_name"),
        "parent_name": f"{app['parent_first_name']} {app['parent_last_name']}",
        "parent_phone": app["parent_phone"],
        "parent_email": app["parent_email"],
    }).mappings().first()

    student_id = str(student["id"])
    db.execute(text("""
        UPDATE admission_applications
        SET status = 'CONVERTED_TO_STUDENT', converted_student_id = :student_id,
            reviewed_by = :reviewer, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id
    """), {"student_id": student_id, "reviewer": current_user.get("id"),
           "id": admission_id, "tenant_id": tenant_id})

    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="ADMISSION_CONVERTED", resource_type="ADMISSION", resource_id=admission_id,
              details={"student_id": student_id, "registration_number": reg_number})
    db.commit()

    return {
        "message": "Application converted to student successfully",
        "student_id": student_id,
        "registration_number": reg_number,
        "student_name": f"{student['first_name']} {student['last_name']}",
    }


# ─── PATCH /{id} — edit DRAFT fields ─────────────────────────────────────────

@router.patch("/{admission_id}/")
def edit_admission(
    request: Request,
    admission_id: str,
    payload: AdmissionEdit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """Update editable fields on a DRAFT application."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    result = db.execute(text(f"""
        UPDATE admission_applications
        SET {set_clause}, updated_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id AND status = 'DRAFT'
        RETURNING id
    """), {"id": admission_id, "tenant_id": tenant_id, **updates})
    if not result.rowcount:
        raise HTTPException(status_code=400,
            detail="Application not found or not in DRAFT status")
    db.commit()
    return _fetch(db, admission_id, tenant_id)


# ─── DELETE /{id} — DRAFT only ────────────────────────────────────────────────

@router.delete("/{admission_id}/", status_code=204)
def delete_admission(
    request: Request,
    admission_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """Delete a DRAFT application only."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    result = db.execute(text("""
        DELETE FROM admission_applications
        WHERE id = :id AND tenant_id = :tenant_id AND status = 'DRAFT'
        RETURNING id
    """), {"id": admission_id, "tenant_id": tenant_id})
    if not result.rowcount:
        raise HTTPException(status_code=400,
            detail="Application not found or not in DRAFT status")
    db.commit()
ADMISSION_DOC_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "pdf"}
ADMISSION_DOC_MAX_SIZE = 8 * 1024 * 1024  # 8 MB


@router.post("/public/upload-document/", status_code=201)
@limiter.limit("20/minute")
async def public_upload_document(
    request: Request,
    tenant_id: str = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a single admission document before/with candidature submission.

    Public + unauthenticated (candidates have no account yet). Scoped to a
    tenant_id so files land under a per-tenant prefix; returns a storage key
    to attach to the /public/apply/ payload's `documents` field.
    """
    from app.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or inactive")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if extension not in ADMISSION_DOC_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier '.{extension}' non autorisé. Formats acceptés : "
                   f"{', '.join(sorted(ADMISSION_DOC_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > ADMISSION_DOC_MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Fichier trop volumineux. Taille maximale : {ADMISSION_DOC_MAX_SIZE // (1024*1024)} Mo.",
        )

    try:
        import magic
        mime_type = magic.from_buffer(content, mime=True)
    except Exception:
        mime_type = file.content_type or "application/octet-stream"

    ALLOWED_MIME_TYPES = {
        "image/jpeg", "image/png", "image/webp", "application/pdf",
    }
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Contenu de fichier non autorisé.")

    await file.seek(0)
    object_name = f"admissions/{tenant_id}/{uuid.uuid4()}.{extension}"
    storage_client.upload_file(file_data=file.file, object_name=object_name, content_type=file.content_type)
    url = storage_client.get_presigned_url(object_name)

    return {
        "key": object_name,
        "url": url,
        "filename": file.filename,
        "document_type": document_type,
    }


@router.post("/public/apply/", status_code=201)
def public_apply(
    payload: dict,
    db: Session = Depends(get_db),
):
    """Public endpoint to submit an admission application (starts as SUBMITTED)."""
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Missing tenant_id")
    
    # Verify tenant exists and is active
    from app.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or inactive")

    # level_id/academic_year_id are optional in the public form — the frontend
    # sends "" (not omitted) when nothing is selected, which Postgres rejects
    # as an invalid UUID. Normalize blank strings to NULL.
    academic_year_id = payload.get("academic_year_id") or None
    level_id = payload.get("level_id") or None
    documents = payload.get("documents") or None

    row = db.execute(text("""
        INSERT INTO admission_applications (
            id, tenant_id, academic_year_id, level_id,
            student_first_name, student_last_name, student_date_of_birth,
            student_gender, student_address, student_previous_school,
            parent_first_name, parent_last_name, parent_email, parent_phone,
            parent_address, parent_occupation, status, notes, documents,
            submitted_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), :tenant_id, :academic_year_id, :level_id,
            :student_first_name, :student_last_name, :student_date_of_birth,
            :student_gender, :student_address, :student_previous_school,
            :parent_first_name, :parent_last_name, :parent_email, :parent_phone,
            :parent_address, :parent_occupation, 'SUBMITTED', :notes, :documents,
            NOW(), NOW(), NOW()
        ) RETURNING *
    """), {
        "tenant_id": tenant_id,
        "academic_year_id": academic_year_id,
        "level_id": level_id,
        "documents": json.dumps(documents) if documents is not None else None,
        "student_first_name": payload.get("student_first_name"), 
        "student_last_name": payload.get("student_last_name"),
        "student_date_of_birth": payload.get("student_date_of_birth"), 
        "student_gender": payload.get("student_gender"),
        "student_address": payload.get("student_address"), 
        "student_previous_school": payload.get("student_previous_school"),
        "parent_first_name": payload.get("parent_first_name"), 
        "parent_last_name": payload.get("parent_last_name"),
        "parent_email": payload.get("parent_email"), 
        "parent_phone": payload.get("parent_phone"),
        "parent_address": payload.get("parent_address"), 
        "parent_occupation": payload.get("parent_occupation"),
        "notes": payload.get("notes"),
    }).mappings().first()

    # Sans cet appel, la toute première étape ("Candidature soumise") de la
    # timeline (voir _admission_events_reached) n'avait aucune entrée
    # audit_logs pour le flux réel (dépôt public) — seules les créations
    # DRAFT par un admin (create_admission) étaient journalisées. user_id
    # NOT NULL sur audit_logs, et cet endpoint est public (pas de
    # current_user) — "public" plutôt que None, qui échouerait le NOT
    # NULL en silence (log_audit avale ses propres exceptions).
    log_audit(db, user_id="public", tenant_id=tenant_id,
              action="ADMISSION_SUBMITTED", resource_type="ADMISSION", resource_id=str(row["id"]),
              details={"from": None, "to": "SUBMITTED"})
    db.commit()
    return dict(row)


# ─── STATUS LABELS / COLORS (shared) ──────────────────────────────────────────
STATUS_LABELS = {
    "DRAFT": "Brouillon",
    "SUBMITTED": "Soumis",
    "UNDER_REVIEW": "En cours d'examen",
    "ACCEPTED": "Accepté",
    "REJECTED": "Refusé",
    "CONVERTED_TO_STUDENT": "Inscrit",
}
STATUS_COLORS = {
    "DRAFT": "gray",
    "SUBMITTED": "blue",
    "UNDER_REVIEW": "yellow",
    "ACCEPTED": "green",
    "REJECTED": "red",
    "CONVERTED_TO_STUDENT": "emerald",
}


# ─── GET /public/status/ — vérifier le statut d'une candidature (sans auth) ───
@router.get("/public/status/")
def public_check_status(
    tenant_id: str,
    email: str,
    reference: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Check candidature status by parent email (and optionally application ID)."""
    # bindparam(type_=GUID()) sur tenant_id/reference : sans ça, un bind
    # texte brut compare la valeur avec tirets de l'appelant à la valeur
    # sans tirets stockée par le GUID TypeDecorator sur SQLite et ne
    # matche jamais aucune ligne (fonctionne sur PostgreSQL, qui n'a pas
    # cet écart) — même bug déjà corrigé dans _fetch()/list_admissions()
    # (voir plus haut), jamais appliqué ici faute de test avant cette
    # fonctionnalité. `reference` comparé directement à la colonne GUID
    # plutôt que CAST(id AS TEXT) = :reference (l'ancien CAST donnait la
    # forme sans tirets sur SQLite, ne matchant jamais non plus la
    # référence avec tirets renvoyée au candidat par cette même fonction).
    params: dict = {"tenant_id": tenant_id, "email": email.strip().lower()}
    extra = "AND LOWER(a.parent_email) = :email"
    bind_types = [bindparam("tenant_id", type_=GUID())]
    if reference:
        try:
            # Comparaison directe à la colonne GUID (voir plus haut) —
            # valide le format ici plutôt que de laisser
            # GUID.process_bind_param lever une ValueError non gérée (une
            # référence mal formée, saisie à la main par un candidat, doit
            # rendre "aucun dossier trouvé", pas un 500).
            params["reference"] = str(uuid.UUID(reference.strip()))
            extra += " AND a.id = :reference"
            bind_types.append(bindparam("reference", type_=GUID()))
        except ValueError:
            return {"applications": []}

    rows = db.execute(text(f"""
        SELECT
            a.id,
            a.status,
            a.student_first_name,
            a.student_last_name,
            a.submitted_at,
            a.notes,
            a.documents,
            l.name AS level_name
        FROM admission_applications a
        LEFT JOIN levels l ON l.id = a.level_id
        WHERE a.tenant_id = :tenant_id
          {extra}
        ORDER BY a.submitted_at DESC
        LIMIT 20
    """).bindparams(*bind_types), params).mappings().all()

    results = []
    for r in rows:
        # str(uuid.UUID(...)) plutôt que str(r["id"]) directement : un
        # SELECT text() brut renvoie la valeur stockée telle quelle sans
        # passer par GUID.process_result_value — sur SQLite ça donne la
        # forme sans tirets (CHAR(32) hex), qui ne matcherait jamais
        # AuditLog.resource_id (toujours stocké avec tirets). N'affecte
        # aucun environnement réel (dev et prod tournent sur PostgreSQL,
        # qui renvoie déjà un uuid.UUID avec tirets), mais corrige aussi
        # les tests locaux/CI SQLite.
        admission_id = str(uuid.UUID(str(r["id"])))
        # Timeline publique : statut + date par étape uniquement — jamais
        # les notes internes (payload.notes de transition_status peut
        # contenir des remarques admin non destinées au candidat, voir
        # get_admission_timeline pour la version complète réservée à
        # l'admin authentifié).
        reached, _events = _admission_events_reached(
            db, tenant_id, admission_id, fallback_submitted_at=r["submitted_at"],
        )
        steps = _build_admission_steps(r["status"], reached)

        results.append({
            "id": admission_id,
            "status": r["status"],
            "status_label": STATUS_LABELS.get(r["status"], r["status"]),
            "status_color": STATUS_COLORS.get(r["status"], "gray"),
            "student_name": f"{r['student_first_name']} {r['student_last_name']}",
            "level": r["level_name"],
            "submitted_at": _iso(r["submitted_at"]),
            "notes": r["notes"],
            "type": _admission_type_label(r["documents"]),
            "steps": steps,
        })
    return {"applications": results}


# ─── POST /public/verify-student/ — vérifier un étudiant existant (réinscription) ──
class VerifyStudentPayload(BaseModel):
    tenant_id: str
    registration_number: str
    parent_email: str


@router.post("/public/verify-student/")
def public_verify_student(payload: VerifyStudentPayload, db: Session = Depends(get_db)):
    """Verify that a student exists for re-enrollment (returns masked data)."""
    row = db.execute(text("""
        SELECT
            s.id,
            s.first_name,
            s.last_name,
            s.registration_number,
            s.email    AS student_email,
            u.email    AS parent_email,
            u.phone    AS parent_phone,
            l.name     AS current_level
        FROM students s
        LEFT JOIN users u ON u.id = s.parent_id
        LEFT JOIN levels l ON l.id = s.level_id
        WHERE s.tenant_id = :tenant_id
          AND UPPER(s.registration_number) = UPPER(:reg_no)
          AND (
              LOWER(u.email) = LOWER(:parent_email)
              OR LOWER(s.email) = LOWER(:parent_email)
          )
    """), {
        "tenant_id": payload.tenant_id,
        "reg_no": payload.registration_number.strip(),
        "parent_email": payload.parent_email.strip().lower(),
    }).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Aucun étudiant trouvé avec ce numéro d'immatriculation et cet e-mail parent."
        )

    # Mask sensitive data before returning
    email = row["parent_email"] or ""
    phone = row["parent_phone"] or ""
    masked_email = email[:2] + "***@" + email.split("@")[-1] if "@" in email else "***"
    masked_phone = "****" + phone[-4:] if len(phone) >= 4 else "****"

    return {
        "student_id": str(row["id"]),
        "student_name": f"{row['first_name']} {row['last_name']}",
        "registration_number": row["registration_number"],
        "current_level": row["current_level"],
        "masked_email": masked_email,
        "masked_phone": masked_phone,
    }


# ─── POST /public/reenroll/ — soumettre une demande de réinscription ──────────
class ReEnrollPayload(BaseModel):
    tenant_id: str
    student_id: str
    academic_year_id: str
    level_id: str
    parent_email: str
    parent_phone: Optional[str] = None
    notes: Optional[str] = None


@router.post("/public/reenroll/")
def public_reenroll(payload: ReEnrollPayload, db: Session = Depends(get_db)):
    """Submit a re-enrollment request for an existing student."""
    # Verify tenant is active
    from app.models import Tenant
    tenant = db.query(Tenant).filter(
        Tenant.id == payload.tenant_id, Tenant.is_active == True
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement introuvable ou inactif.")

    # Verify student belongs to this tenant
    student = db.execute(text("""
        SELECT s.id, s.first_name, s.last_name, s.registration_number,
               u.email AS parent_email
        FROM students s
        LEFT JOIN users u ON u.id = s.parent_id
        WHERE s.id = :student_id AND s.tenant_id = :tenant_id
    """), {"student_id": payload.student_id, "tenant_id": payload.tenant_id}).mappings().first()

    if not student:
        raise HTTPException(status_code=404, detail="Étudiant introuvable.")

    # Check no duplicate in-progress request for this student + academic year
    existing = db.execute(text("""
        SELECT id FROM admission_applications
        WHERE tenant_id = :tenant_id
          AND academic_year_id = :ay_id
          AND documents->>'student_id' = :student_id
          AND status NOT IN ('REJECTED', 'CONVERTED_TO_STUDENT')
        LIMIT 1
    """), {
        "tenant_id": payload.tenant_id,
        "ay_id": payload.academic_year_id,
        "student_id": payload.student_id,
    }).mappings().first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Une demande de réinscription est déjà en cours pour cet étudiant."
        )

    import json as _json
    row = db.execute(text("""
        INSERT INTO admission_applications (
            id, tenant_id, academic_year_id, level_id,
            student_first_name, student_last_name,
            parent_email, parent_phone,
            status, notes, documents,
            submitted_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), :tenant_id, :academic_year_id, :level_id,
            :first_name, :last_name,
            :parent_email, :parent_phone,
            'SUBMITTED', :notes, :documents::jsonb,
            NOW(), NOW(), NOW()
        ) RETURNING id, status, submitted_at
    """), {
        "tenant_id": payload.tenant_id,
        "academic_year_id": payload.academic_year_id,
        "level_id": payload.level_id,
        "first_name": student["first_name"],
        "last_name": student["last_name"],
        "parent_email": payload.parent_email,
        "parent_phone": payload.parent_phone,
        "notes": f"[RÉINSCRIPTION] {payload.notes or ''}".strip(),
        "documents": _json.dumps({"type": "REINSCRIPTION", "student_id": payload.student_id}),
    }).mappings().first()

    db.commit()
    return {
        "reference": str(row["id"]),
        "status": row["status"],
        "status_label": STATUS_LABELS.get(row["status"], row["status"]),
        "submitted_at": row["submitted_at"].isoformat() if row["submitted_at"] else None,
        "message": "Votre demande de réinscription a été soumise avec succès.",
    }


# ─── GET /public/tenant-info/{slug}/ — infos publiques d'un établissement ─────
@router.get("/public/tenant-info/{slug}/")
def public_tenant_info(slug: str, db: Session = Depends(get_db)):
    """Return public school info: name, contact, levels, current academic year."""
    tenant = db.execute(text("""
        SELECT id, name, type, email, phone, address, website, country, settings
        FROM tenants
        WHERE slug = :slug AND is_active = TRUE
    """), {"slug": slug}).mappings().first()

    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement introuvable.")

    tenant_id = str(tenant["id"])

    levels = db.execute(text("""
        SELECT id, name, label, order_index
        FROM levels
        WHERE tenant_id = :tenant_id
        ORDER BY order_index ASC, name ASC
    """), {"tenant_id": tenant_id}).mappings().all()

    academic_year = db.execute(text("""
        SELECT id, name, start_date, end_date, is_current
        FROM academic_years
        WHERE tenant_id = :tenant_id AND is_current = TRUE
        LIMIT 1
    """), {"tenant_id": tenant_id}).mappings().first()

    settings = tenant["settings"] or {}
    return {
        "id": tenant_id,
        "name": tenant["name"],
        "type": tenant["type"],
        "email": tenant["email"],
        "phone": tenant["phone"],
        "address": tenant["address"],
        "website": tenant["website"],
        "country": tenant["country"],
        "admissions_open": settings.get("admissions_open", True),
        "levels": [
            {"id": str(l["id"]), "name": l["name"], "description": l["label"]}
            for l in levels
        ],
        "current_academic_year": {
            "id": str(academic_year["id"]),
            "name": academic_year["name"],
            "start_date": str(academic_year["start_date"]) if academic_year["start_date"] else None,
            "end_date": str(academic_year["end_date"]) if academic_year["end_date"] else None,
        } if academic_year else None,
    }
