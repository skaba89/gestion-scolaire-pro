import re
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID
from datetime import datetime

# Le slug devient le segment d'URL /:tenantSlug qui identifie
# l'établissement dans toute l'app (login, pages publiques, annuaire —
# voir src/App.tsx). Jusqu'ici aucune validation de format n'existait ni
# côté frontend (CreateTenant.tsx laissait le champ libre en édition
# manuelle) ni ici : un slug contenant une URL complète collée par erreur
# passait tel quel, rendant l'établissement définitivement inaccessible
# via /:slug une fois créé (incident réel — signalé par un utilisateur,
# capture d'écran montrant /https.www.udm.com). DNS-label-like : minuscules,
# chiffres, tirets, ni tiret ni chiffre en tête/fin de segment consécutif.
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def validate_tenant_slug(v: str) -> str:
    slug = v.strip().lower()
    if not slug:
        raise ValueError("Le slug ne peut pas être vide.")
    if len(slug) > 63:
        raise ValueError("Le slug ne peut pas dépasser 63 caractères.")
    if not SLUG_PATTERN.match(slug):
        raise ValueError(
            "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets "
            "(ex. \"universite-la-source\") — pas d'URL, d'espace ni de caractère spécial."
        )
    return slug


class TenantBase(BaseModel):
    # NE PAS ajouter le validateur de format ici : TenantResponse hérite
    # aussi de TenantBase (voir plus bas), et FastAPI applique les
    # validateurs Pydantic à la SÉRIALISATION de sortie autant qu'à
    # l'entrée. Un tenant existant portant un slug déjà non conforme
    # (créé avant ce correctif, ou legacy) ferait alors planter n'importe
    # quel endpoint qui le renvoie avec un ResponseValidationError/500 —
    # reproduit en local en testant ce correctif avant de l'expédier.
    # Le validateur va uniquement sur les schémas d'ÉCRITURE
    # (TenantCreate, TenantWithAdminCreate) plus bas.
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

    @field_validator("slug")
    @classmethod
    def _validate_slug(cls, v: str) -> str:
        return validate_tenant_slug(v)


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
    timezone: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    prefecture: Optional[str] = None
    commune: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)
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
    # Admin user fields — no password field by design: SUPER_ADMIN never
    # sets or sees the establishment admin's credential, only triggers an
    # emailed activation link (see create_tenant_with_admin()).
    admin_email: str
    admin_first_name: str
    admin_last_name: str

    @field_validator("slug")
    @classmethod
    def _validate_slug(cls, v: str) -> str:
        return validate_tenant_slug(v)


class TenantAdminUserCreate(BaseModel):
    """Schema for creating an admin user for an existing tenant (SUPER_ADMIN only).

    No password field by design — see create_tenant_admin_user()."""
    email: str
    first_name: str
    last_name: str
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
    gallery: List[str] = Field(default_factory=list)
    announcements: List[TenantLandingAnnouncement] = Field(default_factory=list)
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
    programs: List[Any] = Field(default_factory=list)
    departments: List[Any] = Field(default_factory=list)
    announcements: List[TenantLandingAnnouncement] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
