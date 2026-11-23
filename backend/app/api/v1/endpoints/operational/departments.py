"""Department Portal endpoints — full sovereign API for department heads/members."""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Any
from pydantic import BaseModel
import datetime
import html as _html

from app.core.cycle_scope import is_cycle_restricted, scoped_class_ids
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.tenant_resolution import resolve_current_tenant_id
from app.core.config import settings
from app.services.notifications import EmailSender

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ExamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    exam_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    room_name: Optional[str] = None
    max_score: float = 20
    status: str = "scheduled"
    class_id: Optional[str] = None
    subject_id: str
    term_id: str


class ClassAttendanceAlert(BaseModel):
    classroomName: str
    rate: Any
    absent: Optional[int] = None
    total: Optional[int] = None


class DepartmentAlertSend(BaseModel):
    alerts: list[ClassAttendanceAlert]
    periodLabel: str = ""
    # departmentId/departmentName/tenantId/tenantName are accepted for
    # forward-compatibility with the frontend's existing payload but
    # ignored — the department and its own head's email are always
    # re-derived from the authenticated caller, never trusted from the
    # client (same principle as every ownership check in this router).


class DepartmentAlertCreate(BaseModel):
    alert_type: str = "manual"
    period_label: str = ""
    alerts_data: list[ClassAttendanceAlert] = []
    email_sent: bool = False


# ─── Helper: resolve department for current user ──────────────────────────────

def _get_user_department(db: Session, user_id: str, tenant_id: str) -> Optional[dict]:
    """Find the department for the current user (head or member)."""
    row = db.execute(text("""
        SELECT d.id, d.name, d.code, d.description
        FROM departments d
        WHERE d.tenant_id = :tenant_id AND d.head_id = :user_id
        LIMIT 1
    """), {"tenant_id": tenant_id, "user_id": user_id}).mappings().first()

    if not row:
        row = db.execute(text("""
            SELECT d.id, d.name, d.code, d.description
            FROM department_members dm
            JOIN departments d ON d.id = dm.department_id
            WHERE dm.tenant_id = :tenant_id AND dm.user_id = :user_id
            LIMIT 1
        """), {"tenant_id": tenant_id, "user_id": user_id}).mappings().first()

    return dict(row) if row else None


def _get_department_classroom_ids(db: Session, department_id: str, tenant_id: str, user: dict) -> list:
    """Classes du département visibles par ``user`` : toutes les classes du département, et, pour
    un compte limité à des cycles (CYCLE-PORTAL-GAP-01), seulement celles qui sont aussi dans son
    périmètre. Point de passage unique de toutes les routes du portail ; ``user`` est obligatoire
    pour qu'aucun appelant ne puisse oublier le périmètre."""
    rows = db.execute(text("""
        SELECT class_id FROM classroom_departments
        WHERE department_id = :dept_id AND tenant_id = :tenant_id
    """), {"dept_id": department_id, "tenant_id": tenant_id}).fetchall()
    class_ids = [str(r.class_id) for r in rows]
    if is_cycle_restricted(user):
        allowed = {str(c) for c in scoped_class_ids(db, tenant_id, user)}
        class_ids = [c for c in class_ids if c in allowed]
    return class_ids


def _require_department_class(class_id: Optional[str], class_ids: list) -> None:
    """DEPT-CLASS-IDOR-01 : une classe demandée en filtre doit être une classe visible du
    département (et du périmètre par cycle) ; sinon 404, jamais les élèves d'une autre classe."""
    if class_id and str(class_id) not in class_ids:
        raise HTTPException(status_code=404, detail="Classe introuvable dans ce département")


def _department_class_names(db: Session, class_ids: list) -> set:
    if not class_ids:
        return set()
    rows = db.execute(text("SELECT name FROM classrooms WHERE id = ANY(:ids)"), {"ids": class_ids}).fetchall()
    return {r.name for r in rows}


def _require_alert_classes_in_scope(db: Session, dept_id: str, tenant_id: str, user: dict, names) -> None:
    """Q-P2 : un compte restreint n'envoie ni n'enregistre d'alerte citant une classe hors de son
    périmètre (les alertes ne portent que le nom de la classe)."""
    if not is_cycle_restricted(user):
        return
    allowed = _department_class_names(db, _get_department_classroom_ids(db, dept_id, tenant_id, user))
    if any(name not in allowed for name in names):
        raise HTTPException(status_code=404, detail="Classe introuvable dans ce département")


