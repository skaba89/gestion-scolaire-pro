"""PublicPage model — customizable public pages per tenant."""
from sqlalchemy import Column, String, Boolean, JSON, Integer, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin


class PublicPage(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "public_pages"

    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, index=True)
    page_type = Column(String(50), nullable=False, default="CUSTOM")
    # page_type enum: ADMISSION, PROGRAMS, RESEARCH, CAMPUS, CONTACT, ABOUT, CUSTOM, HOME

    # Content stored as JSON — supports rich text, sections, images, etc.
    # Structure: { "sections": [{ "type": "...", "title": "...", "body": "...", "items": [...], "settings": {...} }] }
    content = Column(JSON, default=dict)

    template = Column(String(50), default="default")
    primary_color = Column(String(7))    # hex color, e.g. "#1e3a5f"
    secondary_color = Column(String(7))  # hex color override per page

    is_published = Column(Boolean, default=False, index=True)
    sort_order = Column(Integer, default=0)

    # SEO fields
    meta_title = Column(String(200))
    meta_description = Column(Text)

    # Navigation
    show_in_nav = Column(Boolean, default=True)
    nav_label = Column(String(100))

    # Relationship back to tenant
    tenant = relationship("Tenant", back_populates="public_pages")
