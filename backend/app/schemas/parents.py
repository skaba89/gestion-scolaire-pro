from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

# --- ParentStudent Schemas ---

class ParentStudentBase(BaseModel):
    parent_id: UUID
    student_id: UUID
    is_primary: bool = False
    relation_type: Optional[str] = None

class ParentStudentCreate(ParentStudentBase):
    pass

class ParentStudent(ParentStudentBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- API Endpoints and CRUD logic (Simplified internal) ---
# This will be used in the router
