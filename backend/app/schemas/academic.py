from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import date, datetime

# --- Academic Year ---
class AcademicYearBase(BaseModel):
    name: str
    code: str
    start_date: date
    end_date: date
    is_current: bool = False

class AcademicYearCreate(AcademicYearBase):
    pass

class AcademicYearUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None

class AcademicYear(AcademicYearBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Term ---
class TermBase(BaseModel):
    academic_year_id: UUID
    name: str
    start_date: date
    end_date: date
    sequence_number: int = 1
    is_active: bool = False

class TermCreate(TermBase):
    pass

class TermUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sequence_number: Optional[int] = None
    is_active: Optional[bool] = None

class Term(TermBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Campus ---
class CampusBase(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_main: bool = False

class CampusCreate(CampusBase):
    pass

class CampusUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    is_main: Optional[bool] = None

class Campus(CampusBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Level ---
class LevelBase(BaseModel):
    name: str
    order_index: int = 0

class LevelCreate(LevelBase):
    pass

class LevelUpdate(BaseModel):
    name: Optional[str] = None
    order_index: Optional[int] = None

class Level(LevelBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Subject ---
class SubjectBase(BaseModel):
    name: str
    code: str
    coefficient: float = 1.0

class SubjectCreate(SubjectBase):
    department_ids: Optional[List[UUID]] = None
    level_ids: Optional[List[UUID]] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    coefficient: Optional[float] = None
    department_ids: Optional[List[UUID]] = None
    level_ids: Optional[List[UUID]] = None

class Subject(SubjectBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Department ---
class DepartmentBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    head_id: Optional[UUID] = None

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    head_id: Optional[UUID] = None

class Department(DepartmentBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Program ---
class ProgramBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None

class ProgramCreate(ProgramBase):
    pass

class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None

class Program(ProgramBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Room ---
class RoomBase(BaseModel):
    name: str
    capacity: Optional[int] = None
    campus_id: Optional[UUID] = None

class RoomCreate(RoomBase):
    pass

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    campus_id: Optional[UUID] = None

class Room(RoomBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Classroom (Classes) ---
class ClassroomBase(BaseModel):
    name: str
    capacity: Optional[int] = None
    level_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None
    program_id: Optional[UUID] = None
    academic_year_id: Optional[UUID] = None
    main_room_id: Optional[UUID] = None

class ClassroomCreate(ClassroomBase):
    department_ids: Optional[List[UUID]] = None

class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    level_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None
    program_id: Optional[UUID] = None
    academic_year_id: Optional[UUID] = None
    main_room_id: Optional[UUID] = None
    department_ids: Optional[List[UUID]] = None

class Classroom(ClassroomBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Enrollment ---
class EnrollmentBase(BaseModel):
    student_id: UUID
    class_id: UUID
    academic_year_id: UUID
    enrollment_date: Optional[date] = None
    status: str = "ACTIVE"

class EnrollmentCreate(EnrollmentBase):
    pass

class EnrollmentUpdate(BaseModel):
    class_id: Optional[UUID] = None
    academic_year_id: Optional[UUID] = None
    enrollment_date: Optional[date] = None
    status: Optional[str] = None

class Enrollment(EnrollmentBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
