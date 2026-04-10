from typing import List, Optional
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.models import (
    AcademicYear, Term, Campus, Level, Subject, 
    Department, Room, Program, Classroom, Enrollment,
    subject_levels, subject_departments, classroom_departments, class_subjects
)
from app.schemas.academic import (
    AcademicYearCreate, AcademicYearUpdate,
    TermCreate, TermUpdate,
    CampusCreate, CampusUpdate,
    LevelCreate, LevelUpdate,
    SubjectCreate, SubjectUpdate,
    DepartmentCreate, DepartmentUpdate,
    RoomCreate, RoomUpdate,
    ProgramCreate, ProgramUpdate,
    ClassroomCreate, ClassroomUpdate,
    EnrollmentCreate, EnrollmentUpdate
)

# --- Academic Year ---
def get_academic_years(db: Session, tenant_id: UUID) -> List[AcademicYear]:
    return db.query(AcademicYear).filter(AcademicYear.tenant_id == tenant_id).order_by(AcademicYear.start_date.desc()).all()

def get_academic_year(db: Session, ay_id: UUID, tenant_id: UUID) -> Optional[AcademicYear]:
    return db.query(AcademicYear).filter(AcademicYear.id == ay_id, AcademicYear.tenant_id == tenant_id).first()

def create_academic_year(db: Session, obj_in: AcademicYearCreate, tenant_id: UUID) -> AcademicYear:
    if obj_in.is_current:
        # Reset others
        db.query(AcademicYear).filter(AcademicYear.tenant_id == tenant_id).update({"is_current": False})
    
    db_obj = AcademicYear(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_academic_year(db: Session, ay_id: UUID, obj_in: AcademicYearUpdate, tenant_id: UUID) -> Optional[AcademicYear]:
    db_obj = get_academic_year(db, ay_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    if update_data.get("is_current"):
        # Reset others
        db.query(AcademicYear).filter(AcademicYear.tenant_id == tenant_id).filter(AcademicYear.id != ay_id).update({"is_current": False})
    
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_academic_year(db: Session, ay_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_academic_year(db, ay_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Term ---
def get_terms(db: Session, tenant_id: UUID) -> List[Term]:
    return db.query(Term).filter(Term.tenant_id == tenant_id).order_by(Term.sequence_number.asc()).all()

def get_term(db: Session, term_id: UUID, tenant_id: UUID) -> Optional[Term]:
    return db.query(Term).filter(Term.id == term_id, Term.tenant_id == tenant_id).first()

def create_term(db: Session, obj_in: TermCreate, tenant_id: UUID) -> Term:
    db_obj = Term(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_term(db: Session, term_id: UUID, obj_in: TermUpdate, tenant_id: UUID) -> Optional[Term]:
    db_obj = get_term(db, term_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_term(db: Session, term_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_term(db, term_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Campus ---
def get_campuses(db: Session, tenant_id: UUID) -> List[Campus]:
    return db.query(Campus).filter(Campus.tenant_id == tenant_id).all()

def get_campus(db: Session, campus_id: UUID, tenant_id: UUID) -> Optional[Campus]:
    return db.query(Campus).filter(Campus.id == campus_id, Campus.tenant_id == tenant_id).first()

def create_campus(db: Session, obj_in: CampusCreate, tenant_id: UUID) -> Campus:
    if obj_in.is_main:
        db.query(Campus).filter(Campus.tenant_id == tenant_id).update({"is_main": False})
    
    db_obj = Campus(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_campus(db: Session, campus_id: UUID, obj_in: CampusUpdate, tenant_id: UUID) -> Optional[Campus]:
    db_obj = get_campus(db, campus_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    if update_data.get("is_main"):
        db.query(Campus).filter(Campus.tenant_id == tenant_id).filter(Campus.id != campus_id).update({"is_main": False})
    
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_campus(db: Session, campus_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_campus(db, campus_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Level ---
def get_levels(db: Session, tenant_id: UUID) -> List[Level]:
    return db.query(Level).filter(Level.tenant_id == tenant_id).order_by(Level.order_index.asc()).all()

def get_level(db: Session, level_id: UUID, tenant_id: UUID) -> Optional[Level]:
    return db.query(Level).filter(Level.id == level_id, Level.tenant_id == tenant_id).first()

def create_level(db: Session, obj_in: LevelCreate, tenant_id: UUID) -> Level:
    db_obj = Level(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_level(db: Session, level_id: UUID, obj_in: LevelUpdate, tenant_id: UUID) -> Optional[Level]:
    db_obj = get_level(db, level_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_level(db: Session, level_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_level(db, level_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Subject ---
def get_subjects(db: Session, tenant_id: UUID) -> List[Subject]:
    return db.query(Subject).filter(Subject.tenant_id == tenant_id).order_by(Subject.name.asc()).all()

def get_subject(db: Session, subject_id: UUID, tenant_id: UUID) -> Optional[Subject]:
    return db.query(Subject).filter(Subject.id == subject_id, Subject.tenant_id == tenant_id).first()

def create_subject(db: Session, obj_in: SubjectCreate, tenant_id: UUID) -> Subject:
    data = obj_in.model_dump(exclude={"department_ids", "level_ids"})
    db_obj = Subject(**data, tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    # Handle associations
    if obj_in.department_ids:
        for dept_id in obj_in.department_ids:
            db.execute(subject_departments.insert().values(
                tenant_id=tenant_id,
                subject_id=db_obj.id,
                department_id=dept_id
            ))
    
    if obj_in.level_ids:
        for level_id in obj_in.level_ids:
            db.execute(subject_levels.insert().values(
                tenant_id=tenant_id,
                subject_id=db_obj.id,
                level_id=level_id
            ))
    
    if obj_in.department_ids or obj_in.level_ids:
        db.commit()
        db.refresh(db_obj)
        
    return db_obj

def update_subject(db: Session, subject_id: UUID, obj_in: SubjectUpdate, tenant_id: UUID) -> Optional[Subject]:
    db_obj = get_subject(db, subject_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    dept_ids = update_data.pop("department_ids", None)
    level_ids = update_data.pop("level_ids", None)
    
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    
    if dept_ids is not None:
        db.execute(subject_departments.delete().where(subject_departments.c.subject_id == subject_id))
        for d_id in dept_ids:
            db.execute(subject_departments.insert().values(tenant_id=tenant_id, subject_id=subject_id, department_id=d_id))
            
    if level_ids is not None:
        db.execute(subject_levels.delete().where(subject_levels.c.subject_id == subject_id))
        for l_id in level_ids:
            db.execute(subject_levels.insert().values(tenant_id=tenant_id, subject_id=subject_id, level_id=l_id))
            
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_subject(db: Session, subject_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_subject(db, subject_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Department ---
def get_departments(db: Session, tenant_id: UUID) -> List[Department]:
    return db.query(Department).filter(Department.tenant_id == tenant_id).order_by(Department.name.asc()).all()

def get_department(db: Session, dept_id: UUID, tenant_id: UUID) -> Optional[Department]:
    return db.query(Department).filter(Department.id == dept_id, Department.tenant_id == tenant_id).first()

def create_department(db: Session, obj_in: DepartmentCreate, tenant_id: UUID) -> Department:
    db_obj = Department(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_department(db: Session, dept_id: UUID, obj_in: DepartmentUpdate, tenant_id: UUID) -> Optional[Department]:
    db_obj = get_department(db, dept_id, tenant_id)
    if not db_obj: return None
    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_department(db: Session, dept_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_department(db, dept_id, tenant_id)
    if not db_obj: return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Program ---
def get_programs(db: Session, tenant_id: UUID) -> List[Program]:
    return db.query(Program).filter(Program.tenant_id == tenant_id).all()

def create_program(db: Session, obj_in: ProgramCreate, tenant_id: UUID) -> Program:
    db_obj = Program(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# --- Room ---
def get_rooms(db: Session, tenant_id: UUID) -> List[Room]:
    return db.query(Room).filter(Room.tenant_id == tenant_id).all()

def create_room(db: Session, obj_in: RoomCreate, tenant_id: UUID) -> Room:
    db_obj = Room(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# --- Classroom (Classes) ---
def get_classrooms(db: Session, tenant_id: UUID) -> List[Classroom]:
    return db.query(Classroom).filter(Classroom.tenant_id == tenant_id).all()

def get_classroom(db: Session, class_id: UUID, tenant_id: UUID) -> Optional[Classroom]:
    return db.query(Classroom).filter(Classroom.id == class_id, Classroom.tenant_id == tenant_id).first()

def create_classroom(db: Session, obj_in: ClassroomCreate, tenant_id: UUID) -> Classroom:
    data = obj_in.model_dump(exclude={"department_ids"})
    db_obj = Classroom(**data, tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    if obj_in.department_ids:
        for d_id in obj_in.department_ids:
            db.execute(classroom_departments.insert().values(tenant_id=tenant_id, class_id=db_obj.id, department_id=d_id))
        db.commit()
        db.refresh(db_obj)
    return db_obj

# --- Enrollment ---
def get_enrollments(db: Session, tenant_id: UUID) -> List[Enrollment]:
    return db.query(Enrollment).filter(Enrollment.tenant_id == tenant_id).all()

def create_enrollment(db: Session, obj_in: EnrollmentCreate, tenant_id: UUID) -> Enrollment:
    db_obj = Enrollment(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj
