from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

router = APIRouter()


# --- Category CRUD ---

@router.get("/")
def list_categories(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    return db.execute(text("SELECT * FROM library_categories WHERE tenant_id = :tid ORDER BY name"), {"tid": tenant_id}).mappings().all()


class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


@router.post("/categories/", status_code=status.HTTP_201_CREATED)
def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new library category."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO library_categories (id, tenant_id, name, description, color, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :name, :desc, :color, NOW(), NOW())
            RETURNING id, tenant_id, name, description, color, created_at, updated_at
        """), {
            "tid": tenant_id,
            "name": category.name,
            "desc": category.description,
            "color": category.color,
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_LIBRARY_CATEGORY", resource_type="LIBRARY_CATEGORY",
                  resource_id=str(result["id"]))
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/categories/{category_id}/")
def update_category(
    category_id: UUID,
    category: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a library category."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        sets = []
        params = {"cid": str(category_id), "tid": tenant_id, "now": datetime.utcnow()}
        if category.name is not None:
            sets.append("name = :name")
            params["name"] = category.name
        if category.description is not None:
            sets.append("description = :desc")
            params["desc"] = category.description
        if category.color is not None:
            sets.append("color = :color")
            params["color"] = category.color
        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")
        sets.append("updated_at = :now")
        query_str = f"""
            UPDATE library_categories SET {', '.join(sets)}
            WHERE id = :cid AND tenant_id = :tid
            RETURNING id, tenant_id, name, description, color, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Category not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_LIBRARY_CATEGORY", resource_type="LIBRARY_CATEGORY",
                  resource_id=str(category_id))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/categories/{category_id}/")
