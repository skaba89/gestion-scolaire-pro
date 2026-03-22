"""Analytics / KPI endpoints"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, text

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── helpers ─────────────────────────────────────────────────────────────────

def _resolve_academic_year(db: Session, tenant_id: str, ay_id: Optional[str]) -> Optional[str]:
    if not ay_id or ay_id == "current":
        sql = text("SELECT id FROM academic_years WHERE tenant_id = :tenant_id AND is_current = true LIMIT 1")
        row = db.execute(sql, {"tenant_id": tenant_id}).fetchone()
        return str(row.id) if row else None
    return ay_id


# ─── Financial KPIs ──────────────────────────────────────────────────────────

@router.get("/financial-kpis/")
def get_financial_kpis(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    start_date: Optional[str] = Query(None, description="ISO date string, e.g. 2025-01-01"),
    end_date: Optional[str] = Query(None, description="ISO date string, e.g. 2025-12-31"),
):
    """
    Financial KPIs: total revenue, paid revenue, pending revenue, collection rate.
    """
    tenant_id = str(current_user.get("tenant_id"))
    try:
        # Build dynamic date filter fragments
        date_conditions = ""
        params: dict = {"tenant_id": tenant_id}

        if start_date:
            date_conditions += " AND created_at >= :start_date"
            params["start_date"] = start_date
        if end_date:
            date_conditions += " AND created_at <= :end_date"
            params["end_date"] = end_date

        sql = text(f"""
            SELECT
                COALESCE(SUM(total_amount), 0)                                          AS total_revenue,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS paid_revenue,
                COALESCE(SUM(CASE WHEN status <> 'PAID' THEN total_amount ELSE 0 END), 0) AS pending_revenue
            FROM invoices
            WHERE tenant_id = :tenant_id {date_conditions}
        """)

        row = db.execute(sql, params).fetchone()
        
        total_revenue = float(row.total_revenue or 0) if row else 0.0
        paid_revenue = float(row.paid_revenue or 0) if row else 0.0
        pending_revenue = float(row.pending_revenue or 0) if row else 0.0
        collection_rate = (paid_revenue / total_revenue * 100) if total_revenue > 0 else 0.0

        # Outstanding by class
        class_sql = text("""
            SELECT
                c.id   AS class_id,
                c.name AS class_name,
                COALESCE(SUM(i.total_amount), 0) AS outstanding_amount
            FROM invoices i
            JOIN students s ON s.id = i.student_id
            JOIN enrollments ce ON ce.student_id = s.id
            JOIN classes c ON c.id = ce.class_id
            WHERE i.tenant_id = :tenant_id AND i.status <> 'PAID'
            GROUP BY c.id, c.name
            ORDER BY outstanding_amount DESC
            LIMIT 10
        """)
        class_rows = db.execute(class_sql, {"tenant_id": tenant_id}).fetchall()
        outstanding_by_class = [
            {"class_id": str(r.class_id), "class_name": r.class_name, "outstanding_amount": float(r.outstanding_amount)}
            for r in class_rows
        ]

        return {
            "totalRevenue": total_revenue,
            "paidRevenue": paid_revenue,
            "pendingRevenue": pending_revenue,
            "collectionRate": round(collection_rate, 2),
            "outstandingByClass": outstanding_by_class,
        }
    except Exception as e:
        logger.error(f"Error in get_financial_kpis: {str(e)}", exc_info=True)
        return {
            "totalRevenue": 0,
            "paidRevenue": 0,
            "pendingRevenue": 0,
            "collectionRate": 0,
            "outstandingByClass": []
        }


@router.get("/revenue-trend/")
def get_revenue_trend(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    months: int = Query(6, ge=1, le=24),
):
    """Revenue trend by month over the last N months."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        start_date = (datetime.utcnow() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

        sql = text("""
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS period,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS paid,
                COALESCE(SUM(CASE WHEN status <> 'PAID' THEN total_amount ELSE 0 END), 0) AS pending
            FROM invoices
            WHERE tenant_id = :tenant_id AND created_at >= :start_date
            GROUP BY period
            ORDER BY period ASC
        """)
        rows = db.execute(sql, {"tenant_id": tenant_id, "start_date": start_date}).fetchall()
        return [
            {
                "period": r.period,
                "month": r.period, # Alias for frontend
                "revenue": float(r.revenue or 0),
                "amount": float(r.revenue or 0),  # Alias for Recharts in DecisionDashboard
                "paid": float(r.paid or 0),
                "pending": float(r.pending or 0),
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error in get_revenue_trend: {str(e)}", exc_info=True)
        return []


# ─── Academic KPIs ───────────────────────────────────────────────────────────

@router.get("/academic-kpis/")
def get_academic_kpis(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    academic_year_id: Optional[str] = None,
):
    """Academic KPIs: success rate, average grade, students at risk."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        ay_id = _resolve_academic_year(db, tenant_id, academic_year_id)
        ay_filter = ""
        params: dict = {"tenant_id": tenant_id}
        if ay_id:
            ay_filter = " AND academic_year_id = :academic_year_id"
            params["academic_year_id"] = ay_id

        sql = text(f"""
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN score >= (max_score / 2.0) THEN 1 ELSE 0 END), 0) AS passing,
                COALESCE(AVG(score), 0) AS avg_grade
            FROM grades
            WHERE tenant_id = :tenant_id {ay_filter}
        """)
        row = db.execute(sql, params).fetchone()

        total = int(row.total or 0) if row else 0
        passing = int(row.passing or 0) if row else 0
        failing = max(0, total - passing)
        avg_grade = round(float(row.avg_grade or 0), 2) if row else 0.0
        success_rate = round((passing / total * 100) if total > 0 else 0.0, 2)

        return {
            "overallSuccessRate": success_rate,
            "totalStudents": total,
            "passingStudents": passing,
            "failingStudents": failing,
            "averageGrade": avg_grade,
        }
    except Exception as e:
        logger.error(f"Error in get_academic_kpis: {str(e)}", exc_info=True)
        return {
            "overallSuccessRate": 0,
            "totalStudents": 0,
            "passingStudents": 0,
            "failingStudents": 0,
            "averageGrade": 0.0,
        }


@router.get("/academic-stats/")
def get_academic_stats(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    academic_year_id: Optional[str] = None,
):
    """Success rate by class and by subject."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        ay_id = _resolve_academic_year(db, tenant_id, academic_year_id)
        
        params: dict = {"tenant_id": tenant_id}
        ay_filter = " AND g.academic_year_id = :academic_year_id" if ay_id else ""
        if ay_id:
            params["academic_year_id"] = ay_id

        by_subject_sql = text(f"""
            SELECT
                s.id   AS subject_id,
                s.name AS subject_name,
                COUNT(g.id) AS total,
                SUM(CASE WHEN g.score >= (g.max_score / 2.0) THEN 1 ELSE 0 END) AS passing,
                AVG(g.score) AS avg_grade
            FROM grades g
            JOIN subjects s ON s.id = g.subject_id
            WHERE g.tenant_id = :tenant_id {ay_filter}
            GROUP BY s.id, s.name
            ORDER BY subject_name
        """)

        by_class_sql = text(f"""
            SELECT
                c.id   AS class_id,
                c.name AS class_name,
                COUNT(g.id) AS total,
                SUM(CASE WHEN g.score >= (g.max_score / 2.0) THEN 1 ELSE 0 END) AS passing
            FROM grades g
            JOIN enrollments ce ON ce.student_id = g.student_id
            JOIN classes c ON c.id = ce.class_id
            WHERE g.tenant_id = :tenant_id {ay_filter}
            GROUP BY c.id, c.name
            ORDER BY class_name
        """)

        subject_rows = db.execute(by_subject_sql, params).fetchall()
        class_rows = db.execute(by_class_sql, params).fetchall()

        return {
            "bySubject": [
                {
                    "subject_id": str(r.subject_id),
                    "subject_name": r.subject_name,
                    "name": r.subject_name, # Alias
                    "success_rate": round((r.passing / r.total * 100) if r.total else 0.0, 2),
                    "rate": round((r.passing / r.total * 100) if r.total else 0.0, 2), # Alias
                    "average_grade": round(float(r.average_grade or 0.0), 2),
                }
                for r in subject_rows
            ],
            "byClass": [
                {
                    "class_id": str(r.class_id),
                    "class_name": r.class_name,
                    "name": r.class_name, # Alias for DecisionDashboard
                    "success_rate": round((r.passing / r.total * 100) if r.total else 0.0, 2),
                    "rate": round((r.passing / r.total * 100) if r.total else 0.0, 2), # Alias for DecisionDashboard
                    "total_students": int(r.total),
                }
                for r in class_rows
            ],
        }
    except Exception as e:
        logger.error(f"Error in get_academic_stats: {str(e)}", exc_info=True)
        return {"bySubject": [], "byClass": []}


