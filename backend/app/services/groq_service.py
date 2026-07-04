"""
AI Service for SchoolFlow Pro.

Supports two providers with automatic fallback:
  1. Groq       — fast inference (primary if GROQ_API_KEY is set)
  2. OpenRouter  — multi-model gateway (fallback, or primary if Groq is absent)

Both expose an OpenAI-compatible API so a single client pattern works.
"""

import logging
from typing import Any, AsyncGenerator, Optional

from groq import AsyncGroq, GroqError

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompts (French)
# ---------------------------------------------------------------------------

CHAT_SYSTEM_PROMPT = (
    "Tu es un assistant intelligent pour {platform_name}, une plateforme de gestion "
    "scolaire complète. Tu aides les utilisateurs (administrateurs, enseignants, "
    "parents, élèves, personnel) à naviguer et utiliser le système efficacement.\n\n"
    "Règles :\n"
    "- Réponds TOUJOURS en français.\n"
    "- Sois concis, professionnel et bienveillant.\n"
    "- Si on te pose une question hors du contexte scolaire, redirige poliment.\n"
    "- Quand c'est pertinent, suggère des fonctionnalités de {platform_name} "
    "(notes, présences, paiements, emploi du temps, communication, etc.).\n"
    "- Quand tu mentionnes la plateforme, utilise TOUJOURS le nom \"{platform_name}\" "
    "et JAMAIS \"Academy Guinéenne\".\n"
    "- Ne divulgue jamais d'informations sensibles sur les élèves ou le personnel."
)

AUDIT_SYSTEM_PROMPT = (
    "Tu es un auditeur scolaire expert intégré à {platform_name}. Tu analyses les "
    "données opérationnelles et financières d'un établissement scolaire pour "
    "fournir des rapports d'audit clairs et actionnables.\n\n"
    "Règles :\n"
    "- Réponds TOUJOURS en français.\n"
    "- Structure tes réponses avec des sections claires : Résumé, Constats, "
    "Risques identifiés, Recommandations.\n"
    "- Sois objectif et factuel.\n"
    "- Signale les anomalies et les écarts par rapport aux normes scolaires.\n"
    "- Propose des améliorations concrètes et réalistes.\n"
    "- Si les données sont insuffisantes, indique les informations manquantes."
)


# ---------------------------------------------------------------------------
# OpenRouter client (uses openai SDK with custom base_url)
# ---------------------------------------------------------------------------

class _OpenRouterClient:
    """Lightweight async wrapper around OpenRouter's OpenAI-compatible API."""

    def __init__(self, api_key: str, base_url: str, model: str):
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise ImportError(
                "The 'openai' package is required for OpenRouter support. "
                "Install it with: pip install openai"
            )
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            default_headers={
                "HTTP-Referer": "https://schoolflow.pro",
                "X-Title": "SchoolFlow Pro",
            },
        )
        self._model = model

    async def create(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        stream: bool = False,
    ):
        return await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=stream,
        )


