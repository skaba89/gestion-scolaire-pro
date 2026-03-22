from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from app.core.database import get_db
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/keycloak/")
async def keycloak_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_keycloak_signature: str = Header(None)
):
    """
    Endpoint to receive events from Keycloak (requires an event listener plugin in Keycloak).
    Synchronizes user profiles and roles in the local database.
    """
    # In production, verify the signature or use a secret token
    # For now, we log and process
    try:
        data = await request.json()
        event_type = data.get("type")
        user_id = data.get("userId")
        
        logger.info(f"Received Keycloak event: {event_type} for user {user_id}")
        
        if not user_id:
            return {"status": "ignored", "reason": "no userId"}

        if event_type in ["REGISTER", "UPDATE_PROFILE"]:
            details = data.get("details", {})
            email = details.get("email") or data.get("email")
            first_name = details.get("first_name") or data.get("firstName") or ""
            last_name = details.get("last_name") or data.get("lastName") or ""
            
            # Update or create user in local DB
            sql = text("""
                INSERT INTO users (id, keycloak_id, email, first_name, last_name, is_active, updated_at)
                VALUES (:id, :id, :email, :first_name, :last_name, true, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    updated_at = NOW()
            """)
            db.execute(sql, {
                "id": user_id,
                "email": email,
                "first_name": first_name,
                "last_name": last_name
            })
            db.commit()
            
        elif event_type == "DELETE_ACCOUNT":
            # Deactivate or delete user
            db.execute(text("UPDATE users SET is_active = false, updated_at = NOW() WHERE id = :id"), {"id": user_id})
            db.commit()
            
        return {"status": "success", "event": event_type}
        
    except Exception as e:
        logger.error(f"Error processing Keycloak webhook: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error during webhook processing")
