"""
AI endpoints for Academy Guinéenne.

Provides Groq-powered chat support and audit analysis.
All endpoints require JWT authentication.
"""

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from app.core.client_ip import get_client_ip

from app.core.security import get_current_user, require_permission, require_plan
from app.services.groq_service import groq_service

logger = logging.getLogger(__name__)

router = APIRouter()

# Every call below is paid for out of one shared Groq quota: these caps keep
# the cost of a single request bounded, whatever the caller sends.
MAX_MESSAGE_CHARS = 4000
MAX_HISTORY_MESSAGES = 20
MAX_AUDIT_DATA_BYTES = 50_000


def _ai_rate_key(request: Request) -> str:
    """Rate-limit per account, not per IP: a whole school behind one Wi-Fi
    shares a single public IP, so an IP bucket let one pupil exhaust the
    limit for every classmate (and let one account dodge it by switching
    networks). The key is set by the auth dependencies below, which FastAPI
    resolves before slowapi's wrapper runs."""
    return getattr(request.state, "ai_rate_key", None) or get_client_ip(request)


# AI endpoints use external LLM API calls — stricter rate limit to control cost
limiter = Limiter(key_func=_ai_rate_key)


def _chat_user(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    request.state.ai_rate_key = f"user:{current_user['id']}"
    return current_user


def _audit_user(
    request: Request,
    current_user: dict = Depends(require_permission("ai:audit")),
) -> dict:
    request.state.ai_rate_key = f"user:{current_user['id']}"
    return current_user


def _bounded_history(items: list[tuple[Any, Any]]) -> Optional[list[dict[str, str]]]:
    """Keep only user/assistant turns (a client-supplied "system" turn would
    override the server prompt), the last MAX_HISTORY_MESSAGES of them, each
    cut to MAX_MESSAGE_CHARS. Truncated rather than rejected: ChatBot.tsx
    resends the whole conversation every turn, so a long chat must keep
    working."""
    kept = [
        {"role": role, "content": content[:MAX_MESSAGE_CHARS]}
        for role, content in items
        if role in ("user", "assistant") and isinstance(content, str) and content
    ]
    return kept[-MAX_HISTORY_MESSAGES:] or None


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
    tenantName: Optional[str] = Field(None, max_length=200)
    userId: Optional[str] = None
    language: Optional[str] = "fr"


class AuditRequest(BaseModel):
    module_description: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Description du module audité (ex: paiements, présences, notes)",
    )
    data: Any = Field(
        ...,
        description="Données à analyser (objet JSON, texte, etc.)",
    )
    stream: bool = Field(False, description="Activer le streaming de la réponse")
    platform_name: Optional[str] = Field(
        None,
        max_length=200,
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
    current_user: dict = Depends(_chat_user),
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
        message = (user_messages[-1].get("content") or "") if user_messages else ""
        # Build history from all messages except the last user message
        history_dicts = _bounded_history([(m.get("role"), m.get("content")) for m in body.messages[:-1]])
        stream = False  # V2 callers handle streaming themselves via fetch
    elif isinstance(body, ChatRequest):
        message = body.message
        history_dicts = _bounded_history([(m.role, m.content) for m in body.history or []])
        stream = body.stream
    else:
        # Matched neither format (ChatRequestV2 has only optional fields, so
        # any JSON object lands here) — previously a 500 on `req.stream`.
        raise HTTPException(status_code=422, detail="Requête invalide : 'message' ou 'messages' requis.")

    if not isinstance(message, str) or len(message) > MAX_MESSAGE_CHARS:
        raise HTTPException(
            status_code=422,
            detail=f"Message trop long : {MAX_MESSAGE_CHARS} caractères maximum.",
        )

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

    if stream:
        chunks = await groq_service.chat_completion(
            message=message,
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
        message=message,
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
    current_user: dict = Depends(_audit_user),
    _plan: dict = Depends(require_plan("pro")),
):
    """
    Audit analysis endpoint.

    Accepts a module description and data payload, returns a structured
    audit report in French. Supports streaming via SSE when `stream=true`.
    Restricted to establishment management (ai:audit).
    """
    data_size = len(json.dumps(req.data, default=str, ensure_ascii=False).encode())
    if data_size > MAX_AUDIT_DATA_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"Données trop volumineuses : {MAX_AUDIT_DATA_BYTES // 1000} Ko maximum.",
        )
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
