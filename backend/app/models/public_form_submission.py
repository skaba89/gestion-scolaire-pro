"""Storage for public "contact_form" widget submissions.

ContactFormSection (the public-facing form rendered from a page's
"contact_form" section) previously only called setSubmitted(true) client
-side — the message was never sent anywhere (see the "In a real
implementation, this would POST to an API" comment it left behind).
Every visitor who filled out a contact form believed they'd reached the
school; nothing was ever received.
"""
from sqlalchemy import Boolean, Column, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class PublicFormSubmission(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "public_form_submissions"

    # SET NULL rather than CASCADE: deleting the page that hosted the form
    # shouldn't destroy messages a school has already received through it.
    page_id = Column(GUID(), ForeignKey("public_pages.id", ondelete="SET NULL"), nullable=True, index=True)

    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    subject = Column(String(500), nullable=True)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)

    # RGPD (Phase 5): a non-reversible, tenant-scoped hash of the
    # submitter's IP (see _hash_ip in public_pages.py — same sha256(value +
    # scope + pepper) pattern as hash_external_sender() for WhatsApp).
    # Kept only for abuse investigation (e.g. "who is spamming us"); never
    # the raw IP, and optional — existing rows keep this NULL.
    source_ip_hash = Column(String(32), nullable=True)

    page = relationship("PublicPage")