@router.get("/students-at-risk/")
def get_students_at_risk(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    academic_year_id: Optional[str] = None,
):
    """Return students with average grade below passing threshold."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        ay_id = _resolve_academic_year(db, tenant_id, academic_year_id)
        
        params: dict = {"tenant_id": tenant_id}
        ay_filter = " AND academic_year_id = :academic_year_id" if ay_id else ""
        if ay_id:
            params["academic_year_id"] = ay_id

        sql = text(f"""
            SELECT
                s.id         AS student_id,
                s.first_name,
                s.last_name,
                AVG(g.score) AS avg_grade,
                COUNT(g.id)  AS grade_count,
                CASE
                    WHEN AVG(g.score) < (g.max_score * 0.4)  THEN 'critical'
                    WHEN AVG(g.score) < (g.max_score * 0.5) THEN 'high'
                    WHEN AVG(g.score) < (g.max_score * 0.6) THEN 'moderate'
                    ELSE 'low'
                END AS risk_level
            FROM grades g
            JOIN students s ON s.id = g.student_id
            WHERE g.tenant_id = :tenant_id {ay_filter}
            GROUP BY s.id, s.first_name, s.last_name, g.max_score
            HAVING AVG(g.score) < (g.max_score * 0.6)
            ORDER BY avg_grade ASC
            LIMIT 50
        """)
        rows = db.execute(sql, params).fetchall()

        data = [
            {
                "student_id": str(r.student_id),
                "first_name": r.first_name,
                "last_name": r.last_name,
                "avg_grade": round(float(r.avg_grade or 0), 2),
                "grade_count": int(r.grade_count),
                "risk_level": r.risk_level,
            }
            for r in rows
        ]

        # Aggregate counts
        counts = {"critical": 0, "high": 0, "moderate": 0, "low": 0}
        for d in data:
            counts[d["risk_level"]] = counts.get(d["risk_level"], 0) + 1

        return {"students": data, "summary": {"total": len(data), **counts}}
    except Exception as e:
        logger.error(f"Error in get_students_at_risk: {str(e)}", exc_info=True)
        return {"students": [], "summary": {"total": 0, "critical": 0, "high": 0, "moderate": 0, "low": 0}}


# ─── Operational KPIs ────────────────────────────────────────────────────────

@router.get("/operational-kpis/")
def get_operational_kpis(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    academic_year_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Operational KPIs: attendance rates, dropout rate, teacher workload."""
    tenant_id = str(current_user.get("tenant_id"))
    params: dict = {"tenant_id": tenant_id}
    try:
        # Build optional filters
        att_filter = ""
        if start_date:
            att_filter += " AND date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            att_filter += " AND date <= :end_date"
            params["end_date"] = end_date

        ay_id = _resolve_academic_year(db, tenant_id, academic_year_id)
        
        ay_filter = ""
        if ay_id:
            ay_filter = " AND academic_year_id = :academic_year_id"
            params["academic_year_id"] = ay_id

        # Student attendance
        att_sql = text(f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
            FROM attendance
            WHERE tenant_id = :tenant_id {att_filter}
        """)
        att = db.execute(att_sql, params).fetchone()
        student_att_rate = round((att.present / att.total * 100) if (att and att.total) else 0.0, 2)

        # Dropout rate via enrollments
        enroll_sql = text(f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'DROPPED' THEN 1 ELSE 0 END) AS dropped
            FROM enrollments
            WHERE tenant_id = :tenant_id {ay_filter}
        """)
        enroll = db.execute(enroll_sql, params).fetchone()
        total_enrollments = int(enroll.total or 0) if enroll else 0
        dropout_count = int(enroll.dropped or 0) if enroll else 0
        dropout_rate = round((dropout_count / total_enrollments * 100) if total_enrollments > 0 else 0.0, 2)

        # Teacher hours & active teacher count (mocked because teacher_work_hours table doesn't exist)
        total_teacher_hours = 0.0
        active_teachers = 0

        # Total teachers (to compute rate)
        teacher_count_sql = text("""
            SELECT COUNT(*) AS total
            FROM user_roles
            WHERE tenant_id = :tenant_id AND role = 'TEACHER'
        """)
        tc = db.execute(teacher_count_sql, {"tenant_id": tenant_id}).fetchone()
        total_teachers = int(tc.total or 0) if tc else 0
        teacher_att_rate = round((active_teachers / total_teachers * 100) if total_teachers > 0 else 0.0, 2)

        return {
            "studentAttendanceRate": student_att_rate,
            "teacherAttendanceRate": min(teacher_att_rate, 100.0),
            "totalEnrollments": total_enrollments,
            "dropoutRate": dropout_rate,
            "dropoutCount": dropout_count,
            "totalTeacherHours": total_teacher_hours,
        }
    except Exception as e:
        logger.error(f"Error in get_operational_kpis: {str(e)}", exc_info=True)
        return {
            "studentAttendanceRate": 0,
            "teacherAttendanceRate": 0,
            "totalEnrollments": 0,
            "dropoutRate": 0,
            "dropoutCount": 0,
            "totalTeacherHours": 0,
        }


