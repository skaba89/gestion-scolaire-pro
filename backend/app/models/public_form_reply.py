"""Réponses envoyées par un établissement à un message reçu via un formulaire de contact public
(2026-11-25). Historique conservé : auteur, date, texte, statut d'envoi (SENT / FAILED)."""
from sqlalchemy import Column, DateTime, ForeignKey, String, Text, func

from app.models.base import Base, GUID, UUIDMixin, TenantMixin

REPLY_SENT = "SENT"
REPLY_FAILED = "FAILED"


class PublicFormReply(Base, UUIDMixin, TenantMixin):
    __tablename__ = "public_form_replies"

    # CASCADE : effacer un message (RGPD) efface aussi les réponses qui le citent.
    submission_id = Column(GUID(), ForeignKey("public_form_submissions.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    author_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body = Column(Text, nullable=False)
    status = Column(String(16), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