def delete_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a library category."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("DELETE FROM library_categories WHERE id = :cid AND tenant_id = :tid"),
                            {"cid": str(category_id), "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Category not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_LIBRARY_CATEGORY", resource_type="LIBRARY_CATEGORY",
                  resource_id=str(category_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# --- Resources CRUD ---

@router.get("/resources/")
def list_resources(
    category: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    query = """
        SELECT r.*, c.name as category_name, c.color as category_color,
               u.first_name as uploader_first_name, u.last_name as uploader_last_name
        FROM library_resources r
        LEFT JOIN library_categories c ON c.id = r.category_id
        LEFT JOIN users u ON u.id = r.uploaded_by
        WHERE r.tenant_id = :tid
    """
    params = {"tid": tenant_id}
    if category and category != "all":
        query += " AND r.category_id = :cid"
        params["cid"] = category
    if resource_type and resource_type != "all":
        query += " AND r.resource_type = :rtype"
        params["rtype"] = resource_type
    if search:
        query += " AND (r.title ILIKE :s OR r.description ILIKE :s OR r.author ILIKE :s)"
        params["s"] = f"%{search}%"

    query += " ORDER BY r.created_at DESC"
    rows = db.execute(text(query), params).fetchall()
    return [{
        **dict(r._mapping),
        "category": {"id": r.category_id, "name": r.category_name, "color": r.category_color},
        "uploader": {"first_name": r.uploader_first_name, "last_name": r.uploader_last_name}
    } for r in rows]


class ResourceCreate(BaseModel):
    title: str
    description: Optional[str] = None
    author: Optional[str] = None
    resource_type: str = "BOOK"
    category_id: Optional[str] = None
    isbn: Optional[str] = None
    total_copies: int = 1
    available_copies: int = 1
    file_url: Optional[str] = None
    cover_url: Optional[str] = None


class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    resource_type: Optional[str] = None
    category_id: Optional[str] = None
    isbn: Optional[str] = None
    total_copies: Optional[int] = None
    available_copies: Optional[int] = None
    file_url: Optional[str] = None
    cover_url: Optional[str] = None


@router.post("/resources/", status_code=status.HTTP_201_CREATED)
def create_resource(
    resource: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new library resource."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO library_resources (id, tenant_id, title, description, author, resource_type,
                category_id, isbn, total_copies, available_copies, file_url, cover_url, uploaded_by, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :title, :desc, :author, :rtype, :cid, :isbn,
                :total, :available, :furl, :curl, :uid, NOW(), NOW())
            RETURNING id, tenant_id, title, description, author, resource_type, category_id,
                isbn, total_copies, available_copies, file_url, cover_url, uploaded_by, created_at, updated_at
        """), {
            "tid": tenant_id,
            "title": resource.title,
            "desc": resource.description,
            "author": resource.author,
            "rtype": resource.resource_type,
            "cid": resource.category_id,
            "isbn": resource.isbn,
            "total": resource.total_copies,
            "available": resource.available_copies,
            "furl": resource.file_url,
            "curl": resource.cover_url,
            "uid": current_user.get("id"),
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_LIBRARY_RESOURCE", resource_type="LIBRARY_RESOURCE",
                  resource_id=str(result["id"]))
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/resources/{resource_id}/")
def update_resource(
    resource_id: UUID,
    resource: ResourceUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a library resource."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        sets = []
        params = {"rid": str(resource_id), "tid": tenant_id, "now": datetime.utcnow()}
        field_map = {
            "title": resource.title,
            "description": resource.description,
            "author": resource.author,
            "resource_type": resource.resource_type,
            "category_id": resource.category_id,
            "isbn": resource.isbn,
            "total_copies": resource.total_copies,
            "available_copies": resource.available_copies,
            "file_url": resource.file_url,
            "cover_url": resource.cover_url,
        }
        for col, val in field_map.items():
            if val is not None:
                sets.append(f"{col} = :{col}")
                params[col] = val
        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")
        sets.append("updated_at = :now")
        query_str = f"""
            UPDATE library_resources SET {', '.join(sets)}
            WHERE id = :rid AND tenant_id = :tid
            RETURNING id, tenant_id, title, description, author, resource_type, category_id,
                isbn, total_copies, available_copies, file_url, cover_url, uploaded_by, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Resource not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_LIBRARY_RESOURCE", resource_type="LIBRARY_RESOURCE",
                  resource_id=str(resource_id))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/resources/{resource_id}/")
def delete_resource(
    resource_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a library resource."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("DELETE FROM library_resources WHERE id = :rid AND tenant_id = :tid"),
                            {"rid": str(resource_id), "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Resource not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_LIBRARY_RESOURCE", resource_type="LIBRARY_RESOURCE",
                  resource_id=str(resource_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# --- Borrowing ---

class BorrowRequest(BaseModel):
    resource_id: str
    user_id: str
    due_date: str
    notes: Optional[str] = None


class ReturnRequest(BaseModel):
    borrow_id: str
    notes: Optional[str] = None


@router.post("/borrow/", status_code=status.HTTP_201_CREATED)
def borrow_resource(
    borrow: BorrowRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Borrow a library resource."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        # Check availability
        resource = db.execute(text("""
            SELECT available_copies, total_copies FROM library_resources
            WHERE id = :rid AND tenant_id = :tid
        """), {"rid": borrow.resource_id, "tid": tenant_id}).mappings().first()
        if not resource:
            raise HTTPException(status_code=404, detail="Resource not found")
        if resource["available_copies"] <= 0:
            raise HTTPException(status_code=400, detail="No copies available")

        # Create borrow record
        result = db.execute(text("""
            INSERT INTO library_borrow_records (id, tenant_id, resource_id, borrowed_by, borrowed_at, due_date, status, notes)
            VALUES (gen_random_uuid(), :tid, :rid, :uid, NOW(), :due, 'BORROWED', :notes)
            RETURNING id, tenant_id, resource_id, borrowed_by, borrowed_at, due_date, status, notes
        """), {
            "tid": tenant_id,
            "rid": borrow.resource_id,
            "uid": borrow.user_id,
            "due": borrow.due_date,
            "notes": borrow.notes,
        }).mappings().first()

        # Decrement available copies
        db.execute(text("""
            UPDATE library_resources SET available_copies = available_copies - 1, updated_at = NOW()
            WHERE id = :rid AND tenant_id = :tid
        """), {"rid": borrow.resource_id, "tid": tenant_id})

        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="BORROW_RESOURCE", resource_type="LIBRARY_BORROW",
                  resource_id=str(result["id"]))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/return/")
def return_resource(
    ret: ReturnRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return a borrowed library resource."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        # Update borrow record
        result = db.execute(text("""
            UPDATE library_borrow_records SET returned_at = NOW(), status = 'RETURNED', notes = :notes
            WHERE id = :bid AND tenant_id = :tid AND status = 'BORROWED'
            RETURNING id, tenant_id, resource_id, borrowed_by, borrowed_at, due_date, returned_at, status, notes
        """), {
            "bid": ret.borrow_id,
            "tid": tenant_id,
            "notes": ret.notes,
        }).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Active borrow record not found")

        # Increment available copies
        db.execute(text("""
            UPDATE library_resources SET available_copies = available_copies + 1, updated_at = NOW()
            WHERE id = :rid AND tenant_id = :tid
        """), {"rid": str(result["resource_id"]), "tid": tenant_id})

        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="RETURN_RESOURCE", resource_type="LIBRARY_BORROW",
                  resource_id=str(ret.borrow_id))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/borrowers/")
def list_borrowers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List current borrowers (active borrow records)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT br.*, r.title as resource_title, r.resource_type,
               u.first_name, u.last_name, u.email
        FROM library_borrow_records br
        JOIN library_resources r ON r.id = br.resource_id
        JOIN users u ON u.id = br.borrowed_by
        WHERE br.tenant_id = :tid AND br.status = 'BORROWED'
        ORDER BY br.due_date ASC
    """), {"tid": tenant_id}).fetchall()
    return [{
        **dict(r._mapping),
        "resource": {"title": r.resource_title, "type": r.resource_type},
        "borrower": {"first_name": r.first_name, "last_name": r.last_name, "email": r.email}
    } for r in rows]