def _validate_exam_fks(db: Session, *, tenant_id: str, department_id: str, user: dict,
                        class_id: Optional[str], subject_id: str, term_id: str) -> None:
    """DATA-INTEGRITY FIX (institutional-readiness audit, 2026-09):
    create_exam/update_exam inserted class_id/subject_id/term_id verbatim
    with no check they even belong to the caller's tenant, let alone (for
    class_id) the caller's own department — any department head/member
    could attach an exam to another department's classroom, or to a
    stray/cross-tenant UUID. subject_id/term_id are tenant-wide dropdowns
    in this portal (get_department_dashboard lists ALL tenant subjects/
    terms, not department-scoped ones), so those two are only checked
    against the tenant; class_id must be one of the department's own
    classrooms (classroom_departments), matching this portal's own
    dashboard/exam-list scoping.
    """
    if class_id and class_id not in _get_department_classroom_ids(db, department_id, tenant_id, user):
        raise HTTPException(status_code=404, detail="Classe introuvable dans ce département")
    if not class_id and is_cycle_restricted(user):
        # Q-P1 : un examen sans classe engage tout le département, donc d'autres cycles.
        raise HTTPException(status_code=403, detail=(
            "Un examen sans classe concerne tout le département : choisissez une classe de votre périmètre."))
    subject = db.execute(text(
        "SELECT id FROM subjects WHERE id = :id AND tenant_id = :tenant_id"
    ), {"id": subject_id, "tenant_id": tenant_id}).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Matière introuvable dans cet établissement")
    term = db.execute(text(
        "SELECT id FROM terms WHERE id = :id AND tenant_id = :tenant_id"
    ), {"id": term_id, "tenant_id": tenant_id}).first()
    if not term:
        raise HTTPException(status_code=404, detail="Période introuvable dans cet établissement")


def _require_exam_writable(db: Session, exam_id: str, dept_id: str, tenant_id: str, user: dict) -> None:
    """Compte restreint : l'examen existant doit porter sur une classe de son périmètre (404
    identique à un examen inexistant) ; un examen sans classe (tout le département) n'est
    modifiable que par un compte non restreint (Q-P1)."""
    if not is_cycle_restricted(user):
        return
    row = db.execute(text(
        "SELECT class_id FROM exams WHERE id = :id AND tenant_id = :tid AND department_id = :dept"
    ), {"id": exam_id, "tid": tenant_id, "dept": dept_id}).first()
    class_ids = _get_department_classroom_ids(db, dept_id, tenant_id, user)
    if row is None or row.class_id is None or str(row.class_id) not in class_ids:
        raise HTTPException(status_code=404, detail="Examen introuvable")


# ─── My Department ────────────────────────────────────────────────────────────

@router.get("/my-department/")
def get_my_department(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Return the department associated with the current user."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")
        return dept
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting my department: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/members/")
def get_department_membership(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The current user's own department membership, shaped as a
    join-row array (`department_id` + nested `departments`) — the shape
    DepartmentReports.tsx/DepartmentAlertHistory.tsx/
    DepartmentExamCalendar.tsx have always expected from this exact path.

    Permissions/completeness audit (2026-09): this endpoint never existed
    at all, so all three pages 404'd on their very first query. Any
    `user_id`/`tenant_id` query params the frontend sends are ignored —
    same as every other endpoint in this router, scoped to the caller via
    get_current_user()/resolve_current_tenant_id(), never a client-
    supplied id.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    dept = _get_user_department(db, user_id, tenant_id)
    if not dept:
        return []
    return [{
        "department_id": str(dept["id"]),
        "departments": {
            "id": str(dept["id"]), "name": dept["name"],
            "code": dept["code"], "description": dept["description"],
        },
    }]


# ─── Department Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard/")
def department_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """
        Aggregate dashboard stats for the current user's department.
        Returns: department info, stats (students, teachers, subjects, attendance),
                 recent grade activity.
        """
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        department_id = dept["id"]
        class_ids = _get_department_classroom_ids(db, department_id, tenant_id, current_user)

        stats = {
            "totalStudents": 0,
            "totalTeachers": 0,
            "totalSubjects": 0,
            "attendanceRate": 0,
            "upcomingExams": 0,
            "pendingGrades": 0,
        }
        recent_activities = []

        if class_ids:
            params_cls = {"tenant_id": tenant_id, "class_ids": class_ids}

            # Students
            stats["totalStudents"] = db.execute(text("""
                SELECT COUNT(DISTINCT e.student_id) FROM enrollments e
                WHERE e.class_id = ANY(:class_ids) AND UPPER(e.status) = 'ACTIVE'
                  AND e.tenant_id = :tenant_id
            """), params_cls).scalar() or 0

            # Teachers
            stats["totalTeachers"] = db.execute(text("""
                SELECT COUNT(DISTINCT ta.user_id) FROM teacher_assignments ta
                WHERE ta.classroom_id = ANY(:class_ids) AND ta.tenant_id = :tenant_id
            """), params_cls).scalar() or 0

            # Subjects
            stats["totalSubjects"] = db.execute(text("""
                SELECT COUNT(DISTINCT ta.subject_id) FROM teacher_assignments ta
                WHERE ta.classroom_id = ANY(:class_ids) AND ta.tenant_id = :tenant_id
            """), params_cls).scalar() or 0

            # Attendance (last 30 days)
            thirty_ago = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
            att = db.execute(text("""
                SELECT status FROM attendance
                WHERE classroom_id = ANY(:class_ids) AND tenant_id = :tenant_id AND date >= :since
            """), {"class_ids": class_ids, "tenant_id": tenant_id, "since": thirty_ago}).fetchall()
            total_att = len(att)
            present = sum(1 for a in att if a.status == "PRESENT")
            stats["attendanceRate"] = round((present / total_att) * 100) if total_att else 0

            # Upcoming exams
            # Q-P1 : examens d'une classe visible, ou sans classe (portée département).
            stats["upcomingExams"] = db.execute(text("""
                SELECT COUNT(*) FROM exams
                WHERE department_id = :dept_id AND tenant_id = :tenant_id
                  AND exam_date >= CURRENT_DATE AND status = 'scheduled'
                  AND (class_id IS NULL OR class_id = ANY(:class_ids))
            """), {"dept_id": department_id, "tenant_id": tenant_id, "class_ids": class_ids}).scalar() or 0

            # Recent grades (last 5) — limitées aux élèves inscrits dans les
            # classes du département (auparavant : tout l'établissement).
            grades = db.execute(text("""
                SELECT g.id, g.score, g.created_at,
                       s.first_name, s.last_name,
                       a.name AS assessment_name,
                       sub.name AS subject_name
                FROM grades g
                JOIN students s ON s.id = g.student_id
                JOIN assessments a ON a.id = g.assessment_id
                JOIN subjects sub ON sub.id = a.subject_id
                WHERE g.tenant_id = :tenant_id
                  AND EXISTS (
                      SELECT 1 FROM enrollments e
                      WHERE e.student_id = g.student_id AND e.tenant_id = g.tenant_id
                        AND e.class_id = ANY(:class_ids) AND UPPER(e.status) = 'ACTIVE'
                  )
                ORDER BY g.created_at DESC
                LIMIT 5
            """), params_cls).fetchall()

            recent_activities = [{
                "type": "grade",
                "description": f"{r.last_name} {r.first_name} — {r.assessment_name}: {r.score}/20",
                "time": r.created_at.isoformat() if r.created_at else None,
            } for r in grades]

        return {
            "department": dept,
            "stats": stats,
            "recent_activities": recent_activities,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error in department dashboard: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Classrooms ────────────────────────────────────────────────────

@router.get("/classrooms/")
def department_classrooms(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List classrooms linked to the current user's department."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)
        if not class_ids:
            return []
        rows = db.execute(text("""
            SELECT c.id, c.name, c.level_id, c.capacity,
                   l.name AS level_name
            FROM classroom_departments cd
            JOIN classes c ON c.id = cd.class_id AND c.tenant_id = cd.tenant_id
            LEFT JOIN levels l ON l.id = c.level_id
            WHERE cd.department_id = :dept_id AND cd.tenant_id = :tenant_id
              AND cd.class_id = ANY(:class_ids)
            ORDER BY c.name
        """), {"dept_id": dept["id"], "tenant_id": tenant_id, "class_ids": class_ids}).fetchall()

        return [{
            "id": str(r.id), "name": r.name, "level_id": str(r.level_id) if r.level_id else None,
            # `section` n'existe pas en base : conservé à null pour le contrat.
            "capacity": r.capacity, "section": None, "level_name": r.level_name,
        } for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error listing department classrooms: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Students ──────────────────────────────────────────────────────

@router.get("/students/")
def department_students(
    request: Request,
    classroom_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List students enrolled in the department's classrooms."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)
        if not class_ids:
            return {"students": [], "classrooms": []}

        # Classrooms list for filter dropdown
        classrooms = db.execute(text("""
            SELECT id, name FROM classrooms
            WHERE id = ANY(:ids) ORDER BY name
        """), {"ids": class_ids}).fetchall()

        filters = "AND e.class_id = ANY(:class_ids)"
        params: dict = {"tenant_id": tenant_id, "class_ids": class_ids}

        if classroom_id:
            _require_department_class(classroom_id, class_ids)
            filters = "AND e.class_id = :classroom_id"
            params["classroom_id"] = classroom_id

        search_filter = ""
        if search:
            search_filter = " AND (s.first_name ILIKE :search OR s.last_name ILIKE :search OR s.registration_number ILIKE :search)"
            params["search"] = f"%{search}%"

        rows = db.execute(text(f"""
            SELECT DISTINCT s.id, s.first_name, s.last_name, s.registration_number,
                   s.email, s.phone, s.photo_url,
                   c.id AS class_id, c.name AS class_name
            FROM enrollments e
            JOIN students s ON s.id = e.student_id
            JOIN classrooms c ON c.id = e.class_id
            WHERE e.tenant_id = :tenant_id AND UPPER(e.status) = 'ACTIVE'
            {filters} {search_filter}
            ORDER BY s.last_name, s.first_name
        """), params).fetchall()

        return {
            "students": [{
                "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
                "registration_number": r.registration_number, "email": r.email,
                "phone": r.phone, "photo_url": r.photo_url,
                "classroom": {"id": str(r.class_id), "name": r.class_name},
            } for r in rows],
            "classrooms": [{"id": str(c.id), "name": c.name} for c in classrooms],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error listing department students: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Teachers ──────────────────────────────────────────────────────

@router.get("/teachers/")
def department_teachers(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List teachers assigned to the department's classrooms with subjects & hours."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)
        if not class_ids:
            return {"teachers": [], "department": dept}

        rows = db.execute(text("""
            SELECT DISTINCT
                u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
                array_agg(DISTINCT sub.name) FILTER (WHERE sub.name IS NOT NULL) AS subjects,
                array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS classrooms,
                COUNT(DISTINCT ta.id) AS assignment_count
            FROM teacher_assignments ta
            JOIN users u ON u.id = ta.user_id
            LEFT JOIN subjects sub ON sub.id = ta.subject_id
            LEFT JOIN classrooms c ON c.id = ta.classroom_id
            WHERE ta.classroom_id = ANY(:class_ids) AND ta.tenant_id = :tenant_id
            GROUP BY u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url
            ORDER BY u.last_name
        """), {"class_ids": class_ids, "tenant_id": tenant_id}).fetchall()

        # Hours for current month
        start_month = datetime.date.today().replace(day=1).isoformat()
        end_month = (datetime.date.today().replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)

        hours_rows = db.execute(text("""
            SELECT teacher_id, SUM(hours_worked) AS total_hours
            FROM teacher_work_hours
            WHERE class_id = ANY(:class_ids) AND tenant_id = :tenant_id
            AND work_date BETWEEN :start AND :end
            GROUP BY teacher_id
        """), {"class_ids": class_ids, "tenant_id": tenant_id,
               "start": start_month, "end": end_month.isoformat()}).fetchall()

        hours_map = {str(h.teacher_id): float(h.total_hours or 0) for h in hours_rows}

        return {
            "department": dept,
            "teachers": [{
                "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
                "email": r.email, "phone": r.phone, "avatar_url": r.avatar_url,
                "subjects": list(r.subjects or []),
                "classrooms_names": list(r.classrooms or []),
                "assignment_count": r.assignment_count,
                "hours_this_month": hours_map.get(str(r.id), 0.0),
            } for r in rows]
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error listing department teachers: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Attendance ────────────────────────────────────────────────────

@router.get("/attendance/")
def department_attendance(
    request: Request,
    period: str = Query("week", pattern="^(week|month)$"),
    classroom_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Attendance records for the department's classrooms."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)
        if not class_ids:
            return {"records": [], "stats": {}, "classrooms": []}

        today = datetime.date.today()
        if period == "week":
            # Start of current week (Monday)
            start = today - datetime.timedelta(days=today.weekday())
            end = start + datetime.timedelta(days=6)
        else:
            start = today.replace(day=1)
            next_month = (today.replace(day=28) + datetime.timedelta(days=4))
            end = next_month.replace(day=1) - datetime.timedelta(days=1)

        classrooms = db.execute(text("""
            SELECT id, name FROM classrooms WHERE id = ANY(:ids) ORDER BY name
        """), {"ids": class_ids}).fetchall()

        params: dict = {
            "tenant_id": tenant_id, "start": start.isoformat(), "end": end.isoformat()
        }

        if classroom_id:
            _require_department_class(classroom_id, class_ids)
            class_filter = "AND a.classroom_id = :classroom_id"
            params["classroom_id"] = classroom_id
        else:
            class_filter = "AND a.classroom_id = ANY(:class_ids)"
            params["class_ids"] = class_ids

        rows = db.execute(text(f"""
            SELECT a.id, a.date, a.status, a.reason,
                   s.id AS student_id, s.first_name, s.last_name, s.registration_number,
                   c.id AS class_id, c.name AS class_name
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN classrooms c ON c.id = a.classroom_id
            WHERE a.tenant_id = :tenant_id
            AND a.date BETWEEN :start AND :end
            {class_filter}
            ORDER BY a.date DESC, s.last_name
            LIMIT 500
        """), params).fetchall()

        records = [{
            "id": str(r.id), "date": r.date.isoformat() if r.date else None,
            "status": r.status, "notes": r.reason,
            "students": {"first_name": r.first_name, "last_name": r.last_name, "registration_number": r.registration_number},
            "classrooms": {"name": r.class_name},
        } for r in rows]

        total = len(records)
        present = sum(1 for r in records if r["status"] == "PRESENT")
        absent = sum(1 for r in records if r["status"] == "ABSENT")
        late = sum(1 for r in records if r["status"] == "LATE")
        excused = sum(1 for r in records if r["status"] == "EXCUSED")

        return {
            "department": dept,
            "classrooms": [{"id": str(c.id), "name": c.name} for c in classrooms],
            "records": records,
            "stats": {
                "total": total, "present": present, "absent": absent,
                "late": late, "excused": excused,
                "attendance_rate": round(((present + late) / total) * 100, 1) if total else 0,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting department attendance: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Exams ─────────────────────────────────────────────────────────

@router.get("/exams/")
def department_exams(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List all exams for the department + subjects, terms, classrooms for the form."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)

        exams = db.execute(text("""
            SELECT e.id, e.name, e.description, e.exam_date, e.start_time, e.end_time,
                   e.room_name, e.max_score, e.status, e.class_id, e.subject_id, e.term_id,
                   e.department_id,
                   c.name AS classroom_name,
                   sub.name AS subject_name,
                   t.name AS term_name
            FROM exams e
            LEFT JOIN classrooms c ON c.id = e.class_id
            LEFT JOIN subjects sub ON sub.id = e.subject_id
            LEFT JOIN terms t ON t.id = e.term_id
            WHERE e.tenant_id = :tenant_id AND e.department_id = :dept_id
              AND (e.class_id IS NULL OR e.class_id = ANY(:class_ids))
            ORDER BY e.exam_date ASC
        """), {"tenant_id": tenant_id, "dept_id": dept["id"], "class_ids": class_ids}).fetchall()

        classrooms = db.execute(text("""
            SELECT c.id, c.name FROM classrooms c
            WHERE c.id = ANY(:ids) ORDER BY c.name
        """), {"ids": class_ids}).fetchall() if class_ids else []

        subjects = db.execute(text("""
            SELECT id, name FROM subjects WHERE tenant_id = :tenant_id ORDER BY name
        """), {"tenant_id": tenant_id}).fetchall()

        terms = db.execute(text("""
            SELECT id, name FROM terms WHERE tenant_id = :tenant_id ORDER BY name
        """), {"tenant_id": tenant_id}).fetchall()

        return {
            "department": dept,
            "exams": [{
                "id": str(e.id), "name": e.name, "description": e.description,
                "exam_date": e.exam_date.isoformat() if e.exam_date else None,
                "start_time": str(e.start_time) if e.start_time else None,
                "end_time": str(e.end_time) if e.end_time else None,
                "room_name": e.room_name, "max_score": float(e.max_score or 20),
                "status": e.status,
                "class_id": str(e.class_id) if e.class_id else None,
                "subject_id": str(e.subject_id) if e.subject_id else None,
                "term_id": str(e.term_id) if e.term_id else None,
                "classroom": {"name": e.classroom_name} if e.classroom_name else None,
                "subject": {"name": e.subject_name} if e.subject_name else None,
                "term": {"name": e.term_name} if e.term_name else None,
            } for e in exams],
            "classrooms": [{"id": str(c.id), "name": c.name} for c in classrooms],
            "subjects": [{"id": str(s.id), "name": s.name} for s in subjects],
            "terms": [{"id": str(t.id), "name": t.name} for t in terms],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error listing department exams: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.post("/exams/", status_code=status.HTTP_201_CREATED)
def create_exam(
    request: Request,
    body: ExamCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Create an exam for the current user's department."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")
        _validate_exam_fks(db, tenant_id=tenant_id, department_id=dept["id"], user=current_user,
                            class_id=body.class_id, subject_id=body.subject_id, term_id=body.term_id)

        # `title` is a leftover NOT NULL column from exams' original
        # migration — nothing in this router reads it, but the INSERT
        # must still satisfy the constraint, so it mirrors `name` (the
        # actual field this router's schema/SELECT/RETURNING use).
        exam_id = db.execute(text("""
            INSERT INTO exams (tenant_id, department_id, name, title, description, exam_date,
                               start_time, end_time, room_name, max_score, status,
                               class_id, subject_id, term_id, created_by, created_at)
            VALUES (:tenant_id, :dept_id, :name, :name, :description, :exam_date,
                    :start_time, :end_time, :room_name, :max_score, :status,
                    :class_id, :subject_id, :term_id, :created_by, NOW())
            RETURNING id
        """), {
            "tenant_id": tenant_id, "dept_id": dept["id"],
            "name": body.name, "description": body.description,
            "exam_date": body.exam_date,
            "start_time": body.start_time, "end_time": body.end_time,
            "room_name": body.room_name, "max_score": body.max_score,
            "status": body.status,
            "class_id": body.class_id, "subject_id": body.subject_id,
            "term_id": body.term_id, "created_by": user_id,
        }).scalar()
        db.commit()
        return {"id": str(exam_id), "message": "Examen créé"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error creating exam: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.put("/exams/{exam_id}/")
def update_exam(
    request: Request,
    exam_id: str,
    body: ExamCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Update an exam."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")
        _require_exam_writable(db, exam_id, dept["id"], tenant_id, current_user)
        _validate_exam_fks(db, tenant_id=tenant_id, department_id=dept["id"], user=current_user,
                            class_id=body.class_id, subject_id=body.subject_id, term_id=body.term_id)

        result = db.execute(text("""
            UPDATE exams SET
                name = :name, description = :description, exam_date = :exam_date,
                start_time = :start_time, end_time = :end_time, room_name = :room_name,
                max_score = :max_score, status = :status,
                class_id = :class_id, subject_id = :subject_id, term_id = :term_id
            WHERE id = :exam_id AND tenant_id = :tenant_id AND department_id = :dept_id
        """), {
            "exam_id": exam_id, "tenant_id": tenant_id, "dept_id": dept["id"],
            "name": body.name, "description": body.description, "exam_date": body.exam_date,
            "start_time": body.start_time, "end_time": body.end_time,
            "room_name": body.room_name, "max_score": body.max_score,
            "status": body.status, "class_id": body.class_id,
            "subject_id": body.subject_id, "term_id": body.term_id,
        })
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Examen introuvable")
        return {"message": "Examen mis à jour"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating exam: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.delete("/exams/{exam_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    request: Request,
    exam_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Delete an exam."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")
        _require_exam_writable(db, exam_id, dept["id"], tenant_id, current_user)

        result = db.execute(text("""
            DELETE FROM exams WHERE id = :exam_id AND tenant_id = :tenant_id AND department_id = :dept_id
        """), {"exam_id": exam_id, "tenant_id": tenant_id, "dept_id": dept["id"]})
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Examen introuvable")
        return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting exam: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Schedule ──────────────────────────────────────────────────────

@router.get("/schedule/")
def department_schedule(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Return schedule for all department classrooms."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)
        if not class_ids:
            return {"department": dept, "schedule": []}

        rows = db.execute(text("""
            SELECT s.id, s.day_of_week, s.start_time, s.end_time,
                   sub.name AS subject_name,
                   u.first_name AS teacher_first, u.last_name AS teacher_last,
                   c.name AS classroom_name
            FROM schedule s
            LEFT JOIN subjects sub ON sub.id = s.subject_id
            LEFT JOIN users u ON u.id = s.teacher_id
            LEFT JOIN classrooms c ON c.id = s.class_id
            WHERE s.class_id = ANY(:class_ids) AND s.tenant_id = :tenant_id
            ORDER BY s.day_of_week, s.start_time
        """), {"class_ids": class_ids, "tenant_id": tenant_id}).fetchall()

        return {
            "department": dept,
            "schedule": [{
                "id": str(r.id), "day_of_week": r.day_of_week,
                "start_time": str(r.start_time), "end_time": str(r.end_time),
                "subject": {"name": r.subject_name},
                "teacher": {"first_name": r.teacher_first, "last_name": r.teacher_last},
                "classroom": {"name": r.classroom_name},
            } for r in rows]
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting department schedule: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Reports ───────────────────────────────────────────────────────

@router.get("/reports/grades/")
def department_grades_report(
    request: Request,
    term_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Grade summary report for the department."""
        tenant_id = str(resolve_current_tenant_id(request, current_user, db))
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id, current_user)
        if not class_ids:
            return {"department": dept, "grades": []}

        params: dict = {"tenant_id": tenant_id, "class_ids": class_ids}
        filters = "AND e.class_id = ANY(:class_ids)"

        if classroom_id:
            _require_department_class(classroom_id, class_ids)
            filters = "AND e.class_id = :classroom_id"
            params["classroom_id"] = classroom_id

        term_filter = ""
        if term_id:
            term_filter = "AND a.term_id = :term_id"
            params["term_id"] = term_id

        rows = db.execute(text(f"""
            SELECT s.id AS student_id, s.first_name, s.last_name, s.registration_number,
                   c.name AS classroom_name,
                   AVG(g.score) AS avg_score,
                   COUNT(g.id) AS grade_count,
                   MAX(g.score) AS max_score,
                   MIN(g.score) AS min_score
            FROM students s
            JOIN enrollments e ON e.student_id = s.id AND UPPER(e.status) = 'ACTIVE'
            JOIN classrooms c ON c.id = e.class_id
            LEFT JOIN grades g ON g.student_id = s.id AND g.tenant_id = :tenant_id
            LEFT JOIN assessments a ON a.id = g.assessment_id {term_filter}
            WHERE e.tenant_id = :tenant_id {filters}
            GROUP BY s.id, s.first_name, s.last_name, s.registration_number, c.name
            ORDER BY avg_score DESC NULLS LAST
        """), params).fetchall()

        return {
            "department": dept,
            "grades": [{
                "student_id": str(r.student_id),
                "first_name": r.first_name, "last_name": r.last_name,
                "registration_number": r.registration_number,
                "classroom_name": r.classroom_name,
                "avg_score": round(float(r.avg_score), 2) if r.avg_score else None,
                "grade_count": r.grade_count or 0,
                "max_score": float(r.max_score) if r.max_score else None,
                "min_score": float(r.min_score) if r.min_score else None,
            } for r in rows]
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting department grades report: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/reports/stats/")
def department_report_stats(
    request: Request,
    class_ids: str = Query(""),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Aggregate statistics for DepartmentReports.tsx: student/teacher
    counts, attendance (overall and per class), average grade, exams and
    export data for the selected period — scoped to the department's own
    classrooms.

    Permissions/completeness audit (2026-09): this endpoint never existed,
    so the Reports page's every query 404'd from the moment a classroom
    was selected. `class_ids` from the client is intersected with the
    department's own classroom ids (`_get_department_classroom_ids`) —
    never trusted outright, same as every ownership check elsewhere in
    this router.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        dept_class_ids = set(_get_department_classroom_ids(db, dept["id"], tenant_id, current_user))
        requested_ids = [c for c in class_ids.split(",") if c]
        scoped_class_ids = [c for c in requested_ids if c in dept_class_ids] or list(dept_class_ids)
        if not scoped_class_ids:
            return {
                "department": dept, "studentCount": 0, "teacherCount": 0,
                "attendance": {"present": 0, "absent": 0, "late": 0, "total": 0, "rate": 0},
                "attendancePerClass": {}, "averageGrade": 0, "studentsPerClass": [],
                "teachers": [], "exams": [], "academicYear": None,
            }

        start = start_date or "1900-01-01"
        end = end_date or "2999-12-31"

        academic_year = db.execute(text(
            "SELECT name FROM academic_years WHERE tenant_id = :tid AND is_current = true LIMIT 1"
        ), {"tid": tenant_id}).scalar()

        student_count = db.execute(text("""
            SELECT COUNT(DISTINCT e.student_id) FROM enrollments e
            WHERE e.tenant_id = :tid AND UPPER(e.status) = 'ACTIVE' AND e.class_id = ANY(:cids)
        """), {"tid": tenant_id, "cids": scoped_class_ids}).scalar() or 0

        teacher_rows = db.execute(text("""
            SELECT DISTINCT u.id, u.first_name, u.last_name
            FROM teacher_assignments ta
            JOIN users u ON u.id = ta.user_id
            WHERE ta.tenant_id = :tid AND ta.classroom_id = ANY(:cids)
        """), {"tid": tenant_id, "cids": scoped_class_ids}).fetchall()

        students_per_class_rows = db.execute(text("""
            SELECT c.id AS class_id, c.name, COUNT(e.student_id) AS count
            FROM classrooms c
            LEFT JOIN enrollments e ON e.class_id = c.id AND UPPER(e.status) = 'ACTIVE' AND e.tenant_id = :tid
            WHERE c.id = ANY(:cids)
            GROUP BY c.id, c.name
            ORDER BY c.name
        """), {"tid": tenant_id, "cids": scoped_class_ids}).fetchall()

        attendance_rows = db.execute(text("""
            SELECT a.classroom_id, a.status, COUNT(*) AS cnt
            FROM attendance a
            WHERE a.tenant_id = :tid AND a.classroom_id = ANY(:cids)
              AND a.date BETWEEN :start AND :end
            GROUP BY a.classroom_id, a.status
        """), {"tid": tenant_id, "cids": scoped_class_ids, "start": start, "end": end}).fetchall()

        attendance_per_class: dict = {}
        total_present = total_absent = total_late = 0
        for row in attendance_rows:
            cid = str(row.classroom_id)
            bucket = attendance_per_class.setdefault(cid, {"present": 0, "late": 0, "total": 0})
            bucket["total"] += row.cnt
            if row.status == "PRESENT":
                bucket["present"] += row.cnt
                total_present += row.cnt
            elif row.status == "LATE":
                bucket["late"] += row.cnt
                total_late += row.cnt
            elif row.status == "ABSENT":
                total_absent += row.cnt
        total_attendance = sum(b["total"] for b in attendance_per_class.values())

        avg_grade = db.execute(text("""
            SELECT AVG(g.score) FROM grades g
            JOIN enrollments e ON e.student_id = g.student_id AND UPPER(e.status) = 'ACTIVE'
            WHERE g.tenant_id = :tid AND e.class_id = ANY(:cids)
        """), {"tid": tenant_id, "cids": scoped_class_ids}).scalar()

        exam_rows = db.execute(text("""
            SELECT e.id, e.name, e.exam_date, e.status, sub.name AS subject_name
            FROM exams e
            LEFT JOIN subjects sub ON sub.id = e.subject_id
            WHERE e.tenant_id = :tid AND e.class_id = ANY(:cids)
              AND e.exam_date BETWEEN :start AND :end
            ORDER BY e.exam_date ASC
        """), {"tid": tenant_id, "cids": scoped_class_ids, "start": start, "end": end}).fetchall()

        return {
            "department": dept,
            "studentCount": student_count,
            "teacherCount": len(teacher_rows),
            "attendance": {
                "present": total_present, "absent": total_absent, "late": total_late,
                "total": total_attendance,
                "rate": round(((total_present + total_late) / total_attendance) * 100, 1) if total_attendance else 0,
            },
            "attendancePerClass": attendance_per_class,
            "averageGrade": round(float(avg_grade), 2) if avg_grade else 0,
            "studentsPerClass": [{"name": r.name, "count": r.count} for r in students_per_class_rows],
            "teachers": [{"first_name": r.first_name, "last_name": r.last_name} for r in teacher_rows],
            "exams": [{
                "id": str(r.id), "name": r.name,
                "exam_date": r.exam_date.isoformat() if r.exam_date else None,
                "status": r.status, "subjects": {"name": r.subject_name},
            } for r in exam_rows],
            "academicYear": academic_year,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting department report stats: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Department Alerts ─────────────────────────────────────────────────────────

@router.post("/alerts/send/")
def send_department_alert_email(
    request: Request,
    payload: DepartmentAlertSend,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Email the low-attendance alert to the department head who triggered
    it (DepartmentReports.tsx's "Envoyer alerte par email").

    Permissions/completeness audit (2026-09): this route never existed, so
    the button always failed. Sends to the caller's own email — the
    frontend's departmentId/tenantId/tenantName fields are accepted but
    ignored, re-derived from the authenticated session instead, so a
    department head can never be tricked (or trick themselves) into
    emailing another department's alert to someone else. No-ops (still
    200) if the caller has no email on file or no mail provider is
    configured, same fallback convention as the existing platform-health
    alert email (see parents.py's own ALERT_EMAIL no-op).
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    dept = _get_user_department(db, user_id, tenant_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Aucun département assigné")

    _require_alert_classes_in_scope(db, dept["id"], tenant_id, current_user,
                                    [a.classroomName for a in payload.alerts])

    recipient = db.execute(text(
        "SELECT email, first_name FROM users WHERE id = :id AND tenant_id = :tid"
    ), {"id": user_id, "tid": tenant_id}).mappings().first()

    email_sent = False
    esc = lambda value: _html.escape(str(value), quote=True)  # noqa: E731 — saisies du client dans du HTML
    if recipient and recipient["email"] and (settings.RESEND_API_KEY or settings.SMTP_HOST):
        rows_html = "".join(
            f"<tr><td>{esc(a.classroomName)}</td><td>{esc(a.rate)}%</td>"
            f"<td>{a.absent if a.absent is not None else '-'} / {a.total if a.total is not None else '-'}</td></tr>"
            for a in payload.alerts
        )
        html = (
            f"<p>Bonjour {esc(recipient['first_name'] or '')},</p>"
            f"<p>Le taux de présence est passé sous le seuil d'alerte pour les classes "
            f"suivantes de votre département <strong>{esc(dept['name'])}</strong> "
            f"({esc(payload.periodLabel)}) :</p>"
            f"<table border='1' cellpadding='6' style='border-collapse:collapse'>"
            f"<tr><th>Classe</th><th>Taux</th><th>Absences / Total</th></tr>{rows_html}</table>"
        )
        try:
            sender = EmailSender(
                resend_api_key=settings.RESEND_API_KEY, smtp_host=settings.SMTP_HOST,
                smtp_port=settings.SMTP_PORT, smtp_user=settings.SMTP_USER,
                smtp_pass=settings.SMTP_PASS, from_email=settings.FROM_EMAIL,
                from_name=settings.FROM_NAME,
            )
            email_sent = sender.send(
                recipient["email"], f"Alerte de présence — {dept['name']}", html,
            )
        except Exception as e:
            logger.warning("Department alert email failed: %s", e)

    return {"email_sent": email_sent}


@router.post("/alerts/", status_code=status.HTTP_201_CREATED)
def create_department_alert(
    request: Request,
    payload: DepartmentAlertCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Persist a sent alert to the department's history
    (DepartmentAlertHistory.tsx). `sent_by` is always the caller — never a
    client-supplied user id."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    dept = _get_user_department(db, user_id, tenant_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Aucun département assigné")

    _require_alert_classes_in_scope(db, dept["id"], tenant_id, current_user,
                                    [a.classroomName for a in payload.alerts_data])

    import json as _json
    row = db.execute(text("""
        INSERT INTO department_alerts
            (tenant_id, department_id, sent_by, alert_type, period_label, alerts_data, email_sent)
        VALUES (:tid, :dept_id, :sent_by, :alert_type, :period_label, cast(:alerts_data AS jsonb), :email_sent)
        RETURNING id, tenant_id, department_id, sent_by, alert_type, period_label, alerts_data, email_sent, created_at
    """), {
        "tid": tenant_id, "dept_id": dept["id"], "sent_by": user_id,
        "alert_type": payload.alert_type, "period_label": payload.period_label,
        "alerts_data": _json.dumps([a.model_dump() for a in payload.alerts_data]),
        "email_sent": payload.email_sent,
    }).mappings().first()
    db.commit()
    return dict(row)


@router.get("/alerts/")
def list_department_alerts(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The department's alert history — any client-supplied
    `department_id` is ignored, always scoped to the caller's own
    department."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    dept = _get_user_department(db, user_id, tenant_id)
    if not dept:
        return []

    rows = db.execute(text("""
        SELECT da.id, da.alert_type, da.period_label, da.alerts_data, da.email_sent, da.created_at,
               u.first_name, u.last_name
        FROM department_alerts da
        LEFT JOIN users u ON u.id = da.sent_by
        WHERE da.tenant_id = :tid AND da.department_id = :dept_id
        ORDER BY da.created_at DESC
        LIMIT :limit
    """), {"tid": tenant_id, "dept_id": dept["id"], "limit": limit}).fetchall()

    if is_cycle_restricted(current_user):
        # Q-P2 : une alerte n'est visible que si TOUTES ses classes sont dans le périmètre.
        allowed = _department_class_names(db, _get_department_classroom_ids(db, dept["id"], tenant_id, current_user))
        rows = [r for r in rows
                if all(isinstance(a, dict) and a.get("classroomName") in allowed for a in (r.alerts_data or []))]

    return [{
        "id": str(r.id), "alert_type": r.alert_type, "period_label": r.period_label,
        "alerts_data": r.alerts_data, "email_sent": r.email_sent,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "sent_to_profile": {"first_name": r.first_name, "last_name": r.last_name} if r.first_name else None,
    } for r in rows]
