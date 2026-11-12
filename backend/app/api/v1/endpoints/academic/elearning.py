"""E-learning : modules, leçons et progression des élèves (2026-11-12).

Avant : les cours existaient en base, mais l'éditeur de modules et de leçons
de la page admin gardait tout dans le navigateur (aucune table de leçons,
aucune route d'écriture des modules) et aucun élève n'y avait accès.

Deux routeurs :
- `staff_router` (monté sous /analytics/elearning, à côté des routes de
  cours existantes) : lecture `homework:read`, écriture `homework:write`.
  Un enseignant (non privilégié) ne gère que les cours dont il est l'auteur.
- `student_router` (monté sous /me/elearning) : l'élève connecté voit les
  cours publiés de son établissement dont le niveau est celui de sa classe
  active (ou sans niveau), uniquement leurs leçons publiées, et marque une
  leçon comme terminée.

Toutes les requêtes filtrent explicitement par établissement ; la RLS
(migration 20261112_0001) est le second rempart. Le contenu d'une leçon est
du texte brut (jamais interprété comme HTML) et le lien éventuel doit être
en https://.
"""
from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.core.teacher_scope import is_scoped_teacher
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models.base import GUID
from app.utils.audit import log_audit

staff_router = APIRouter()
student_router = APIRouter()


# ─── Schémas ──────────────────────────────────────────────────────────────

class ModuleIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    order_index: Optional[int] = Field(default=None, ge=0, le=10000)


class ModulePatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    order_index: Optional[int] = Field(default=None, ge=0, le=10000)


def _https_only(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not value.lower().startswith("https://"):
        raise ValueError("le lien doit commencer par https://")
    return value


class LessonIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, max_length=50000)
    resource_url: Optional[str] = Field(default=None, max_length=1000)
    lesson_type: Literal["text", "video", "document"] = "text"
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    order_index: Optional[int] = Field(default=None, ge=0, le=10000)
    is_published: bool = False

    _url = field_validator("resource_url")(_https_only)


class LessonPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, max_length=50000)
    resource_url: Optional[str] = Field(default=None, max_length=1000)
    lesson_type: Optional[Literal["text", "video", "document"]] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    order_index: Optional[int] = Field(default=None, ge=0, le=10000)
    is_published: Optional[bool] = None

    _url = field_validator("resource_url")(_https_only)


# ─── Outils ───────────────────────────────────────────────────────────────

def _q(sql: str, *uuid_params: str):
    stmt = text(sql)
    if uuid_params:
        stmt = stmt.bindparams(*(bindparam(p, type_=GUID()) for p in uuid_params))
    return stmt


