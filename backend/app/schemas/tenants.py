from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class TenantBase(BaseModel):
    name: str
    slug: str
    type: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class TenantCreate(TenantBase):
    country: Optional[str] = "GN"
    currency: Optional[str] = "GNF"
    academic_year_start: Optional[datetime] = None
    academic_year_end: Optional[datetime] = None
    levels: Optional[List[str]] = None
    terms: Optional[List[Dict[str, Any]]] = None


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    is_active: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None


class TenantResponse(TenantBase):
    id: UUID
    currency: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool
    settings: Optional[Dict[str, Any]] = {}
    # Extra fields for super admin views
    student_count: Optional[int] = None
    user_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class TenantWithAdminCreate(BaseModel):
    """Schema for creating a tenant along with its first admin user (SUPER_ADMIN only)."""
    # Tenant fields
    name: str
    slug: str
    type: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = "GN"
    currency: Optional[str] = "GNF"
    levels: Optional[List[str]] = None
    # Admin user fields
    admin_email: str
    admin_first_name: str
    admin_last_name: str
    admin_password: str


class TenantAdminUserCreate(BaseModel):
    """Schema for creating an admin user for an existing tenant (SUPER_ADMIN only)."""
    email: str
    first_name: str
    last_name: str
    password: str
    role: str = "TENANT_ADMIN"


class TenantLandingAnnouncement(BaseModel):
    """A single announcement shown on the tenant landing page."""
    title: str
    body: str
    date: Optional[str] = None
    is_pinned: bool = False
    category: Optional[str] = None


class TenantLandingSettings(BaseModel):
    """Structured landing page settings stored inside Tenant.settings['landing']."""
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    description: Optional[str] = None
    primary_color: str = "#1e3a5f"
    secondary_color: Optional[str] = None
    custom_domain: Optional[str] = None
    show_stats: bool = True
    show_programs: bool = True
    gallery: List[str] = []
    announcements: List[TenantLandingAnnouncement] = []
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    facebook_url: Optional[str] = None
    twitter_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class TenantPublicCard(BaseModel):
    """Lightweight tenant representation used in public directory listings."""
    id: UUID
    name: str
    slug: str
    type: str
    address: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    primary_color: str = "#1e3a5f"

    model_config = ConfigDict(from_attributes=True)


class TenantPublicStats(BaseModel):
    """Aggregate statistics shown on a tenant landing page."""
    student_count: int = 0
    teacher_count: int = 0


class TenantPublicResponse(BaseModel):
    """Full public data for a tenant landing page."""
    id: UUID
    name: str
    slug: str
    type: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    is_active: bool
    landing: TenantLandingSettings
    stats: TenantPublicStats
    programs: List[Any] = []
    departments: List[Any] = []
    announcements: List[TenantLandingAnnouncement] = []

    model_config = ConfigDict(from_attributes=True)
