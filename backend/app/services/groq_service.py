"""
Groq AI Service for SchoolFlow Pro.

Provides chat completion and audit analysis capabilities
powered by Groq's fast inference API.
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
    "et JAMAIS \"SchoolFlow Pro\".\n"
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


class GroqService:
    """Thin wrapper around the Groq client for SchoolFlow Pro AI features."""

    def __init__(self) -> None:
        api_key = settings.GROQ_API_KEY
        if not api_key:
            logger.warning(
                "GROQ_API_KEY is not configured. "
                "AI features will return fallback responses. "
                "Set the GROQ_API_KEY environment variable to enable Groq."
            )
        self._client: Optional[AsyncGroq] = (
            AsyncGroq(api_key=api_key) if api_key else None
        )
        self._model: str = settings.GROQ_MODEL
        self._max_tokens: int = settings.GROQ_MAX_TOKENS

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_available(self) -> bool:
        return self._client is not None

    async def _stream_completion(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Yield text chunks from a streaming Groq completion."""
        if not self._is_available():
            yield (
                "⚠️ Service AI non disponible. Veuillez configurer la clé "
                "API Groq (GROQ_API_KEY) pour utiliser cette fonctionnalité."
            )
            return

        try:
            response = await self._client.chat.completions.create(  # type: ignore[union-attr]
                model=self._model,
                messages=messages,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature,
                stream=True,
            )
            async for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except GroqError as exc:
            logger.error("Groq API error during streaming: %s", exc)
            yield f"❌ Erreur de connexion au service IA : {exc}"
        except Exception as exc:
            logger.exception("Unexpected error during Groq streaming")
            yield f"❌ Erreur inattendue : {exc}"

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
                "⚠️ Service AI non disponible. Veuillez configurer la clé "
                "API Groq (GROQ_API_KEY) pour utiliser cette fonctionnalité."
            ),
            "model": self._model,
            "tokens": {"prompt": 0, "completion": 0, "total": 0},
        }

        if not self._is_available():
            return fallback

        try:
            response = await self._client.chat.completions.create(  # type: ignore[union-attr]
                model=self._model,
                messages=messages,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature,
            )
            usage = response.usage
            return {
                "content": response.choices[0].message.content if response.choices else "",
                "model": response.model,
                "tokens": {
                    "prompt": usage.prompt_tokens if usage else 0,
                    "completion": usage.completion_tokens if usage else 0,
                    "total": usage.total_tokens if usage else 0,
                },
            }
        except GroqError as exc:
            logger.error("Groq API error: %s", exc)
            return {
                **fallback,
                "content": f"❌ Erreur de connexion au service IA : {exc}",
                "error": str(exc),
            }
        except Exception as exc:
            logger.exception("Unexpected error during Groq completion")
            return {
                **fallback,
                "content": f"❌ Erreur inattendue : {exc}",
                "error": str(exc),
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
            platform_name: The display name of the platform (tenant or "SchoolFlow Pro").

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

        data_str = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, default=str)

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