def _course(db: Session, tenant_id: str, course_id) -> dict:
    row = db.execute(_q(
        "SELECT id, tenant_id, title, description, subject_id, level_id, teacher_id, is_published "
        "FROM elearning_courses WHERE id = :cid AND tenant_id = :tid", "cid", "tid",
    ), {"cid": str(course_id), "tid": tenant_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Cours introuvable")
    return dict(row)


def _require_course_manager(user: dict, course: dict) -> None:
    """Un enseignant non privilégié ne modifie que ses propres cours."""
    if is_scoped_teacher(user) and str(course.get("teacher_id") or "") != str(user.get("id")):
        raise HTTPException(status_code=403, detail="Un enseignant ne gère que ses propres cours.")


def _module(db: Session, tenant_id: str, module_id) -> dict:
    row = db.execute(_q(
        "SELECT id, course_id, title, description, order_index FROM elearning_modules "
        "WHERE id = :mid AND tenant_id = :tid", "mid", "tid",
    ), {"mid": str(module_id), "tid": tenant_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Module introuvable")
    return dict(row)


def _lesson(db: Session, tenant_id: str, lesson_id) -> dict:
    row = db.execute(_q(
        "SELECT id, course_id, module_id FROM elearning_lessons WHERE id = :lid AND tenant_id = :tid",
        "lid", "tid",
    ), {"lid": str(lesson_id), "tid": tenant_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Leçon introuvable")
    return dict(row)


_LESSON_COLUMNS = ("id, course_id, module_id, title, content, resource_url, lesson_type, "
                   "duration_minutes, order_index, is_published, created_at, updated_at")


def _serialize(row) -> dict:
    out = {}
    for key, value in dict(row).items():
        out[key] = str(value) if isinstance(value, UUID) else value
    return out


def _course_content(db: Session, tenant_id: str, course_id, *, published_only: bool) -> list:
    modules = db.execute(_q(
        "SELECT id, course_id, title, description, order_index FROM elearning_modules "
        "WHERE course_id = :cid AND tenant_id = :tid ORDER BY order_index, title", "cid", "tid",
    ), {"cid": str(course_id), "tid": tenant_id}).mappings().all()
    lessons = db.execute(_q(
        f"SELECT {_LESSON_COLUMNS} FROM elearning_lessons "
        "WHERE course_id = :cid AND tenant_id = :tid"
        + (" AND is_published" if published_only else "")
        + " ORDER BY order_index, title", "cid", "tid",
    ), {"cid": str(course_id), "tid": tenant_id}).mappings().all()
    by_module: dict = {}
    for lesson in lessons:
        by_module.setdefault(str(lesson["module_id"]), []).append(_serialize(lesson))
    return [{**_serialize(m), "lessons": by_module.get(str(m["id"]), [])} for m in modules]


def _next_order(db: Session, table: str, parent_column: str, parent_id: str, tenant_id: str) -> int:
    # `table` et `parent_column` sont des constantes de ce module, jamais une entrée.
    value = db.execute(_q(
        f"SELECT COALESCE(MAX(order_index), -1) + 1 FROM {table} "
        f"WHERE {parent_column} = :pid AND tenant_id = :tid", "pid", "tid",
    ), {"pid": parent_id, "tid": tenant_id}).scalar()
    return int(value or 0)


# ─── Personnel : modules ──────────────────────────────────────────────────

@staff_router.get("/courses/{course_id}/content/")
def get_course_content(
    course_id: UUID, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """Modules du cours et toutes leurs leçons (brouillons compris)."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    course = _course(db, tenant_id, course_id)
    return {"course": _serialize(course),
            "modules": _course_content(db, tenant_id, course_id, published_only=False)}


@staff_router.post("/courses/{course_id}/modules/", status_code=201)
def create_module(
    course_id: UUID, body: ModuleIn, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    course = _course(db, tenant_id, course_id)
    _require_course_manager(current_user, course)
    order = body.order_index if body.order_index is not None else _next_order(
        db, "elearning_modules", "course_id", str(course_id), tenant_id)
    row = db.execute(_q(
        "INSERT INTO elearning_modules (tenant_id, course_id, title, description, order_index) "
        "VALUES (:tid, :cid, :title, :description, :order_index) "
        "RETURNING id, course_id, title, description, order_index", "tid", "cid",
    ), {"tid": tenant_id, "cid": str(course_id), "title": body.title.strip(),
        "description": body.description, "order_index": order}).mappings().first()
    db.commit()
    return {**_serialize(row), "lessons": []}


@staff_router.put("/modules/{module_id}/")
def update_module(
    module_id: UUID, body: ModulePatch, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    module = _module(db, tenant_id, module_id)
    _require_course_manager(current_user, _course(db, tenant_id, module["course_id"]))
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is None:
        raise HTTPException(status_code=422, detail="Le titre ne peut pas être vide")
    if not changes:
        raise HTTPException(status_code=400, detail="Aucun champ à modifier")
    columns = {"title", "description", "order_index"}  # liste fermée
    sets = ", ".join(f"{k} = :{k}" for k in changes if k in columns)
    row = db.execute(_q(
        f"UPDATE elearning_modules SET {sets} WHERE id = :mid AND tenant_id = :tid "
        "RETURNING id, course_id, title, description, order_index", "mid", "tid",
    ), {**changes, "mid": str(module_id), "tid": tenant_id}).mappings().first()
    db.commit()
    return _serialize(row)


@staff_router.delete("/modules/{module_id}/", status_code=204)
def delete_module(
    module_id: UUID, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    """Supprime le module et ses leçons (et la progression associée)."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    module = _module(db, tenant_id, module_id)
    _require_course_manager(current_user, _course(db, tenant_id, module["course_id"]))
    db.execute(_q("DELETE FROM elearning_modules WHERE id = :mid AND tenant_id = :tid", "mid", "tid"),
               {"mid": str(module_id), "tid": tenant_id})
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id, action="DELETE_ELEARNING_MODULE",
              resource_type="ELEARNING_MODULE", resource_id=str(module_id),
              details={"course_id": str(module["course_id"]), "title": module["title"]})
    db.commit()
    return None


# ─── Personnel : leçons ───────────────────────────────────────────────────

@staff_router.post("/modules/{module_id}/lessons/", status_code=201)
def create_lesson(
    module_id: UUID, body: LessonIn, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    module = _module(db, tenant_id, module_id)
    _require_course_manager(current_user, _course(db, tenant_id, module["course_id"]))
    order = body.order_index if body.order_index is not None else _next_order(
        db, "elearning_lessons", "module_id", str(module_id), tenant_id)
    row = db.execute(_q(
        "INSERT INTO elearning_lessons (tenant_id, course_id, module_id, title, content, resource_url, "
        "lesson_type, duration_minutes, order_index, is_published, created_by) "
        "VALUES (:tid, :cid, :mid, :title, :content, :resource_url, :lesson_type, :duration_minutes, "
        f":order_index, :is_published, :uid) RETURNING {_LESSON_COLUMNS}", "tid", "cid", "mid", "uid",
    ), {"tid": tenant_id, "cid": str(module["course_id"]), "mid": str(module_id),
        "title": body.title.strip(), "content": body.content, "resource_url": body.resource_url,
        "lesson_type": body.lesson_type, "duration_minutes": body.duration_minutes,
        "order_index": order, "is_published": body.is_published,
        "uid": str(current_user.get("id")) if current_user.get("id") else None}).mappings().first()
    db.commit()
    return _serialize(row)


@staff_router.put("/lessons/{lesson_id}/")
def update_lesson(
    lesson_id: UUID, body: LessonPatch, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    lesson = _lesson(db, tenant_id, lesson_id)
    _require_course_manager(current_user, _course(db, tenant_id, lesson["course_id"]))
    changes = body.model_dump(exclude_unset=True)
    for required in ("title", "lesson_type", "is_published"):
        if required in changes and changes[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} ne peut pas être vide")
    if not changes:
        raise HTTPException(status_code=400, detail="Aucun champ à modifier")
    columns = {"title", "content", "resource_url", "lesson_type", "duration_minutes",
               "order_index", "is_published"}  # liste fermée
    sets = ", ".join(f"{k} = :{k}" for k in changes if k in columns)
    row = db.execute(_q(
        f"UPDATE elearning_lessons SET {sets}, updated_at = CURRENT_TIMESTAMP "
        f"WHERE id = :lid AND tenant_id = :tid RETURNING {_LESSON_COLUMNS}", "lid", "tid",
    ), {**changes, "lid": str(lesson_id), "tid": tenant_id}).mappings().first()
    db.commit()
    return _serialize(row)


@staff_router.delete("/lessons/{lesson_id}/", status_code=204)
def delete_lesson(
    lesson_id: UUID, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    lesson = _lesson(db, tenant_id, lesson_id)
    _require_course_manager(current_user, _course(db, tenant_id, lesson["course_id"]))
    db.execute(_q("DELETE FROM elearning_lessons WHERE id = :lid AND tenant_id = :tid", "lid", "tid"),
               {"lid": str(lesson_id), "tid": tenant_id})
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id, action="DELETE_ELEARNING_LESSON",
              resource_type="ELEARNING_LESSON", resource_id=str(lesson_id),
              details={"course_id": str(lesson["course_id"])})
    db.commit()
    return None


# ─── Élève ────────────────────────────────────────────────────────────────

def _student_context(db: Session, request: Request, user: dict) -> tuple[str, str, Optional[str]]:
    """(établissement, fiche élève, niveau de la classe active) de l'appelant."""
    tenant_id = str(resolve_current_tenant_id(request, user, db))
    student = db.execute(_q(
        "SELECT id FROM students WHERE user_id = :uid AND tenant_id = :tid LIMIT 1", "uid", "tid",
    ), {"uid": str(user.get("id")), "tid": tenant_id}).first()
    if not student:
        raise HTTPException(status_code=403, detail="Réservé aux élèves.")
    level = db.execute(_q("""
        SELECT c.level_id
          FROM enrollments e
          JOIN classes c ON c.id = e.class_id AND c.tenant_id = e.tenant_id
          LEFT JOIN academic_years ay ON ay.id = e.academic_year_id AND ay.tenant_id = e.tenant_id
         WHERE e.student_id = :sid AND e.tenant_id = :tid AND UPPER(e.status) = 'ACTIVE'
         ORDER BY CASE WHEN ay.is_current THEN 0 ELSE 1 END, e.created_at DESC
         LIMIT 1
    """, "sid", "tid"), {"sid": str(student[0]), "tid": tenant_id}).first()
    return tenant_id, str(student[0]), (str(level[0]) if level and level[0] else None)


# Publié : la page admin enregistre « Publié » dans `status` (le booléen
# `is_published` de l'API n'y est pas exposé) — les deux comptent.
_VISIBLE = ("c.tenant_id = :tid AND (c.is_published OR LOWER(c.status) = 'published') "
            "AND (c.level_id IS NULL OR CAST(c.level_id AS TEXT) = :level)")


@student_router.get("/courses/")
def list_my_courses(
    request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """Cours publiés visibles par l'élève, avec sa progression."""
    tenant_id, student_id, level_id = _student_context(db, request, current_user)
    rows = db.execute(_q(f"""
        SELECT c.id, c.title, c.description, c.duration_hours, s.name AS subject_name,
               (SELECT COUNT(*) FROM elearning_lessons l
                 WHERE l.course_id = c.id AND l.tenant_id = c.tenant_id AND l.is_published) AS lesson_count,
               (SELECT COUNT(*) FROM elearning_lesson_progress p
                  JOIN elearning_lessons l ON l.id = p.lesson_id AND l.tenant_id = p.tenant_id
                 WHERE l.course_id = c.id AND l.is_published AND p.student_id = :sid
                   AND p.tenant_id = c.tenant_id) AS completed_count
          FROM elearning_courses c
          LEFT JOIN subjects s ON s.id = c.subject_id AND s.tenant_id = c.tenant_id
         WHERE {_VISIBLE}
         ORDER BY c.title
    """, "tid", "sid"), {"tid": tenant_id, "sid": student_id, "level": level_id or ""}).mappings().all()
    return [_serialize(r) for r in rows]


def _visible_course(db: Session, tenant_id: str, course_id, level_id: Optional[str]) -> dict:
    row = db.execute(_q(
        f"SELECT c.id, c.title, c.description, c.duration_hours FROM elearning_courses c "
        f"WHERE c.id = :cid AND {_VISIBLE}", "cid", "tid",
    ), {"cid": str(course_id), "tid": tenant_id, "level": level_id or ""}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Cours introuvable")
    return _serialize(row)


@student_router.get("/courses/{course_id}/")
def get_my_course(
    course_id: UUID, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """Modules et leçons publiées d'un cours visible, avec « terminée » par leçon."""
    tenant_id, student_id, level_id = _student_context(db, request, current_user)
    course = _visible_course(db, tenant_id, course_id, level_id)
    modules = _course_content(db, tenant_id, course_id, published_only=True)
    done = {str(r[0]) for r in db.execute(_q(
        "SELECT p.lesson_id FROM elearning_lesson_progress p "
        "JOIN elearning_lessons l ON l.id = p.lesson_id AND l.tenant_id = p.tenant_id "
        "WHERE l.course_id = :cid AND p.student_id = :sid AND p.tenant_id = :tid", "cid", "sid", "tid",
    ), {"cid": str(course_id), "sid": student_id, "tid": tenant_id}).all()}
    for module in modules:
        for lesson in module["lessons"]:
            lesson["completed"] = lesson["id"] in done
    return {"course": course, "modules": [m for m in modules if m["lessons"]]}


@student_router.post("/lessons/{lesson_id}/complete/")
def complete_lesson(
    lesson_id: UUID, request: Request, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """Marque une leçon publiée d'un cours visible comme terminée (idempotent)."""
    tenant_id, student_id, level_id = _student_context(db, request, current_user)
    lesson = db.execute(_q(
        "SELECT id, course_id FROM elearning_lessons WHERE id = :lid AND tenant_id = :tid AND is_published",
        "lid", "tid",
    ), {"lid": str(lesson_id), "tid": tenant_id}).mappings().first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon introuvable")
    _visible_course(db, tenant_id, lesson["course_id"], level_id)
    already = db.execute(_q(
        "SELECT 1 FROM elearning_lesson_progress WHERE lesson_id = :lid AND student_id = :sid AND tenant_id = :tid",
        "lid", "sid", "tid",
    ), {"lid": str(lesson_id), "sid": student_id, "tid": tenant_id}).first()
    if not already:
        db.execute(_q(
            "INSERT INTO elearning_lesson_progress (tenant_id, lesson_id, student_id) "
            "VALUES (:tid, :lid, :sid) ON CONFLICT (lesson_id, student_id) DO NOTHING", "tid", "lid", "sid",
        ), {"tid": tenant_id, "lid": str(lesson_id), "sid": student_id})
        db.commit()
    return {"lesson_id": str(lesson_id), "completed": True}
