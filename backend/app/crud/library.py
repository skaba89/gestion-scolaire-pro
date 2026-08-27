from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.library import LibraryCategory, LibraryResource, LibraryBorrowRecord
from app.schemas.library import (
    CategoryCreate, CategoryUpdate,
    ResourceCreate, ResourceUpdate,
    BorrowRequest, ReturnRequest,
)


# --- Categories ---

def get_categories(db: Session, tenant_id: UUID) -> List[LibraryCategory]:
    return (
        db.query(LibraryCategory)
        .filter(LibraryCategory.tenant_id == tenant_id)
        .order_by(LibraryCategory.name)
        .all()
    )


def get_category(db: Session, category_id: UUID, tenant_id: UUID) -> Optional[LibraryCategory]:
    return (
        db.query(LibraryCategory)
        .filter(LibraryCategory.id == category_id, LibraryCategory.tenant_id == tenant_id)
        .first()
    )


def create_category(db: Session, obj_in: CategoryCreate, tenant_id: UUID) -> LibraryCategory:
    db_obj = LibraryCategory(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.flush()
    return db_obj


def update_category(db: Session, db_obj: LibraryCategory, obj_in: CategoryUpdate) -> LibraryCategory:
    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.flush()
    return db_obj


def delete_category(db: Session, db_obj: LibraryCategory) -> None:
    db.delete(db_obj)
    db.flush()


# --- Resources ---

def get_resources(
    db: Session, tenant_id: UUID,
    category_id: Optional[UUID] = None, resource_type: Optional[str] = None, search: Optional[str] = None,
    page: int = 1, page_size: int = 200,
) -> List[LibraryResource]:
    query = db.query(LibraryResource).filter(LibraryResource.tenant_id == tenant_id)
    if category_id is not None:
        query = query.filter(LibraryResource.category_id == category_id)
    if resource_type:
        query = query.filter(LibraryResource.resource_type == resource_type)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            LibraryResource.title.ilike(like),
            LibraryResource.description.ilike(like),
            LibraryResource.author.ilike(like),
        ))
    return (
        query.order_by(LibraryResource.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )


def get_resource(db: Session, resource_id: UUID, tenant_id: UUID) -> Optional[LibraryResource]:
    return (
        db.query(LibraryResource)
        .filter(LibraryResource.id == resource_id, LibraryResource.tenant_id == tenant_id)
        .first()
    )


def create_resource(db: Session, obj_in: ResourceCreate, tenant_id: UUID, uploaded_by: Optional[UUID]) -> LibraryResource:
    data = obj_in.model_dump()
    data["tags"] = data.get("tags") or []
    db_obj = LibraryResource(**data, tenant_id=tenant_id, uploaded_by=uploaded_by)
    db.add(db_obj)
    db.flush()
    return db_obj


def update_resource(db: Session, db_obj: LibraryResource, obj_in: ResourceUpdate) -> LibraryResource:
    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.flush()
    return db_obj


def delete_resource(db: Session, db_obj: LibraryResource) -> None:
    db.delete(db_obj)
    db.flush()


# --- Borrowing ---

def borrow_resource(
    db: Session, resource: LibraryResource, obj_in: BorrowRequest, tenant_id: UUID,
) -> LibraryBorrowRecord:
    db_obj = LibraryBorrowRecord(
        tenant_id=tenant_id,
        resource_id=resource.id,
        borrowed_by=obj_in.user_id,
        due_date=obj_in.due_date,
        notes=obj_in.notes,
        status="BORROWED",
    )
    resource.available_copies = (resource.available_copies or 0) - 1
    db.add(db_obj)
    db.flush()
    return db_obj


def get_active_borrow_record(db: Session, borrow_id: UUID, tenant_id: UUID) -> Optional[LibraryBorrowRecord]:
    return (
        db.query(LibraryBorrowRecord)
        .filter(
            LibraryBorrowRecord.id == borrow_id,
            LibraryBorrowRecord.tenant_id == tenant_id,
            LibraryBorrowRecord.status == "BORROWED",
        )
        .first()
    )


def return_resource(
    db: Session, borrow_record: LibraryBorrowRecord, resource: Optional[LibraryResource], obj_in: ReturnRequest,
) -> LibraryBorrowRecord:
    from datetime import datetime, timezone
    borrow_record.returned_at = datetime.now(timezone.utc)
    borrow_record.status = "RETURNED"
    borrow_record.notes = obj_in.notes
    if resource is not None:
        resource.available_copies = (resource.available_copies or 0) + 1
    db.flush()
    return borrow_record


def get_active_borrowers(db: Session, tenant_id: UUID, page: int = 1, page_size: int = 200) -> List[LibraryBorrowRecord]:
    return (
        db.query(LibraryBorrowRecord)
        .filter(LibraryBorrowRecord.tenant_id == tenant_id, LibraryBorrowRecord.status == "BORROWED")
        .order_by(LibraryBorrowRecord.due_date.asc())
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )
