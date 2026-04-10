from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import date

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()


class AttendanceCreate(BaseModel):
    student_id: str
    date: date
    status: str  # PRESENT, ABSENT, LATE, EXCUSED
    reason: Optional[str] = None
    subject_id: Optional[str] = None
    classroom_id: Optional[str] = None


class AttendanceBulkCreate(BaseModel):
    records: List[AttendanceCreate]


class AttendanceUpdate(BaseModel):
    status: str
    reason: Optional[str] = None


# ─── GET /attendance ───────────────────────────────────────────────────────────

@router.get("/")
def get_attendance(
    student_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("attendance:read")),
):
    """List attendance records with optional filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}

    query_str = """
        SELECT a.*,
               st.first_name || ' ' || st.last_name AS student_name,
               st.registration_number,
               su.name AS subject_name,
               c.name AS classroom_name
        FROM attendance a
        LEFT JOIN students st ON a.student_id = st.id
        LEFT JOIN subjects su ON a.subject_id = su.id
        LEFT JOIN classrooms c ON a.classroom_id = c.id
        WHERE a.tenant_id = :tenant_id
    """
    params: dict = {"tenant_id": tenant_id}

    if student_id:
        query_str += " AND a.student_id = :student_id"
        params["student_id"] = student_id
    if classroom_id:
        query_str += " AND a.classroom_id = :classroom_id"
        params["classroom_id"] = classroom_id
    if subject_id:
        query_str += " AND a.subject_id = :subject_id"
        params["subject_id"] = subject_id
    if date_from:
        query_str += " AND a.date >= :date_from"
        params["date_from"] = date_from
    if date_to:
        query_str += " AND a.date <= :date_to"
        params["date_to"] = date_to
    if status:
        query_str += " AND a.status = :status"
        params["status"] = status.upper()

    query_str += " ORDER BY a.date DESC, st.last_name ASC LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset

    rows = db.execute(text(query_str), params).mappings().all()

    return {
        "items": [
            {
                "id": str(r["id"]),
                "date": str(r["date"]),
                "status": r["status"],
                "reason": r.get("reason"),
                "student_id": str(r["student_id"]),
                "student_name": r.get("student_name"),
                "student_number": r.get("registration_number"),
                "subject_id": str(r["subject_id"]) if r.get("subject_id") else None,
                "subject_name": r.get("subject_name"),
                "classroom_id": str(r["classroom_id"]) if r.get("classroom_id") else None,
                "classroom_name": r.get("classroom_name"),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
    }


# ─── GET /attendance/stats ────────────────────────────────────────────────────

@router.get("/stats/")
def get_attendance_stats(
    student_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("attendance:read")),
):
    """Attendance summary statistics (rate, counts by status)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"total": 0, "present": 0, "absent": 0, "late": 0, "excused": 0, "attendance_rate": 0.0}

    query_str = """
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'PRESENT') AS present,
            COUNT(*) FILTER (WHERE status = 'ABSENT') AS absent,
            COUNT(*) FILTER (WHERE status = 'LATE') AS late,
            COUNT(*) FILTER (WHERE status = 'EXCUSED') AS excused
        FROM attendance
        WHERE tenant_id = :tenant_id
    """
    params: dict = {"tenant_id": tenant_id}

    if student_id:
        query_str += " AND student_id = :student_id"
        params["student_id"] = student_id
    if classroom_id:
        query_str += " AND classroom_id = :classroom_id"
        params["classroom_id"] = classroom_id
    if date_from:
        query_str += " AND date >= :date_from"
        params["date_from"] = date_from
    if date_to:
        query_str += " AND date <= :date_to"
        params["date_to"] = date_to

    r = db.execute(text(query_str), params).mappings().first()
    total = r["total"] or 0
    present = r["present"] or 0

    return {
        "total": total,
        "present": present,
        "absent": r["absent"] or 0,
        "late": r["late"] or 0,
        "excused": r["excused"] or 0,
        "attendance_rate": round((present / total * 100), 2) if total > 0 else 0.0,
    }


# ─── POST /attendance ─────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_attendance(
    record: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("attendance:write")),
):
    """Record a single attendance entry."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    query = text("""
        INSERT INTO attendance (id, tenant_id, student_id, date, status, reason, subject_id, classroom_id, created_at, updated_at)
        VALUES (gen_random_uuid(), :tenant_id, :student_id, :date, :status, :reason, :subject_id, :classroom_id, NOW(), NOW())
        RETURNING id, tenant_id, student_id, date, status, reason, subject_id, classroom_id, created_at
    """)
    try:
        result = db.execute(query, {
            "tenant_id": tenant_id,
            "student_id": record.student_id,
            "date": record.date,
            "status": record.status.upper(),
            "reason": record.reason,
            "subject_id": record.subject_id,
            "classroom_id": record.classroom_id,
        }).mappings().first()
        db.commit()
        return dict(result)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ─── POST /attendance/bulk ────────────────────────────────────────────────────

@router.post("/bulk/", status_code=201)
def create_attendance_bulk(
    payload: AttendanceBulkCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("attendance:write")),
):
    """Record attendance for an entire class in one call."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    inserted = []
    try:
        for record in payload.records:
            result = db.execute(text("""
                INSERT INTO attendance (id, tenant_id, student_id, date, status, reason, subject_id, classroom_id, created_at, updated_at)
                VALUES (gen_random_uuid(), :tenant_id, :student_id, :date, :status, :reason, :subject_id, :classroom_id, NOW(), NOW())
                RETURNING id, student_id, date, status
            """), {
                "tenant_id": tenant_id,
                "student_id": record.student_id,
                "date": record.date,
                "status": record.status.upper(),
                "reason": record.reason,
                "subject_id": record.subject_id,
                "classroom_id": record.classroom_id,
            }).mappings().first()
            inserted.append(dict(result))
        db.commit()
        return {"inserted": len(inserted), "records": inserted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ─── PATCH /attendance/{id} ───────────────────────────────────────────────────

@router.patch("/{attendance_id}/")
def update_attendance(
    attendance_id: UUID,
    payload: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("attendance:write")),
):
    """Update the status or reason of an existing attendance record."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    result = db.execute(text("""
        UPDATE attendance
        SET status = :status, reason = :reason, updated_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id
        RETURNING id, student_id, date, status, reason
    """), {
        "id": str(attendance_id),
        "tenant_id": tenant_id,
        "status": payload.status.upper(),
        "reason": payload.reason,
    }).mappings().first()

    if not result:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    db.commit()
    return dict(result)


# ─── DELETE /attendance/{id} ──────────────────────────────────────────────────

@router.delete("/{attendance_id}/", status_code=204)
def delete_attendance(
    attendance_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("attendance:write")),
):
    """Delete an attendance record."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    result = db.execute(text("""
        DELETE FROM attendance WHERE id = :id AND tenant_id = :tenant_id RETURNING id
    """), {"id": str(attendance_id), "tenant_id": tenant_id})

    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    db.commit()
