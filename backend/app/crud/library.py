from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.library import LibraryCategory, LibraryResource, LibraryBorrowRecord
from app.models.user import User
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

    # BUSINESS-RULE FIX (institutional-readiness audit, 2026-09): a lone
    # total_copies update (the common case — reducing it after a copy is
    # lost/damaged) bypassed ResourceUpdate's own cross-field validator,
    # which only fires when both fields are present in the same request.
    # Re-check against the merged, final row.
    if (db_obj.available_copies or 0) > (db_obj.total_copies or 0):
        raise ValueError(
            f"Le nombre d'exemplaires disponibles ({db_obj.available_copies}) ne peut pas "
            f"dépasser le nombre total d'exemplaires ({db_obj.total_copies})"
        )

    db.flush()
    return db_obj


def delete_resource(db: Session, db_obj: LibraryResource) -> None:
    db.delete(db_obj)
    db.flush()


# --- Borrowing ---

def borrow_resource(
    db: Session, resource: LibraryResource, obj_in: BorrowRequest, tenant_id: UUID,
) -> LibraryBorrowRecord:
    # DATA-INTEGRITY FIX (institutional-readiness audit, 2026-09):
    # obj_in.user_id was written straight into borrowed_by with no check
    # it belongs to this tenant — a librarian could attribute a borrow to
    # an arbitrary/cross-tenant user id, and list_borrowers would just show
    # a silent null borrower (the User lookup returns None) instead of
    # rejecting the bad data at write time.
    borrower = db.query(User).filter(User.id == obj_in.user_id, User.tenant_id == tenant_id).first()
    if not borrower:
        raise ValueError("Utilisateur introuvable dans cet établissement")

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
    # BUG FIX (institutional-readiness audit, 2026-09): this used to be
    # `borrow_record.notes = obj_in.notes` — an unconditional overwrite
    # that silently destroyed whatever note was recorded at borrow time
    # (e.g. "couverture déjà abîmée au prêt") whenever the return-time
    # note was empty/None. Appended instead, so both halves of the audit
    # trail survive.
    if obj_in.notes:
        borrow_record.notes = f"{borrow_record.notes}\n\nRetour : {obj_in.notes}" if borrow_record.notes else obj_in.notes
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
