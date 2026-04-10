"""Department Portal endpoints — full sovereign API for department heads/members."""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Any
from pydantic import BaseModel
import datetime

from app.core.database import get_db
from app.core.security import get_current_user

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


def _get_department_classroom_ids(db: Session, department_id: str, tenant_id: str) -> list:
    rows = db.execute(text("""
        SELECT class_id FROM classroom_departments
        WHERE department_id = :dept_id AND tenant_id = :tenant_id
    """), {"dept_id": department_id, "tenant_id": tenant_id}).fetchall()
    return [str(r.class_id) for r in rows]


# ─── My Department ────────────────────────────────────────────────────────────

@router.get("/my-department/")
def get_my_department(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Return the department associated with the current user."""
        tenant_id = current_user.get("tenant_id")
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
        logger.error(f"Error getting my department: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard/")
def department_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """
        Aggregate dashboard stats for the current user's department.
        Returns: department info, stats (students, teachers, subjects, attendance),
                 recent grade activity.
        """
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        department_id = dept["id"]
        class_ids = _get_department_classroom_ids(db, department_id, tenant_id)

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
                WHERE e.class_id = ANY(:class_ids) AND e.status = 'active'
            """), params_cls).scalar() or 0

            # Teachers
            stats["totalTeachers"] = db.execute(text("""
                SELECT COUNT(DISTINCT ta.teacher_id) FROM teacher_assignments ta
                WHERE ta.class_id = ANY(:class_ids) AND ta.tenant_id = :tenant_id
            """), params_cls).scalar() or 0

            # Subjects
            stats["totalSubjects"] = db.execute(text("""
                SELECT COUNT(DISTINCT ta.subject_id) FROM teacher_assignments ta
                WHERE ta.class_id = ANY(:class_ids) AND ta.tenant_id = :tenant_id
            """), params_cls).scalar() or 0

            # Attendance (last 30 days)
            thirty_ago = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
            att = db.execute(text("""
                SELECT status FROM attendance
                WHERE class_id = ANY(:class_ids) AND date >= :since
            """), {"class_ids": class_ids, "since": thirty_ago}).fetchall()
            total_att = len(att)
            present = sum(1 for a in att if a.status == "PRESENT")
            stats["attendanceRate"] = round((present / total_att) * 100) if total_att else 0

            # Upcoming exams
            stats["upcomingExams"] = db.execute(text(f"""
                SELECT COUNT(*) FROM exams
                WHERE department_id = :dept_id AND exam_date >= CURRENT_DATE AND status = 'scheduled'
            """), {"dept_id": department_id}).scalar() or 0

            # Recent grades (last 5)
            grades = db.execute(text(f"""
                SELECT g.id, g.score, g.created_at,
                       s.first_name, s.last_name,
                       a.name AS assessment_name,
                       sub.name AS subject_name
                FROM grades g
                JOIN students s ON s.id = g.student_id
                JOIN assessments a ON a.id = g.assessment_id
                JOIN subjects sub ON sub.id = a.subject_id
                WHERE g.tenant_id = :tenant_id
                ORDER BY g.created_at DESC
                LIMIT 5
            """), {"tenant_id": tenant_id}).fetchall()

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
        logger.error(f"Error in department dashboard: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Classrooms ────────────────────────────────────────────────────

@router.get("/classrooms/")
def department_classrooms(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List classrooms linked to the current user's department."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        rows = db.execute(text("""
            SELECT c.id, c.name, c.level_id, c.capacity, c.section,
                   l.name AS level_name
            FROM classroom_departments cd
            JOIN classrooms c ON c.id = cd.class_id
            LEFT JOIN levels l ON l.id = c.level_id
            WHERE cd.department_id = :dept_id AND cd.tenant_id = :tenant_id
            ORDER BY c.name
        """), {"dept_id": dept["id"], "tenant_id": tenant_id}).fetchall()

        return [{
            "id": str(r.id), "name": r.name, "level_id": str(r.level_id) if r.level_id else None,
            "capacity": r.capacity, "section": r.section, "level_name": r.level_name,
        } for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing department classrooms: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Students ──────────────────────────────────────────────────────

@router.get("/students/")
def department_students(
    classroom_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List students enrolled in the department's classrooms."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id)
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
            WHERE e.tenant_id = :tenant_id AND e.status = 'active'
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
        logger.error(f"Error listing department students: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Teachers ──────────────────────────────────────────────────────

@router.get("/teachers/")
def department_teachers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List teachers assigned to the department's classrooms with subjects & hours."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id)
        if not class_ids:
            return {"teachers": [], "department": dept}

        rows = db.execute(text("""
            SELECT DISTINCT
                u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
                array_agg(DISTINCT sub.name) FILTER (WHERE sub.name IS NOT NULL) AS subjects,
                array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS classrooms,
                COUNT(DISTINCT ta.id) AS assignment_count
            FROM teacher_assignments ta
            JOIN users u ON u.id = ta.teacher_id
            LEFT JOIN subjects sub ON sub.id = ta.subject_id
            LEFT JOIN classrooms c ON c.id = ta.class_id
            WHERE ta.class_id = ANY(:class_ids) AND ta.tenant_id = :tenant_id
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
        logger.error(f"Error listing department teachers: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Attendance ────────────────────────────────────────────────────

@router.get("/attendance/")
def department_attendance(
    period: str = Query("week", pattern="^(week|month)$"),
    classroom_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Attendance records for the department's classrooms."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id)
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
            class_filter = "AND a.class_id = :classroom_id"
            params["classroom_id"] = classroom_id
        else:
            class_filter = "AND a.class_id = ANY(:class_ids)"
            params["class_ids"] = class_ids

        rows = db.execute(text(f"""
            SELECT a.id, a.date, a.status, a.notes,
                   s.id AS student_id, s.first_name, s.last_name, s.registration_number,
                   c.id AS class_id, c.name AS class_name
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN classrooms c ON c.id = a.class_id
            WHERE a.tenant_id = :tenant_id
            AND a.date BETWEEN :start AND :end
            {class_filter}
            ORDER BY a.date DESC, s.last_name
            LIMIT 500
        """), params).fetchall()

        records = [{
            "id": str(r.id), "date": r.date.isoformat() if r.date else None,
            "status": r.status, "notes": r.notes,
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
        logger.error(f"Error getting department attendance: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Exams ─────────────────────────────────────────────────────────

@router.get("/exams/")
def department_exams(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List all exams for the department + subjects, terms, classrooms for the form."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id)

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
            ORDER BY e.exam_date ASC
        """), {"tenant_id": tenant_id, "dept_id": dept["id"]}).fetchall()

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
        logger.error(f"Error listing department exams: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/exams/", status_code=status.HTTP_201_CREATED)
def create_exam(
    body: ExamCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Create an exam for the current user's department."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        exam_id = db.execute(text("""
            INSERT INTO exams (tenant_id, department_id, name, description, exam_date,
                               start_time, end_time, room_name, max_score, status,
                               class_id, subject_id, term_id, created_by, created_at)
            VALUES (:tenant_id, :dept_id, :name, :description, :exam_date,
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
        logger.error(f"Error creating exam: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.put("/exams/{exam_id}/")
def update_exam(
    exam_id: str,
    body: ExamCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Update an exam."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

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
        logger.error(f"Error updating exam: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.delete("/exams/{exam_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Delete an exam."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

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
        logger.error(f"Error deleting exam: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Schedule ──────────────────────────────────────────────────────

@router.get("/schedule/")
def department_schedule(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Return schedule for all department classrooms."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id)
        if not class_ids:
            return {"department": dept, "schedule": []}

        rows = db.execute(text("""
            SELECT s.id, s.day_of_week, s.start_time, s.end_time,
                   sub.name AS subject_name,
                   u.first_name AS teacher_first, u.last_name AS teacher_last,
                   c.name AS classroom_name
            FROM schedules s
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
        logger.error(f"Error getting department schedule: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ─── Department Reports ───────────────────────────────────────────────────────

@router.get("/reports/grades/")
def department_grades_report(
    term_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Grade summary report for the department."""
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        dept = _get_user_department(db, user_id, tenant_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Aucun département assigné")

        class_ids = _get_department_classroom_ids(db, dept["id"], tenant_id)
        if not class_ids:
            return {"department": dept, "grades": []}

        params: dict = {"tenant_id": tenant_id, "class_ids": class_ids}
        filters = "AND e.class_id = ANY(:class_ids)"

        if classroom_id:
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
            JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
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
        logger.error(f"Error getting department grades report: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
