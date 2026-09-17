from datetime import date, datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator


def _blank_to_none(v):
    """La combobox catégorie du frontend (ResourceDialog.tsx) envoie ""
    quand "Aucune catégorie" est sélectionné, jamais null/absent — même
    comportement que l'ancien endpoint SQL brut, qui faisait
    `resource.category_id or None` côté serveur avant l'INSERT."""
    return None if v == "" else v


# --- Categories ---

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class CategoryOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    color: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Resources ---

class ResourceCreate(BaseModel):
    title: str
    description: Optional[str] = None
    author: Optional[str] = None
    resource_type: str = "BOOK"
    category_id: Optional[UUID] = None
    isbn: Optional[str] = None
    total_copies: int = Field(default=1, ge=0)
    available_copies: int = Field(default=1, ge=0)
    file_url: Optional[str] = None
    cover_url: Optional[str] = None
    external_url: Optional[str] = None
    publication_year: Optional[int] = None
    tags: Optional[List[str]] = None
    is_featured: bool = False
    is_public: bool = False

    _blank_category = field_validator("category_id", mode="before")(_blank_to_none)

    # BUSINESS-RULE FIX (institutional-readiness audit, 2026-09):
    # total_copies/available_copies were two fully independent
    # client-supplied ints with no relationship enforced — available_copies
    # could exceed total_copies, letting borrow_resource() (whose only
    # gate is available_copies <= 0) hand out more copies than physically
    # exist.
    @model_validator(mode="after")
    def _copies_consistent(self):
        if self.available_copies > self.total_copies:
            raise ValueError("Le nombre d'exemplaires disponibles ne peut pas dépasser le nombre total d'exemplaires")
        return self


class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    resource_type: Optional[str] = None
    category_id: Optional[UUID] = None
    isbn: Optional[str] = None
    total_copies: Optional[int] = Field(default=None, ge=0)
    available_copies: Optional[int] = Field(default=None, ge=0)
    file_url: Optional[str] = None
    cover_url: Optional[str] = None
    external_url: Optional[str] = None
    publication_year: Optional[int] = None
    tags: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    is_public: Optional[bool] = None

    _blank_category = field_validator("category_id", mode="before")(_blank_to_none)

    # Same rule as ResourceCreate, applied only when both fields are
    # present in this partial update — a lone total_copies/available_copies
    # update is still checked against the existing DB row by
    # crud.update_resource().
    @model_validator(mode="after")
    def _copies_consistent(self):
        if self.available_copies is not None and self.total_copies is not None and self.available_copies > self.total_copies:
            raise ValueError("Le nombre d'exemplaires disponibles ne peut pas dépasser le nombre total d'exemplaires")
        return self


class ResourceOut(BaseModel):
    id: UUID
    tenant_id: UUID
    category_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    author: Optional[str] = None
    resource_type: Optional[str] = None
    uploaded_by: Optional[UUID] = None
    isbn: Optional[str] = None
    total_copies: Optional[int] = None
    available_copies: Optional[int] = None
    file_url: Optional[str] = None
    cover_url: Optional[str] = None
    external_url: Optional[str] = None
    publication_year: Optional[int] = None
    tags: Optional[List[str]] = None
    is_featured: bool
    is_public: bool
    views_count: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Borrowing ---

class BorrowRequest(BaseModel):
    resource_id: UUID
    user_id: UUID
    due_date: date
    notes: Optional[str] = None


class ReturnRequest(BaseModel):
    borrow_id: UUID
    notes: Optional[str] = None


class BorrowRecordOut(BaseModel):
    id: UUID
    tenant_id: UUID
    resource_id: UUID
    borrowed_by: UUID
    borrowed_at: datetime
    due_date: Optional[date] = None
    returned_at: Optional[datetime] = None
    status: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True
