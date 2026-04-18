import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from uuid import UUID
import datetime, json

from app.core.database import get_db
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Schemas ──────────────────────────────────────────────────────────────────

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    target_roles: List[str]
    pinned: bool = False

class MessageCreate(BaseModel):
    content: str
    conversation_id: Optional[str] = None  # existing conversation
    recipient_id: Optional[str] = None      # create new 1-on-1 conversation

class ConversationCreate(BaseModel):
    recipient_id: str
    initial_message: Optional[str] = None


# ─── Announcements ────────────────────────────────────────────────────────────

@router.get("/announcements/")
def get_announcements(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        tenant_id = current_user.get("tenant_id")
        query = text("""
            SELECT id, tenant_id, author_id, title, content, target_roles, pinned, published_at, created_at, deleted_at 
            FROM announcements 
            WHERE tenant_id = :tenant_id AND deleted_at IS NULL
            ORDER BY pinned DESC, created_at DESC
        """)
        result = db.execute(query, {"tenant_id": tenant_id}).mappings().all()
        return result
    except Exception as e:
        db.rollback()
        logger.error("Error getting announcements: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.post("/announcements/")
def create_announcement(
    announcement: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        tenant_id = current_user.get("tenant_id")
        author_id = current_user.get("id")
        try:
            result = db.execute(text("""
                INSERT INTO announcements (id, tenant_id, author_id, title, content, target_roles, pinned, published_at, created_at)
                VALUES (gen_random_uuid(), :tenant_id, :author_id, :title, :content, :target_roles, :pinned, :published_at, NOW())
                RETURNING id, tenant_id, author_id, title, content, target_roles, pinned, published_at, created_at, deleted_at
            """), {
                "tenant_id": tenant_id, "author_id": author_id,
                "title": announcement.title, "content": announcement.content,
                "target_roles": announcement.target_roles,
                "pinned": announcement.pinned, "published_at": datetime.datetime.now()
            }).mappings().first()
            db.commit()
            return result
        except Exception:
            db.rollback()
            result = db.execute(text("""
                INSERT INTO announcements (tenant_id, author_id, title, content, target_roles, pinned, published_at)
                VALUES (:tenant_id, :author_id, :title, :content, cast(:target_roles as jsonb), :pinned, :published_at)
                RETURNING id, tenant_id, author_id, title, content, target_roles, pinned, published_at, created_at, deleted_at
            """), {
                "tenant_id": tenant_id, "author_id": author_id,
                "title": announcement.title, "content": announcement.content,
                "target_roles": json.dumps(announcement.target_roles),
                "pinned": announcement.pinned, "published_at": datetime.datetime.now()
            }).mappings().first()
            db.commit()
            return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error creating announcement: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.delete("/announcements/{announcement_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        tenant_id = current_user.get("tenant_id")
        db.execute(text("""
            UPDATE announcements SET deleted_at = NOW() 
            WHERE id = :id AND tenant_id = :tenant_id
        """), {"id": str(announcement_id), "tenant_id": tenant_id})
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        logger.error("Error deleting announcement: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Messaging Helper endpoints ───────────────────────────────────────────────

@router.get("/messaging/users/")
def get_messaging_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        tenant_id = current_user.get("tenant_id")
        result = db.execute(text("""
            SELECT id, first_name, last_name, email FROM users
            WHERE tenant_id = :tenant_id
        """), {"tenant_id": tenant_id}).mappings().all()
        return result
    except Exception as e:
        db.rollback()
        logger.error("Error getting messaging users: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/messaging/teacher-recipients/")
def get_teacher_recipients(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")
        
        parents = db.execute(text("""
            SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, 'Parent' as info
            FROM teacher_assignments ta
            JOIN enrollments e ON e.class_id = ta.class_id AND e.status = 'active'
            JOIN parent_students ps ON ps.student_id = e.student_id
            JOIN users u ON u.id = ps.parent_id
            WHERE ta.teacher_id = :user_id AND ta.tenant_id = :tenant_id
        """), {"user_id": user_id, "tenant_id": tenant_id}).mappings().all()
        
        teachers = db.execute(text("""
            SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, 'Enseignant' as info
            FROM teacher_assignments ta
            JOIN users u ON u.id = ta.teacher_id
            WHERE ta.tenant_id = :tenant_id AND ta.teacher_id != :user_id
        """), {"user_id": user_id, "tenant_id": tenant_id}).mappings().all()
        
        def fmt(row):
            return {
                "id": str(row["id"]),
                "name": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
                "first_name": row.get("first_name", ""),
                "last_name": row.get("last_name", ""),
                "email": row.get("email", ""),
                "info": row.get("info", "")
            }
        return [fmt(r) for r in list(parents) + list(teachers)]
    except Exception as e:
        db.rollback()
        logger.error("Error getting teacher recipients: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Conversations ────────────────────────────────────────────────────────────

@router.get("/conversations/")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """List all conversations for the current user with last message preview."""
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")

        rows = db.execute(text("""
            SELECT 
                c.id, c.type, c.title, c.tenant_id, c.created_at,
                m.content AS last_message, m.created_at AS last_message_at,
                sender.first_name AS sender_first, sender.last_name AS sender_last,
                COUNT(um.id) FILTER (WHERE um.is_read = false AND um.user_id = :user_id) AS unread_count,
                -- Other participant info for 1-on-1 conversations
                (
                    SELECT CONCAT(u2.first_name, ' ', u2.last_name) 
                    FROM conversation_participants cp2
                    JOIN users u2 ON u2.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id AND cp2.user_id != :user_id
                    LIMIT 1
                ) AS other_name,
                (
                    SELECT cp2.user_id
                    FROM conversation_participants cp2
                    WHERE cp2.conversation_id = c.id AND cp2.user_id != :user_id
                    LIMIT 1
                ) AS other_user_id
            FROM conversations c
            JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = :user_id
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
            )
            LEFT JOIN users sender ON sender.id = m.sender_id
            LEFT JOIN user_message_status um ON um.message_id = m.id
            WHERE c.tenant_id = :tenant_id
            GROUP BY c.id, c.type, c.title, c.tenant_id, c.created_at, m.content, m.created_at,
                     sender.first_name, sender.last_name
            ORDER BY COALESCE(m.created_at, c.created_at) DESC
        """), {"user_id": user_id, "tenant_id": tenant_id}).fetchall()

        return [{
            "id": str(r.id), "type": r.type, "title": r.title or r.other_name,
            "last_message": r.last_message,
            "last_message_at": r.last_message_at.isoformat() if r.last_message_at else None,
            "sender_name": f"{r.sender_first or ''} {r.sender_last or ''}".strip(),
            "unread_count": int(r.unread_count or 0),
            "other_user_id": str(r.other_user_id) if r.other_user_id else None,
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error listing conversations: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.post("/conversations/", status_code=status.HTTP_201_CREATED)
def create_or_find_conversation(
    body: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Find or create a direct 1-on-1 conversation. Returns conversation_id."""
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")

        # Check if 1-on-1 conversation already exists
        existing = db.execute(text("""
            SELECT c.id FROM conversations c
            JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = :user_id
            JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = :recipient_id
            WHERE c.type = 'DIRECT' AND c.tenant_id = :tenant_id
            LIMIT 1
        """), {"user_id": user_id, "recipient_id": body.recipient_id, "tenant_id": tenant_id}).fetchone()

        if existing:
            conv_id = str(existing.id)
        else:
            conv_id = db.execute(text("""
                INSERT INTO conversations (tenant_id, type, created_at)
                VALUES (:tenant_id, 'DIRECT', NOW())
                RETURNING id
            """), {"tenant_id": tenant_id}).scalar()

            db.execute(text("""
                INSERT INTO conversation_participants (conversation_id, user_id)
                VALUES (:conv_id, :user1), (:conv_id, :user2)
            """), {"conv_id": str(conv_id), "user1": user_id, "user2": body.recipient_id})

        # Send initial message if provided
        if body.initial_message:
            msg_id = db.execute(text("""
                INSERT INTO messages (conversation_id, sender_id, content, tenant_id, created_at)
                VALUES (:conv_id, :sender_id, :content, :tenant_id, NOW())
                RETURNING id
            """), {"conv_id": str(conv_id), "sender_id": user_id,
                   "content": body.initial_message, "tenant_id": tenant_id}).scalar()
            db.execute(text("""
                INSERT INTO user_message_status (message_id, user_id, is_read)
                SELECT :msg_id, cp.user_id, (cp.user_id = :sender_id)
                FROM conversation_participants cp WHERE cp.conversation_id = :conv_id
            """), {"msg_id": str(msg_id), "sender_id": user_id, "conv_id": str(conv_id)})

        db.commit()
        return {"conversation_id": str(conv_id)}
    except Exception as e:
        db.rollback()
        logger.error("Error creating conversation: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Messages ─────────────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages/")
def get_messages(
    conversation_id: str,
    before: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Get messages for a conversation with pagination. Also marks messages as read."""
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")

        # Verify user is participant
        part = db.execute(text("""
            SELECT id FROM conversation_participants
            WHERE conversation_id = :conv_id AND user_id = :user_id
        """), {"conv_id": conversation_id, "user_id": user_id}).fetchone()
        if not part:
            raise HTTPException(status_code=403, detail="Accès refusé")

        cursor = f"AND m.created_at < :before" if before else ""
        params: dict = {"conv_id": conversation_id, "limit": limit}
        if before:
            params["before"] = before

        rows = db.execute(text(f"""
            SELECT m.id, m.content, m.created_at, m.sender_id,
                   u.first_name AS sender_first, u.last_name AS sender_last,
                   u.avatar_url AS sender_avatar,
                   ums.is_read
            FROM messages m
            LEFT JOIN users u ON u.id = m.sender_id
            LEFT JOIN user_message_status ums ON ums.message_id = m.id AND ums.user_id = :user_id
            WHERE m.conversation_id = :conv_id {cursor}
            ORDER BY m.created_at DESC
            LIMIT :limit
        """), {**params, "user_id": user_id}).fetchall()

        # Mark as read
        db.execute(text("""
            UPDATE user_message_status SET is_read = true
            WHERE user_id = :user_id AND is_read = false
            AND message_id IN (
                SELECT id FROM messages WHERE conversation_id = :conv_id
            )
        """), {"user_id": user_id, "conv_id": conversation_id})
        db.commit()

        return [{
            "id": str(r.id),
            "content": r.content,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "sender_id": str(r.sender_id) if r.sender_id else None,
            "sender": {
                "first_name": r.sender_first,
                "last_name": r.sender_last,
                "avatar_url": r.sender_avatar,
            },
            "is_read": r.is_read,
            "is_own": str(r.sender_id) == str(user_id),
        } for r in reversed(rows)]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error getting messages: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.post("/conversations/{conversation_id}/messages/", status_code=status.HTTP_201_CREATED)
def send_message(
    conversation_id: str,
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Send a message in a conversation."""
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")

        # Verify participant
        part = db.execute(text("""
            SELECT id FROM conversation_participants
            WHERE conversation_id = :conv_id AND user_id = :user_id
        """), {"conv_id": conversation_id, "user_id": user_id}).fetchone()
        if not part:
            raise HTTPException(status_code=403, detail="Accès refusé")

        msg_id = db.execute(text("""
            INSERT INTO messages (conversation_id, sender_id, content, tenant_id, created_at)
            VALUES (:conv_id, :sender_id, :content, :tenant_id, NOW())
            RETURNING id
        """), {"conv_id": conversation_id, "sender_id": user_id,
               "content": body.content, "tenant_id": tenant_id}).scalar()

        # Set read status for all participants
        db.execute(text("""
            INSERT INTO user_message_status (message_id, user_id, is_read)
            SELECT :msg_id, cp.user_id, (cp.user_id = :sender_id)
            FROM conversation_participants cp
            WHERE cp.conversation_id = :conv_id
            ON CONFLICT DO NOTHING
        """), {"msg_id": str(msg_id), "sender_id": user_id, "conv_id": conversation_id})

        db.commit()
        return {"id": str(msg_id), "created_at": datetime.datetime.now().isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error sending message: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/messaging/unread-count/")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Return total unread message count for the current user — used for polling."""
        user_id = current_user.get("id")
        count = db.execute(text("""
            SELECT COUNT(*) FROM user_message_status
            WHERE user_id = :user_id AND is_read = false
        """), {"user_id": user_id}).scalar() or 0
        return {"unread": int(count)}
    except Exception as e:
        db.rollback()
        logger.error("Error getting unread count: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


@router.get("/messaging/poll/")
def poll_new_messages(
    since: str = Query(..., description="ISO timestamp: return messages after this"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        """Long-poll endpoint: returns new messages since timestamp — replaces Supabase Realtime."""
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")

        rows = db.execute(text("""
            SELECT m.id, m.content, m.created_at, m.sender_id, m.conversation_id,
                   u.first_name, u.last_name
            FROM messages m
            JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = :user_id
            LEFT JOIN users u ON u.id = m.sender_id
            WHERE m.created_at > :since AND m.tenant_id = :tenant_id AND m.sender_id != :user_id
            ORDER BY m.created_at ASC
            LIMIT 50
        """), {"user_id": user_id, "tenant_id": tenant_id, "since": since}).fetchall()

        return [{
            "id": str(r.id), "content": r.content,
            "created_at": r.created_at.isoformat(),
            "sender_id": str(r.sender_id),
            "conversation_id": str(r.conversation_id),
            "sender_name": f"{r.first_name or ''} {r.last_name or ''}".strip()
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error polling messages: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

# --- Forums ---

@router.get("/forums/")
def list_forums(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        return db.execute(text("""
            SELECT f.*, p.first_name, p.last_name
            FROM student_forums f
            LEFT JOIN profiles p ON p.id = f.created_by
            WHERE f.tenant_id = :tid
            ORDER BY f.created_at DESC
        """), {"tid": tenant_id}).mappings().all()
    except Exception as e:
        db.rollback()
        logger.error("Error listing forums: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/forums/post-counts/")
def get_forum_post_counts(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return {}
        rows = db.execute(text("""
            SELECT forum_id, COUNT(*) as count
            FROM forum_posts
            WHERE tenant_id = :tid
            GROUP BY forum_id
        """), {"tid": tenant_id}).mappings().all()
        return {str(r["forum_id"]): r["count"] for r in rows}
    except Exception as e:
        db.rollback()
        logger.error("Error getting forum post counts: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.post("/forums/")
def create_forum(body: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        user_id = current_user.get("id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="No tenant context")
        forum_id = db.execute(text("""
            INSERT INTO student_forums (tenant_id, title, description, category, is_active, created_by, created_at)
            VALUES (:tid, :title, :desc, :cat, :active, :uid, NOW())
            RETURNING id
        """), {
            "tid": tenant_id, "title": body["title"], "desc": body.get("description"),
            "cat": body.get("category"), "active": body.get("is_active", True),
            "uid": user_id
        }).scalar()
        db.commit()
        return {"id": str(forum_id)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error creating forum: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.patch("/forums/{forum_id}/")
def update_forum(forum_id: UUID, body: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="No tenant context")
        db.execute(text("""
            UPDATE student_forums SET 
                title = :title, description = :desc, category = :cat, is_active = :active
            WHERE id = :fid AND tenant_id = :tid
        """), {
            "fid": str(forum_id), "tid": tenant_id,
            "title": body["title"], "desc": body.get("description"),
            "cat": body.get("category"), "active": body.get("is_active", True)
        })
        db.commit()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating forum: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.delete("/forums/{forum_id}/")
def delete_forum(forum_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="No tenant context")
        db.execute(text("DELETE FROM student_forums WHERE id = :fid AND tenant_id = :tid"), {"fid": str(forum_id), "tid": tenant_id})
        db.commit()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting forum: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")
