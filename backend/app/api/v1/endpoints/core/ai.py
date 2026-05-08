"""
AI endpoints for Academy Guinéenne.

Provides Groq-powered chat support and audit analysis.
All endpoints require JWT authentication.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.security import get_current_user, require_plan
from app.services.groq_service import groq_service

logger = logging.getLogger(__name__)

router = APIRouter()
# AI endpoints use external LLM API calls — stricter rate limit to control cost
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role du message (user ou assistant)")
    content: str = Field(..., description="Contenu du message")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Message de l'utilisateur")
    history: Optional[list[ChatMessage]] = Field(
        None, description="Historique de conversation pour le contexte"
    )
    stream: bool = Field(False, description="Activer le streaming de la réponse")


class ChatRequestV2(BaseModel):
    """Alternative format used by ChatBot.tsx and useAIStream.ts"""
    messages: Optional[list[dict]] = None
    sessionId: Optional[str] = None
    userContext: Optional[dict] = None
    tenantId: Optional[str] = None
    tenantName: Optional[str] = None
    userId: Optional[str] = None
    language: Optional[str] = "fr"


class AuditRequest(BaseModel):
    module_description: str = Field(
        ...,
        min_length=1,
        description="Description du module audité (ex: paiements, présences, notes)",
    )
    data: Any = Field(
        ...,
        description="Données à analyser (objet JSON, texte, etc.)",
    )
    stream: bool = Field(False, description="Activer le streaming de la réponse")
    platform_name: Optional[str] = Field(
        None,
        description="Nom de l'établissement à utiliser dans les réponses IA (remplace 'Academy Guinéenne')",
    )


# ---------------------------------------------------------------------------
# Legacy schema (backward compatibility)
# ---------------------------------------------------------------------------

class AIRequest(BaseModel):
    lesson_id: str
    type: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate/")
def generate_ai_content(
    req: AIRequest,
    current_user: dict = Depends(get_current_user),
):
    """Legacy mock AI content generation (kept for backward compatibility)."""
    if req.type == "SUMMARY":
        return {"content": "Résumé généré par IA pour la leçon " + req.lesson_id}
    elif req.type == "QUIZ":
        return {
            "title": "Quiz sur la leçon",
            "questions": [
                {
                    "question_text": "Question 1 générée par IA?",
                    "options": ["A", "B", "C", "D"],
                    "correct_answer": "A",
                    "points": 1,
                }
            ],
        }
    return {"error": "Unknown type"}


@router.post("/chat")
@limiter.limit("20/minute")
async def chat(
    request: Request,
    body: ChatRequest | ChatRequestV2,
    current_user: dict = Depends(get_current_user),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    Chat support endpoint.

    Accepts two request body formats:
      - V1: {message, history, stream} — original format
      - V2: {messages, sessionId, userContext, ...} — from ChatBot.tsx / useAIStream.ts

    Returns AI-generated responses in French tailored to school management.
    Supports streaming via SSE when `stream=true`.
    """
    # Normalize both formats to the same internal representation
    if isinstance(body, ChatRequestV2) and body.messages:
        # V2 format from ChatBot.tsx / useAIStream.ts
        # Extract last user message as the primary message
        user_messages = [m for m in body.messages if m.get("role") == "user"]
        message = user_messages[-1]["content"] if user_messages else ""
        # Build history from all messages except the last user message
        history = [
            ChatMessage(role=m["role"], content=m["content"])
            for m in body.messages[:-1] if m.get("content")
        ] if len(body.messages) > 1 else None
        stream = False  # V2 callers handle streaming themselves via fetch
        req = ChatRequest(message=message, history=history, stream=stream)
    else:
        req = body
        stream = req.stream

    # Determine the platform name to use in AI responses
    # If tenant name is provided (tenant context), use it instead of "Academy Guinéenne"
    platform_name = "Academy Guinéenne"
    if isinstance(body, ChatRequestV2) and body.tenantName:
        platform_name = body.tenantName

    # Also check current_user tenant if available
    if platform_name == "Academy Guinéenne" and current_user.get("tenant_name"):
        platform_name = current_user["tenant_name"]

    logger.info(
        "AI chat request from user=%s platform=%s (stream=%s)",
        current_user.get("email"),
        platform_name,
        stream,
    )

    history_dicts: Optional[list[dict[str, str]]] = None
    if req.history:
        history_dicts = [{"role": m.role, "content": m.content} for m in req.history]

    if req.stream:
        chunks = await groq_service.chat_completion(
            message=req.message,
            history=history_dicts,
            stream=True,
            platform_name=platform_name,
        )

        async def event_generator():
            try:
                async for chunk in chunks:
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as exc:
                logger.exception("Error in chat stream")
                yield f"data: Erreur de streaming : {exc}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    result = await groq_service.chat_completion(
        message=req.message,
        history=history_dicts,
        stream=False,
        platform_name=platform_name,
    )
    # Wrap backend response in frontend-expected format
    return {
        "response": result.get("content", ""),
        "conversation_id": None,
        "model": result.get("model"),
        "tokens": result.get("tokens"),
    }


@router.post("/audit")
@limiter.limit("10/minute")
async def audit(
    request: Request,
    req: AuditRequest,
    current_user: dict = Depends(get_current_user),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    Audit analysis endpoint.

    Accepts a module description and data payload, returns a structured
    audit report in French. Supports streaming via SSE when `stream=true`.
    """
    # Determine platform name for branded audit responses
    platform_name = req.platform_name or "Academy Guinéenne"
    if platform_name == "Academy Guinéenne" and current_user.get("tenant_name"):
        platform_name = current_user["tenant_name"]

    logger.info(
        "AI audit request from user=%s module=%s platform=%s (stream=%s)",
        current_user.get("email"),
        req.module_description,
        platform_name,
        req.stream,
    )

    if req.stream:
        chunks = await groq_service.audit_analysis(
            module_description=req.module_description,
            data=req.data,
            stream=True,
            platform_name=platform_name,
        )

        async def event_generator():
            try:
                async for chunk in chunks:
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as exc:
                logger.exception("Error in audit stream")
                yield f"data: ❌ Erreur de streaming : {exc}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    result = await groq_service.audit_analysis(
        module_description=req.module_description,
        data=req.data,
        stream=False,
        platform_name=platform_name,
    )
    # Wrap backend response in frontend-expected format
    return {
        "analysis": result.get("content", ""),
        "recommendations": None,
        "score": None,
        "model": result.get("model"),
        "tokens": result.get("tokens"),
    }
