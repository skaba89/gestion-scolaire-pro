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

    # Content stored as JSON — a LIST of sections (widgets), not an object:
    # [{ "type": "hero"|"text"|"features"|"stats"|"gallery"|"cta"|"faq"|
    #    "contact_form"|"testimonials"|"timeline"|"custom_html",
    #    "title": "...", "subtitle": "...", "content": "...",
    #    "items": [...], "settings": {...} }, ...]
    # (see PublicPageSection in src/hooks/usePublicPages.ts and the section
    # renderers in src/pages/public/PublicPageView.tsx — the actual code
    # that reads this field always does page.content.map(...), i.e. treats
    # it as an array. The schema previously typed it as Dict[str, Any],
    # which Pydantic rejects any list payload against — saving real
    # section content has never actually worked; default=dict below is a
    # leftover from that and now only matters for brand-new rows before
    # the app ever writes to them.)
    content = Column(JSON, default=list)

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
