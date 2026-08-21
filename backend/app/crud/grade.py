"""CRUD operations for Grade model"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import bindparam, text
from uuid import UUID

from app.models.base import GUID
from app.models.grade import Grade
from app.schemas.grade import GradeCreate, GradeUpdate


def get_grade(db: Session, grade_id: UUID, tenant_id: UUID) -> Optional[Grade]:
    """Get a grade by ID"""
    return db.query(Grade).filter(
        Grade.id == grade_id,
        Grade.tenant_id == tenant_id
    ).first()


def get_grades(
    db: Session,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[UUID] = None,
    subject: Optional[str] = None,
    academic_year: Optional[str] = None,
    assessment_id: Optional[UUID] = None,
    class_id: Optional[UUID] = None,
) -> tuple[list[Grade], int]:
    """Get grades with pagination and filters"""
    query = db.query(Grade).filter(Grade.tenant_id == tenant_id)
    
    if student_id:
        query = query.filter(Grade.student_id == student_id)
    
    if subject:
        query = query.filter(Grade.subject_id == subject)
    
    if assessment_id:
        query = query.filter(Grade.assessment_id == assessment_id)
    
    if class_id:
        # Filter grades by assessment's class_id (column may exist in DB table but not ORM)
        from sqlalchemy import text
        class_subq = db.execute(text(
            "SELECT id FROM assessments WHERE class_id = :cid AND tenant_id = :tid"
        ), {"cid": str(class_id), "tid": str(tenant_id)}).fetchall()
        class_assessment_ids = [row[0] for row in class_subq]
        if class_assessment_ids:
            query = query.filter(Grade.assessment_id.in_(class_assessment_ids))
        else:
            # No assessments match this class_id, return empty
            return [], 0
    
    if academic_year:
        # Filter grades by assessment's academic_year_id
        from app.models.assessment import Assessment
        ay_subq = db.query(Assessment.id).filter(Assessment.academic_year_id == academic_year).subquery()
        query = query.filter(Grade.assessment_id.in_(ay_subq))
    
    total = query.count()
    grades = query.order_by(Grade.created_at.desc()).offset(skip).limit(limit).all()
    
    return grades, total


def get_student_average(
    db: Session,
    student_id: UUID,
    tenant_id: UUID,
    academic_year: Optional[str] = None,
    semester: Optional[int] = None,
) -> dict:
    """Calculate student's average grades — weighted by subject
    coefficient, using the same algorithm as bulletins and transcripts
    (see app/services/grading.py).

    Fix (audit stratégique 2026-08-16, incohérence interne #1) : cette
    fonction calculait auparavant une moyenne plate (`func.avg(Grade.score)`),
    qui pouvait diverger du chiffre affiché sur un bulletin pour le même
    élève et la même période — deux vérités différentes selon l'écran.
    Requête réécrite pour joindre matières/évaluations/périodes de la
    même façon que school_life.py:_fetch_grades_for_term, puis déléguer
    le calcul à la fonction partagée.
    """
    conditions = ["g.student_id = :sid", "g.tenant_id = :tid"]
    params: dict = {"sid": str(student_id), "tid": str(tenant_id)}

    if academic_year:
        conditions.append("a.academic_year_id = :ay")
        params["ay"] = str(academic_year)

    if semester:
        conditions.append("t.sequence_number = :sem")
        params["sem"] = semester

    where_clause = " AND ".join(conditions)
    # Bound explicitly through the GUID TypeDecorator (see app/models/base.py):
    # a plain string bind compares a dashed UUID against SQLite's dash-less
    # CHAR(32) storage and silently matches zero rows there — the same bug
    # class already found and fixed in _fetch_tenant_settings/
    # build_service_from_db this session. Harmless on PostgreSQL, where the
    # decorator is a no-op passthrough.
    guid_params = [p for p in ("sid", "tid", "ay") if p in params]
    stmt = text(f"""
        SELECT
            COALESCE(subj.name, 'Matière inconnue') AS subject_name,
            COALESCE(subj.coefficient, g.coefficient, 1.0) AS coefficient,
            g.score,
            g.max_score
        FROM grades g
        LEFT JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN terms t ON a.term_id = t.id
        LEFT JOIN subjects subj ON a.subject_id = subj.id
        WHERE {where_clause}
    """).bindparams(*(bindparam(p, type_=GUID()) for p in guid_params))
    rows = db.execute(stmt, params).mappings().all()

    from app.services.grading import compute_weighted_average
    average = compute_weighted_average([dict(r) for r in rows])

    return {
        'average': round(average, 2) if average is not None else 0.0,
        'count': len(rows)
    }


def create_grade(db: Session, grade: GradeCreate, tenant_id: UUID) -> Grade:
    """Create a new grade"""
    db_grade = Grade(
        **grade.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_grade)
    db.commit()
    db.refresh(db_grade)
    return db_grade


def update_grade(
    db: Session,
    grade_id: UUID,
    grade_update: GradeUpdate,
    tenant_id: UUID
) -> Optional[Grade]:
    """Update a grade"""
    db_grade = get_grade(db, grade_id, tenant_id)
    if not db_grade:
        return None
    
    update_data = grade_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_grade, field, value)
    
    db.commit()
    db.refresh(db_grade)
    return db_grade


def delete_grade(db: Session, grade_id: UUID, tenant_id: UUID) -> bool:
    """Delete a grade"""
    db_grade = get_grade(db, grade_id, tenant_id)
    if not db_grade:
        return False
    
    db.delete(db_grade)
    db.commit()
    return True