class GroqService:
    """AI service with Groq (primary) and OpenRouter (fallback) support."""

    def __init__(self) -> None:
        # --- Groq client ---
        groq_key = settings.GROQ_API_KEY
        self._groq: Optional[AsyncGroq] = (
            AsyncGroq(api_key=groq_key) if groq_key else None
        )
        self._groq_model: str = settings.GROQ_MODEL

        # --- OpenRouter client ---
        or_key = settings.OPENROUTER_API_KEY
        self._openrouter: Optional[_OpenRouterClient] = None
        if or_key:
            try:
                self._openrouter = _OpenRouterClient(
                    api_key=or_key,
                    base_url=settings.OPENROUTER_BASE_URL,
                    model=settings.OPENROUTER_MODEL,
                )
                logger.info(
                    "OpenRouter AI provider configured (model=%s)",
                    settings.OPENROUTER_MODEL,
                )
            except ImportError as exc:
                logger.warning("OpenRouter disabled: %s", exc)

        self._max_tokens: int = settings.GROQ_MAX_TOKENS

        # Log provider status
        providers = []
        if self._groq:
            providers.append(f"Groq({self._groq_model})")
        if self._openrouter:
            providers.append(f"OpenRouter({settings.OPENROUTER_MODEL})")
        if providers:
            logger.info("AI providers active: %s", " -> ".join(providers))
        else:
            logger.warning(
                "No AI provider configured. Set GROQ_API_KEY or "
                "OPENROUTER_API_KEY to enable AI features."
            )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_available(self) -> bool:
        return self._groq is not None or self._openrouter is not None

    @property
    def _active_model_name(self) -> str:
        if self._groq:
            return self._groq_model
        if self._openrouter:
            return settings.OPENROUTER_MODEL
        return "none"

    async def _stream_completion(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Yield text chunks. Tries Groq first, falls back to OpenRouter."""
        if not self._is_available():
            yield (
                "⚠️ Service AI non disponible. Veuillez configurer "
                "GROQ_API_KEY ou OPENROUTER_API_KEY."
            )
            return

        tokens = max_tokens or self._max_tokens

        # --- Try Groq first ---
        if self._groq:
            try:
                response = await self._groq.chat.completions.create(
                    model=self._groq_model,
                    messages=messages,
                    max_tokens=tokens,
                    temperature=temperature,
                    stream=True,
                )
                async for chunk in response:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        yield delta.content
                return
            except GroqError as exc:
                logger.warning("Groq streaming failed, trying fallback: %s", exc)
            except Exception as exc:
                logger.warning("Groq streaming error, trying fallback: %s", exc)

        # --- Fallback to OpenRouter ---
        if self._openrouter:
            try:
                response = await self._openrouter.create(
                    messages=messages,
                    max_tokens=tokens,
                    temperature=temperature,
                    stream=True,
                )
                async for chunk in response:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        yield delta.content
                return
            except Exception as exc:
                logger.error("OpenRouter streaming also failed: %s", exc)

        yield "Erreur de connexion au service IA. Veuillez réessayer."

    async def _full_completion(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Return a structured dict with the full completion result."""
        fallback = {
            "content": (
                "⚠️ Service AI non disponible. Veuillez configurer "
                "GROQ_API_KEY ou OPENROUTER_API_KEY."
            ),
            "model": self._active_model_name,
            "provider": "none",
            "tokens": {"prompt": 0, "completion": 0, "total": 0},
        }

        if not self._is_available():
            return fallback

        tokens = max_tokens or self._max_tokens

        # --- Try Groq first ---
        if self._groq:
            try:
                response = await self._groq.chat.completions.create(
                    model=self._groq_model,
                    messages=messages,
                    max_tokens=tokens,
                    temperature=temperature,
                )
                usage = response.usage
                return {
                    "content": (
                        response.choices[0].message.content
                        if response.choices
                        else ""
                    ),
                    "model": response.model,
                    "provider": "groq",
                    "tokens": {
                        "prompt": usage.prompt_tokens if usage else 0,
                        "completion": usage.completion_tokens if usage else 0,
                        "total": usage.total_tokens if usage else 0,
                    },
                }
            except GroqError as exc:
                logger.warning("Groq completion failed, trying fallback: %s", exc)
            except Exception as exc:
                logger.warning("Groq completion error, trying fallback: %s", exc)

        # --- Fallback to OpenRouter ---
        if self._openrouter:
            try:
                response = await self._openrouter.create(
                    messages=messages,
                    max_tokens=tokens,
                    temperature=temperature,
                    stream=False,
                )
                usage = response.usage
                return {
                    "content": (
                        response.choices[0].message.content
                        if response.choices
                        else ""
                    ),
                    "model": response.model or settings.OPENROUTER_MODEL,
                    "provider": "openrouter",
                    "tokens": {
                        "prompt": usage.prompt_tokens if usage else 0,
                        "completion": usage.completion_tokens if usage else 0,
                        "total": usage.total_tokens if usage else 0,
                    },
                }
            except Exception as exc:
                logger.error("OpenRouter completion also failed: %s", exc)

        return {
            **fallback,
            "content": "Erreur de connexion au service IA. Veuillez réessayer.",
            "error": "all_providers_failed",
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def chat_completion(
        self,
        message: str,
        history: Optional[list[dict[str, str]]] = None,
        *,
        stream: bool = False,
        platform_name: str = "SchoolFlow Pro",
    ):
        """
        General-purpose chat for school management support.

        Args:
            message: The user message.
            history: Optional list of prior ``{"role": ..., "content": ...}`` dicts.
            stream: If True, returns an async generator of text chunks.
            platform_name: The display name of the platform.

        Returns:
            A structured dict (stream=False) or an async generator (stream=True).
        """
        system_prompt = CHAT_SYSTEM_PROMPT.format(platform_name=platform_name)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
        ]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": message})

        if stream:
            return self._stream_completion(messages, temperature=0.7)

        return await self._full_completion(messages, temperature=0.7)

    async def audit_analysis(
        self,
        module_description: str,
        data: Any,
        *,
        stream: bool = False,
        platform_name: str = "SchoolFlow Pro",
    ):
        """
        Audit analysis endpoint.

        Args:
            module_description: Human-readable description of the module being audited.
            data: The data payload to analyse (will be stringified).
            stream: If True, returns an async generator of text chunks.

        Returns:
            A structured dict (stream=False) or an async generator (stream=True).
        """
        import json

        data_str = (
            data
            if isinstance(data, str)
            else json.dumps(data, ensure_ascii=False, default=str)
        )

        user_message = (
            f"Module audité : {module_description}\n\n"
            f"Données à analyser :\n{data_str}\n\n"
            "Fournis un rapport d'audit structuré en français."
        )

        audit_prompt = AUDIT_SYSTEM_PROMPT.format(platform_name=platform_name)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": audit_prompt},
            {"role": "user", "content": user_message},
        ]

        if stream:
            return self._stream_completion(messages, temperature=0.3)

        return await self._full_completion(messages, temperature=0.3)


# Singleton instance
groq_service = GroqService()