@router.get("/debt-aging/")
def get_debt_aging(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """Debt aging: breakdown of overdue invoices by age bucket."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        sql = text("""
            SELECT
                CASE
                    WHEN due_date >= CURRENT_DATE THEN 'current'
                    WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30'
                    WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60'
                    WHEN due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90'
                    ELSE 'over_90'
                END AS bucket,
                COUNT(*) AS count,
                COALESCE(SUM(total_amount), 0) AS amount
            FROM invoices
            WHERE tenant_id = :tenant_id AND status <> 'PAID'
            GROUP BY bucket
            ORDER BY bucket
        """)
        rows = db.execute(sql, {"tenant_id": tenant_id}).fetchall()
        return [
            {"bucket": r.bucket, "count": int(r.count), "amount": float(r.amount or 0)}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error in get_debt_aging: {str(e)}", exc_info=True)
        return []


@router.get("/revenue-by-category/")
def get_revenue_by_category(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """Revenue breakdown by category/type."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        sql = text("""
            SELECT
                'Scolarité' AS category,
                COALESCE(SUM(total_amount), 0) AS total,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS paid
            FROM invoices
            WHERE tenant_id = :tenant_id
        """)
        rows = db.execute(sql, {"tenant_id": tenant_id}).fetchall()
        return [
            {"category": r.category, "total": float(r.total or 0), "paid": float(r.paid or 0)}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error in get_revenue_by_category: {str(e)}", exc_info=True)
        return []

@router.get("/attendance-trend/")
def get_attendance_trend(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
    period: str = Query("month", description="week, month, or year")
):
    """Attendance trend over time."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        if period == "week":
            days = 7
        elif period == "year":
            days = 365
        else:
            days = 30
            
        start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

        sql = text("""
            SELECT 
                TO_CHAR(date, 'YYYY-MM-DD') AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent
            FROM attendance
            WHERE tenant_id = :tenant_id AND date >= :start_date
            GROUP BY day
            ORDER BY day ASC
        """)
        rows = db.execute(sql, {"tenant_id": tenant_id, "start_date": start_date}).fetchall()
        
        return [
            {
                "date": r.day,
                "taux": int((r.present / r.total * 100)) if (r and r.total) else 0,
                "présents": int(r.present or 0),
                "absents": int(r.absent or 0)
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error in get_attendance_trend: {str(e)}", exc_info=True)
        return []

@router.get("/grades-distribution/")
def get_grades_distribution(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """Grades distribution across standard buckets."""
    tenant_id = str(current_user.get("tenant_id"))
    try:
        sql = text("""
            SELECT 
                score, 
                max_score 
            FROM grades 
            WHERE tenant_id = :tenant_id AND score IS NOT NULL
        """)
        rows = db.execute(sql, {"tenant_id": tenant_id}).fetchall()
        
        distribution = {"0-5": 0, "5-10": 0, "10-12": 0, "12-14": 0, "14-16": 0, "16-20": 0}
        for r in rows:
            max_s = float(r.max_score) if r.max_score else 20.0
            normalized = (float(r.score) / max_s) * 20.0
            if normalized < 5: distribution["0-5"] += 1
            elif normalized < 10: distribution["5-10"] += 1
            elif normalized < 12: distribution["10-12"] += 1
            elif normalized < 14: distribution["12-14"] += 1
            elif normalized < 16: distribution["14-16"] += 1
            else: distribution["16-20"] += 1

        return [
            {"range": k, "count": v} for k, v in distribution.items()
        ]
    except Exception as e:
        logger.error(f"Error in get_grades_distribution: {str(e)}", exc_info=True)
        return []

@router.get("/dashboard-kpis/")
def get_dashboard_kpis(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """
    Global dashboard KPIs for admins: students, teachers, classrooms, revenue, attendance.
    """
    tenant_id = str(current_user.get("tenant_id"))
    try:
        # 1. Counts: Students, Teachers, Classrooms
        count_sql = text("""
            SELECT
                (SELECT COUNT(*) FROM students WHERE tenant_id = :tenant_id AND is_archived = false) AS total_students,
                (SELECT COUNT(*) FROM user_roles WHERE tenant_id = :tenant_id AND role = 'TEACHER') AS total_teachers,
                (SELECT COUNT(*) FROM classes WHERE tenant_id = :tenant_id) AS total_classrooms
        """)
        counts = db.execute(count_sql, {"tenant_id": tenant_id}).fetchone()

        # 2. Revenue (Current Month)
        revenue_sql = text("""
            SELECT
                COALESCE(SUM(total_amount), 0) AS total,
                COALESCE(SUM(paid_amount), 0) AS paid
            FROM invoices
            WHERE tenant_id = :tenant_id
        """)
        rev = db.execute(revenue_sql, {"tenant_id": tenant_id}).fetchone()
        total_revenue = float(rev.total or 0) if rev else 0.0
        collected_revenue = float(rev.paid or 0) if rev else 0.0
        collection_rate = (collected_revenue / total_revenue * 100) if total_revenue > 0 else 0.0

        # 3. Attendance Rate (Last 30 days)
        att_sql = text("""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
            FROM attendance
            WHERE tenant_id = :tenant_id AND date >= CURRENT_DATE - INTERVAL '30 days'
        """)
        att = db.execute(att_sql, {"tenant_id": tenant_id}).fetchone()
        attendance_rate = (att.present / att.total * 100) if (att and att.total) else 0.0

        # 4. Average Grade
        grade_sql = text("""
            SELECT AVG(score / max_score * 20) as avg_grade
            FROM grades
            WHERE tenant_id = :tenant_id
        """)
        grade_row = db.execute(grade_sql, {"tenant_id": tenant_id}).fetchone()
        avg_grade = float(grade_row.avg_grade or 0) if (grade_row and grade_row.avg_grade) else 0.0

        return {
            "totalStudents": int(counts.total_students or 0) if counts else 0,
            "teacherCount": int(counts.total_teachers or 0) if counts else 0,
            "classroomCount": int(counts.total_classrooms or 0) if counts else 0,
            "totalRevenue": total_revenue,
            "collectedRevenue": collected_revenue,
            "pendingRevenue": max(0, total_revenue - collected_revenue),
            "collectionRate": round(collection_rate, 2),
            "attendanceRate": round(attendance_rate, 2),
            "avgGrade": round(avg_grade, 1),
            "activeCourses": 0, # Placeholder
            "colleaguesCount": 0 # Placeholder
        }
    except Exception as e:
        logger.error(f"Error in get_dashboard_kpis: {str(e)}", exc_info=True)
        return {
            "totalStudents": 0,
            "teacherCount": 0,
            "classroomCount": 0,
            "totalRevenue": 0,
            "collectedRevenue": 0,
            "pendingRevenue": 0,
            "collectionRate": 0,
            "attendanceRate": 0,
            "avgGrade": 0,
            "activeCourses": 0,
            "colleaguesCount": 0
        }

@router.get("/ministry-kpis/")
def get_ministry_kpis(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """
    Ministry Reporting KPIs: demographics, academic averages, financial health.
    """
    tenant_id = str(current_user.get("tenant_id"))
    try:
        # 1. Effectifs par genre
        gender_sql = text("""
            SELECT 
                COUNT(*) FILTER (WHERE gender = 'MALE') as male,
                COUNT(*) FILTER (WHERE gender = 'FEMALE') as female,
                COUNT(*) as total
            FROM students 
            WHERE tenant_id = :tenant_id AND is_archived = false
        """)
        gender_row = db.execute(gender_sql, {"tenant_id": tenant_id}).fetchone()

        # 2. Moyenne générale (tous temps)
        grade_sql = text("""
            SELECT AVG(score / max_score * 20) as avg_grade
            FROM grades
            WHERE tenant_id = :tenant_id
        """)
        grade_row = db.execute(grade_sql, {"tenant_id": tenant_id}).fetchone()

        # 3. Taux d'assiduité (30 derniers jours)
        att_sql = text("""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
            FROM attendance
            WHERE tenant_id = :tenant_id AND date >= CURRENT_DATE - INTERVAL '30 days'
        """)
        att = db.execute(att_sql, {"tenant_id": tenant_id}).fetchone()
        attendance_rate = (att.present / att.total * 100) if (att and att.total) else 0.0

        # 4. Finances (Total attendu vs Collecté)
        finance_sql = text("""
            SELECT
                COALESCE(SUM(total_amount), 0) AS expected,
                COALESCE(SUM(paid_amount), 0) AS collected
            FROM invoices
            WHERE tenant_id = :tenant_id
        """)
        fin = db.execute(finance_sql, {"tenant_id": tenant_id}).fetchone()
        expected = float(fin.expected or 0) if fin else 0.0
        collected = float(fin.collected or 0) if fin else 0.0
        collection_rate = (collected / expected * 100) if expected > 0 else 0.0

        return {
            "total_students": int(gender_row.total or 0) if gender_row else 0,
            "students_male": int(gender_row.male or 0) if gender_row else 0,
            "students_female": int(gender_row.female or 0) if gender_row else 0,
            "attendance_rate": round(attendance_rate, 1),
            "average_grade": round(float(grade_row.avg_grade or 0), 1) if (grade_row and grade_row.avg_grade) else 0.0,
            "collection_rate": round(collection_rate, 1),
            "total_revenue_expected": expected,
            "total_revenue_collected": collected,
            "tenant_id": tenant_id
        }
    except Exception as e:
        logger.error(f"Error in get_ministry_kpis: {str(e)}", exc_info=True)
        return {
            "total_students": 0,
            "students_male": 0,
            "students_female": 0,
            "attendance_rate": 0,
            "average_grade": 0,
            "collection_rate": 0,
            "total_revenue_expected": 0,
            "total_revenue_collected": 0,
            "tenant_id": tenant_id
        }

@router.post("/cash-flow-forecast/")
def get_cash_flow_forecast(
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """
    Cash-flow forecast: projections of revenue and expenses.
    """
    tenant_id = str(current_user.get("tenant_id"))
    months_ahead = body.get("months_ahead", 3)
    # Mock response for now
    return {
        "labels": ["M+1", "M+2", "M+3"],
        "revenue": [5000, 5200, 5500],
        "expenses": [3000, 3100, 3200],
        "net": [2000, 2100, 2300]
    }
