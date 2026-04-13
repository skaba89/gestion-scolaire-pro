"""Pydantic schemas for public pages."""
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, field_validator
from uuid import UUID
from datetime import datetime


# ─── Enums / Constants ────────────────────────────────────────────────

VALID_PAGE_TYPES = {
    "ADMISSION", "PROGRAMS", "RESEARCH", "CAMPUS", "CONTACT", "ABOUT", "CUSTOM", "HOME",
}


# ─── Request schemas ──────────────────────────────────────────────────

class PublicPageCreate(BaseModel):
    """Schema for creating a new public page."""
    title: str
    slug: str
    page_type: str = "CUSTOM"
    content: Optional[Dict[str, Any]] = None
    template: Optional[str] = "default"
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    is_published: bool = False
    sort_order: int = 0
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: bool = True
    nav_label: Optional[str] = None

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
    content: Optional[Dict[str, Any]] = None
    template: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    is_published: Optional[bool] = None
    sort_order: Optional[int] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: Optional[bool] = None
    nav_label: Optional[str] = None

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
    content: Optional[Dict[str, Any]] = {}
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
    content: Optional[Dict[str, Any]] = {}
    template: Optional[str] = "default"
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    show_in_nav: bool = True
    nav_label: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicPageNavResponse(BaseModel):
    """Navigation item for public nav menus."""
    id: UUID
    title: str
    slug: str
    nav_label: Optional[str] = None
    page_type: str
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)
