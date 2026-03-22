from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Any
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()

# --- Schemas ---

class InventoryItemCreate(BaseModel):
    category_id: Optional[str] = None
    name: str
    unit_price: float = 0.0
    stock_quantity: int = 0

class AdjustmentBody(BaseModel):
    item_id: str
    quantity: int
    type: str # IN | OUT | ADJUST
    notes: Optional[str] = None

class OrderCreateBody(BaseModel):
    student_id: Optional[str] = None
    total_amount: float
    payment_method: str
    status: str = "COMPLETED"
    notes: Optional[str] = None
    items: List[dict]

# --- Endpoints ---

@router.get("/categories/")
def list_categories(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    return db.execute(text("SELECT * FROM inventory_categories WHERE tenant_id = :tid ORDER BY name"), {"tid": tenant_id}).mappings().all()

@router.post("/categories/")
def create_category(name: str, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("inventory:write"))):
    tenant_id = current_user["tenant_id"]
    res = db.execute(text("INSERT INTO inventory_categories (tenant_id, name) VALUES (:tid, :name) RETURNING *"), {"tid": tenant_id, "name": name}).mappings().first()
    db.commit()
    return res

@router.get("/items/")
def list_items(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    rows = db.execute(text("""
        SELECT i.*, c.name as category_name 
        FROM inventory_items i 
        LEFT JOIN inventory_categories c ON c.id = i.category_id 
        WHERE i.tenant_id = :tid 
        ORDER BY i.name
    """), {"tid": tenant_id}).fetchall()
    return [{**dict(r._mapping), "category": {"id": r.category_id, "name": r.category_name}} for r in rows]

@router.post("/items/")
def create_item(item: InventoryItemCreate, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("inventory:write"))):
    tenant_id = current_user["tenant_id"]
    res = db.execute(text("""
        INSERT INTO inventory_items (tenant_id, category_id, name, unit_price, stock_quantity)
        VALUES (:tid, :cid, :name, :price, :qty) RETURNING *
    """), {
        "tid": tenant_id, "cid": item.category_id, "name": item.name, 
        "price": item.unit_price, "qty": item.stock_quantity
    }).mappings().first()
    db.commit()
    return res

@router.patch("/items/{item_id}/")
def update_item(item_id: str, item: dict, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("inventory:write"))):
    tenant_id = current_user["tenant_id"]
    # Dynamic update
    cols = []
    params = {"tid": tenant_id, "iid": item_id}
    for k, v in item.items():
        if k in ["name", "unit_price", "stock_quantity", "category_id"]:
            cols.append(f"{k} = :{k}")
            params[k] = v
    if not cols: return {"message": "No fields to update"}
    query = f"UPDATE inventory_items SET {', '.join(cols)} WHERE id = :iid AND tenant_id = :tid RETURNING *"
    res = db.execute(text(query), params).mappings().first()
    db.commit()
    return res

@router.delete("/items/{item_id}/")
def delete_item(item_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("inventory:write"))):
    tenant_id = current_user["tenant_id"]
    db.execute(text("DELETE FROM inventory_items WHERE id = :iid AND tenant_id = :tid"), {"iid": item_id, "tid": tenant_id})
    db.commit()
    return {"message": "Item deleted"}

@router.get("/transactions/")
def list_transactions(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    return db.execute(text("""
        SELECT t.*, i.name as item_name 
        FROM inventory_transactions t 
        JOIN inventory_items i ON i.id = t.item_id 
        WHERE t.tenant_id = :tid 
        ORDER BY t.created_at DESC
    """), {"tid": tenant_id}).mappings().all()

@router.post("/adjust/")
def adjust_stock(body: AdjustmentBody, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("inventory:write"))):
    tenant_id = current_user["tenant_id"]
    # Check item
    item = db.execute(text("SELECT stock_quantity FROM inventory_items WHERE id = :iid AND tenant_id = :tid"), {"iid": body.item_id, "tid": tenant_id}).mappings().first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    
    new_qty = item["stock_quantity"]
    if body.type == "IN": new_qty += body.quantity
    elif body.type == "OUT": new_qty -= body.quantity
    elif body.type == "ADJUST": new_qty = body.quantity
    
    db.execute(text("UPDATE inventory_items SET stock_quantity = :qty WHERE id = :iid"), {"qty": new_qty, "iid": body.item_id})
    # Transaction log (create table if missing or use generic log)
    # For now just update
    db.commit()
    return {"stock_quantity": new_qty}

@router.get("/orders/")
def list_orders(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    rows = db.execute(text("""
        SELECT o.*, s.first_name, s.last_name, s.registration_number
        FROM orders o
        LEFT JOIN students s ON s.id = o.student_id
        WHERE o.tenant_id = :tid
        ORDER BY o.created_at DESC
    """), {"tid": tenant_id}).fetchall()
    return [{**dict(r._mapping), "student": {"id": r.student_id, "first_name": r.first_name, "last_name": r.last_name, "registration_number": r.registration_number}} for r in rows]

@router.post("/orders/")
def create_order(body: OrderCreateBody, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("inventory:write"))):
    tenant_id = current_user["tenant_id"]
    order_id = db.execute(text("""
        INSERT INTO orders (tenant_id, student_id, total_amount, payment_method, status, notes)
        VALUES (:tid, :sid, :amount, :method, :status, :notes) RETURNING id
    """), {
        "tid": tenant_id, "sid": body.student_id, "amount": body.total_amount, 
        "method": body.payment_method, "status": body.status, "notes": body.notes
    }).scalar()
    
    for item in body.items:
        db.execute(text("""
            INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, total_price)
            VALUES (:oid, :iid, :name, :qty, :price, :total)
        """), {
            "oid": order_id, "iid": item.get("item_id"), "name": item.get("item_name"),
            "qty": item.get("quantity"), "price": item.get("unit_price"), "total": item.get("total_price")
        })
        # Stock adjustment
        if item.get("item_id"):
            db.execute(text("UPDATE inventory_items SET stock_quantity = stock_quantity - :qty WHERE id = :iid"), {"qty": item.get("quantity"), "iid": item.get("item_id")})

    db.commit()
    return {"id": str(order_id), "message": "Order created"}
