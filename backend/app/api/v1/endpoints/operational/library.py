"""Bibliothèque — migré vers Alembic + ORM (Horizon 2, voir
alembic/versions/20260827_0001_adopt_library_tables.py pour le détail du
schéma repris/complété et des bugs réels corrigés au passage : les
anciens endpoints POST/PUT utilisaient du SQL brut PostgreSQL-only
(gen_random_uuid()/NOW()), jamais exécutable sur SQLite, donc jamais
couvert par un seul test avant cette migration.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.utils.audit import log_audit
from app.models import User
from app.models.library import LibraryCategory, LibraryResource, LibraryBorrowRecord
from app.schemas.library import (
    CategoryCreate, CategoryUpdate, CategoryOut,
    ResourceCreate, ResourceUpdate, ResourceOut,
    BorrowRequest, ReturnRequest,
)
from app.crud import library as crud_library

router = APIRouter()


def _category_out(db: Session, category: LibraryCategory) -> dict:
    out = CategoryOut.model_validate(category).model_dump()
    return out


def _resource_out(db: Session, resource: LibraryResource) -> dict:
    out = ResourceOut.model_validate(resource).model_dump()
    category = None
    if resource.category_id:
        category = db.query(LibraryCategory).filter(LibraryCategory.id == resource.category_id).first()
    uploader = db.query(User).filter(User.id == resource.uploaded_by).first() if resource.uploaded_by else None
    out["category"] = (
        {"id": category.id, "name": category.name, "color": category.color} if category else None
    )
    out["uploader"] = (
        {"first_name": uploader.first_name, "last_name": uploader.last_name} if uploader else None
    )
    return out


# --- Category CRUD ---

@router.get("/categories/")
def list_categories(request: Request, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    return [_category_out(db, c) for c in crud_library.get_categories(db, tenant_id)]


@router.post("/categories/", status_code=status.HTTP_201_CREATED)
def create_category(
    request: Request,
    category: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new library category."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        db_obj = crud_library.create_category(db, category, tenant_id)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_LIBRARY_CATEGORY", resource_type="LIBRARY_CATEGORY",
                  resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return _category_out(db, db_obj)
    except Exception as e:
        db.rollback()
        logger.error("Failed to create library category: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/categories/{category_id}/")
def update_category(
    request: Request,
    category_id: UUID,
    category: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a library category."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    db_obj = crud_library.get_category(db, category_id, tenant_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Category not found")
    if not category.model_dump(exclude_unset=True):
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        db_obj = crud_library.update_category(db, db_obj, category)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_LIBRARY_CATEGORY", resource_type="LIBRARY_CATEGORY",
                  resource_id=str(category_id))
        db.commit()
        db.refresh(db_obj)
        return _category_out(db, db_obj)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to update library category: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/categories/{category_id}/")
def delete_category(
    request: Request,
    category_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a library category."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    db_obj = crud_library.get_category(db, category_id, tenant_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Category not found")
    try:
        crud_library.delete_category(db, db_obj)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_LIBRARY_CATEGORY", resource_type="LIBRARY_CATEGORY",
                  resource_id=str(category_id))
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error("Failed to delete library category: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# --- Resources CRUD ---

@router.get("/resources/")
def list_resources(
    request: Request,
    category: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    category_id = None
    if category and category != "all":
        try:
            category_id = UUID(category)
        except ValueError:
            return []
    resources = crud_library.get_resources(
        db, tenant_id,
        category_id=category_id,
        resource_type=resource_type if resource_type and resource_type != "all" else None,
        search=search, page=page, page_size=page_size,
    )
    return [_resource_out(db, r) for r in resources]


@router.post("/resources/", status_code=status.HTTP_201_CREATED)
def create_resource(
    request: Request,
    resource: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new library resource."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        uploaded_by = current_user.get("id")
        db_obj = crud_library.create_resource(db, resource, tenant_id, uploaded_by)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_LIBRARY_RESOURCE", resource_type="LIBRARY_RESOURCE",
                  resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return _resource_out(db, db_obj)
    except Exception as e:
        db.rollback()
        logger.error("Failed to create library resource: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/resources/{resource_id}/")
def update_resource(
    request: Request,
    resource_id: UUID,
    resource: ResourceUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a library resource."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    db_obj = crud_library.get_resource(db, resource_id, tenant_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Resource not found")
    if not resource.model_dump(exclude_unset=True):
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        db_obj = crud_library.update_resource(db, db_obj, resource)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_LIBRARY_RESOURCE", resource_type="LIBRARY_RESOURCE",
                  resource_id=str(resource_id))
        db.commit()
        db.refresh(db_obj)
        return _resource_out(db, db_obj)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to update library resource: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/resources/{resource_id}/")
def delete_resource(
    request: Request,
    resource_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a library resource."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    db_obj = crud_library.get_resource(db, resource_id, tenant_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Resource not found")
    try:
        crud_library.delete_resource(db, db_obj)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_LIBRARY_RESOURCE", resource_type="LIBRARY_RESOURCE",
                  resource_id=str(resource_id))
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error("Failed to delete library resource: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# --- Borrowing ---

@router.post("/borrow/", status_code=status.HTTP_201_CREATED)
def borrow_resource(
    request: Request,
    borrow: BorrowRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Borrow a library resource."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    resource = crud_library.get_resource(db, borrow.resource_id, tenant_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if (resource.available_copies or 0) <= 0:
        raise HTTPException(status_code=400, detail="No copies available")
    try:
        db_obj = crud_library.borrow_resource(db, resource, borrow, tenant_id)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="BORROW_RESOURCE", resource_type="LIBRARY_BORROW",
                  resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to borrow resource: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")


@router.post("/return/")
def return_resource(
    request: Request,
    ret: ReturnRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return a borrowed library resource."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    borrow_record = crud_library.get_active_borrow_record(db, ret.borrow_id, tenant_id)
    if not borrow_record:
        raise HTTPException(status_code=404, detail="Active borrow record not found")
    resource = crud_library.get_resource(db, borrow_record.resource_id, tenant_id)
    try:
        db_obj = crud_library.return_resource(db, borrow_record, resource, ret)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="RETURN_RESOURCE", resource_type="LIBRARY_BORROW",
                  resource_id=str(ret.borrow_id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to return resource: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")


@router.get("/borrowers/")
def list_borrowers(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List current borrowers (active borrow records)."""
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    records = crud_library.get_active_borrowers(db, tenant_id, page, page_size)
    out = []
    for br in records:
        resource = db.query(LibraryResource).filter(LibraryResource.id == br.resource_id).first()
        borrower = db.query(User).filter(User.id == br.borrowed_by).first()
        out.append({
            "id": br.id,
            "tenant_id": br.tenant_id,
            "resource_id": br.resource_id,
            "borrowed_by": br.borrowed_by,
            "borrowed_at": br.borrowed_at,
            "due_date": br.due_date,
            "returned_at": br.returned_at,
            "status": br.status,
            "notes": br.notes,
            "resource": {"title": resource.title, "type": resource.resource_type} if resource else None,
            "borrower": (
                {"first_name": borrower.first_name, "last_name": borrower.last_name, "email": borrower.email}
                if borrower else None
            ),
        })
    return out
