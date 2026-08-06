"""Pydantic schemas for public pages."""
import re
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from uuid import UUID
from datetime import datetime


# ─── Enums / Constants ────────────────────────────────────────────────

VALID_PAGE_TYPES = {
    "ADMISSION", "PROGRAMS", "RESEARCH", "CAMPUS", "CONTACT", "ABOUT", "CUSTOM", "HOME",
}


# ─── Request schemas ──────────────────────────────────────────────────

class PublicPageCreate(BaseModel):
    """Schema for creating a new public page.

    Phase 3 security note (custom_html sections): `content` is stored
    as-is — the backend does NOT sanitize section HTML on write. Only a
    tenant's own admin/director can write it (see require_permission on
    the public-pages router), so this is not visitor-facing input, but the
    HTML it contains IS rendered to every anonymous visitor of the
    published page. The sanitization boundary is therefore entirely
    client-side, at render time: PublicPageView.tsx's CustomHTMLSection
    (and TextSection) pipe `section.content` through sanitizeHtml()
    (src/lib/sanitize.ts, DOMPurify) before dangerouslySetInnerHTML —
    never render this content directly from the API response.
    """
    title: str
    slug: str
    page_type: str = "CUSTOM"
    # A page's real content is a list of sections ({type, title, ...}, see
    # PublicPageSection on the frontend) — this was typed as a bare
    # Dict[str, Any] (an object), which Pydantic rejects any list payload
    # against with a 422. The admin editor's raw JSON textarea defaulted to
    # "{}" and was never actually exercised with real section data, so
    # nothing caught this: saving a real page's content has never worked.
    content: Optional[List[Dict[str, Any]]] = None
    template: Optional[str] = "default"
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    is_published: bool = False
    sort_order: int = 0
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: bool = True
    nav_label: Optional[str] = None

    @field_validator("content", mode="before")
    @classmethod
    def coerce_legacy_content(cls, v):
        """Tolerate a stale cached frontend build still sending `{}` during
        rollout, rather than 422ing — same rationale as the response-side
        coercion (see PublicPageResponse)."""
        if v is not None and not isinstance(v, list):
            return []
        return v

    @field_validator("page_type")
    @classmethod
    def validate_page_type(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in VALID_PAGE_TYPES:
            raise ValueError(f"Invalid page_type. Must be one of: {', '.join(sorted(VALID_PAGE_TYPES))}")
        return v_upper

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        # Allow lowercase alphanumeric, hyphens, and underscores
        slug = v.strip().lower()
        if not slug:
            raise ValueError("Slug cannot be empty")
        return slug

    @field_validator("primary_color", "secondary_color", mode="before")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("Color must be a valid hex string, e.g. '#1e3a5f'")
        return v


class PublicPageUpdate(BaseModel):
    """Schema for updating an existing public page (all fields optional)."""
    title: Optional[str] = None
    slug: Optional[str] = None
    page_type: Optional[str] = None
    content: Optional[List[Dict[str, Any]]] = None
    template: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    is_published: Optional[bool] = None
    sort_order: Optional[int] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: Optional[bool] = None
    nav_label: Optional[str] = None

    @field_validator("content", mode="before")
    @classmethod
    def coerce_legacy_content(cls, v):
        """See PublicPageCreate.coerce_legacy_content."""
        if v is not None and not isinstance(v, list):
            return []
        return v

    @field_validator("page_type")
    @classmethod
    def validate_page_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v_upper = v.upper()
        if v_upper not in VALID_PAGE_TYPES:
            raise ValueError(f"Invalid page_type. Must be one of: {', '.join(sorted(VALID_PAGE_TYPES))}")
        return v_upper

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        slug = v.strip().lower()
        if not slug:
            raise ValueError("Slug cannot be empty")
        return slug

    @field_validator("primary_color", "secondary_color", mode="before")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("Color must be a valid hex string, e.g. '#1e3a5f'")
        return v


class PageReorderItem(BaseModel):
    """Single item in a reorder request."""
    page_id: UUID
    sort_order: int


class PageReorderRequest(BaseModel):
    """Schema for reordering multiple pages."""
    pages: List[PageReorderItem]


# ─── Response schemas ─────────────────────────────────────────────────

class PublicPageResponse(BaseModel):
    """Full page response for admin endpoints."""
    id: UUID
    tenant_id: UUID
    title: str
    slug: str
    page_type: str
    content: Optional[List[Dict[str, Any]]] = []
    template: Optional[str] = "default"
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    is_published: bool = False
    sort_order: int = 0
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: bool = True
    nav_label: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("content", mode="before")
    @classmethod
    def coerce_legacy_content(cls, v):
        """Pages saved before this fix (content was typed as a bare
        Dict[str, Any]) have `{}` stored in the JSON column — validating
        that against List[...] would 500 on every pre-existing page.
        Treat any non-list value as "no sections yet" instead of crashing."""
        if not isinstance(v, list):
            return []
        return v


class PublicPageListItem(BaseModel):
    """Lightweight page response for list endpoints."""
    id: UUID
    title: str
    slug: str
    page_type: str
    template: Optional[str] = "default"
    is_published: bool = False
    sort_order: int = 0
    show_in_nav: bool = True
    nav_label: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicPagePublicResponse(BaseModel):
    """Public-facing page response (no tenant_id, only published content)."""
    id: UUID
    title: str
    slug: str
    page_type: str
    content: Optional[List[Dict[str, Any]]] = []
    template: Optional[str] = "default"
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: bool = True
    nav_label: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("content", mode="before")
    @classmethod
    def coerce_legacy_content(cls, v):
        """See PublicPageResponse.coerce_legacy_content."""
        if not isinstance(v, list):
            return []
        return v


class PublicPageNavResponse(BaseModel):
    """Navigation item for public nav menus."""
    id: UUID
    title: str
    slug: str
    nav_label: Optional[str] = None
    page_type: str
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


# ─── Form submissions ("contact_form" widget) ─────────────────────────
#
# Hardened per the Phase 1 security pass: this is the one endpoint in the
# whole public-pages surface that accepts free-text from an anonymous,
# unauthenticated visitor with no rate-limit-by-account to fall back on
# (there is no account). Every constraint below exists to stop a specific
# abuse pattern, not as generic paranoia — see the comment on each field.

_URL_PATTERN = re.compile(r"(https?://|www\.)", re.IGNORECASE)


def _repetition_ratio(text_value: str) -> float:
    """Fraction of the message made up of its single most common
    non-whitespace character — "aaaaaaaaaaaaaaaa" scores ~1.0, ordinary
    prose scores well under 0.3. Cheap, dependency-free heuristic against
    the most common bot-spam shape (keyboard-mashing / filler spam) —
    intentionally not a full spam classifier."""
    chars = [c for c in text_value.lower() if not c.isspace()]
    if len(chars) < 12:
        return 0.0
    counts: Dict[str, int] = {}
    for c in chars:
        counts[c] = counts.get(c, 0) + 1
    return max(counts.values()) / len(chars)


class PublicFormSubmissionCreate(BaseModel):
    """Payload a visitor submits from a page's contact_form section."""
    page_id: Optional[UUID] = None
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    subject: Optional[str] = Field(default=None, max_length=300)
    message: str = Field(min_length=10, max_length=5000)

    # Honeypot: a field real visitors never see or fill (hidden via CSS on
    # the form, see ContactFormSection) but that unsophisticated bots
    # filling every input in the DOM do. Anything but empty here means
    # "not a human" — checked by the endpoint, not a validator, so it can
    # short-circuit to a silent success without ever touching the DB or
    # revealing that detection happened.
    website: Optional[str] = Field(default=None, max_length=200)

    # Future-ready, not enforced yet: if/when a captcha provider (e.g.
    # hCaptcha/Turnstile) is wired in, the endpoint can start requiring
    # and verifying this token without another schema migration. Accepting
    # but ignoring it today is intentionally forward-compatible with a
    # frontend that already sends one.
    captcha_token: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("name", "message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field cannot be empty")
        return v

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("phone", "subject", "website", "captcha_token")
    @classmethod
    def strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @field_validator("message")
    @classmethod
    def reject_spam_shape(cls, v: str) -> str:
        if len(_URL_PATTERN.findall(v)) > 2:
            raise ValueError("Too many links in message")
        if _repetition_ratio(v) > 0.6:
            raise ValueError("Message looks automated (repetitive content)")
        return v


class PublicFormSubmissionResponse(BaseModel):
    """Admin-facing view of a received submission."""
    id: UUID
    page_id: Optional[UUID] = None
    name: str
    email: str
    phone: Optional[str] = None
    subject: Optional[str] = None
    message: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
