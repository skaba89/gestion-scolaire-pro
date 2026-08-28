"""Tenant model"""
from sqlalchemy import Column, String, Boolean, JSON, Text, DateTime
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class Tenant(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tenants"

    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    type = Column(String(50), nullable=False)  # primary, middle, high, university, training
    country = Column(String(2), nullable=False, default="GN")  # ISO country code
    currency = Column(String(3), default="GNF")  # ISO currency code
    timezone = Column(String(50), default="Africa/Conakry")
    email = Column(String(255))
    phone = Column(String(50))
    address = Column(String(500))
    website = Column(String(255))
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)

    # ── Stripe Billing ─────────────────────────────────────────────────────────
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    # plan: "starter" | "pro" | "enterprise"
    subscription_plan = Column(String(50), nullable=True, default="starter")
    # status mirrors Stripe: "trialing" | "active" | "past_due" | "canceled" | "unpaid"
    subscription_status = Column(String(50), nullable=True, default="trialing")
    trial_ends_at = Column(DateTime, nullable=True)
    billing_email = Column(String(255), nullable=True)

    # Signature / official document fields
    director_name = Column(String(255))
    director_signature_url = Column(String(500))
    secretary_name = Column(String(255))
    secretary_signature_url = Column(String(500))
    city = Column(String(255))
    # National audit Phase 2: minimal geographic grouping above the tenant
    # itself, so a future ministry dashboard can aggregate by region without
    # needing the full Pays/Préfecture/Commune/Académie hierarchy — added
    # progressively per the audit's own rule against a one-shot RBAC/model
    # overhaul. Free text (not an enum/FK) deliberately: each country's
    # administrative regions differ, and validating against a fixed list
    # would block onboarding for the very first non-Guinea tenant.
    region = Column(String(100), nullable=True, index=True)
    # National audit Phase 5: next level down the same deliberately-additive
    # hierarchy as `region` above — free text, nullable, indexed. Enables
    # PREFECTURE_ADMIN/COMMUNE_ADMIN narrowing in ministry.py.
    prefecture = Column(String(100), nullable=True, index=True)
    commune = Column(String(100), nullable=True, index=True)

    # Relationships
    #
    # passive_deletes=True sur les trois : sans ça, SQLAlchemy charge la
    # collection enfant en mémoire au moment de `db.delete(tenant)` et lui
    # applique SA PROPRE logique de "détachement" — un UPDATE qui met
    # tenant_id à NULL sur chaque ligne enfant déjà trackée — AVANT même
    # que la suppression de la ligne parente n'atteigne la base et ne
    # déclenche le vrai ON DELETE CASCADE de Postgres. Comme tenant_id est
    # NOT NULL partout (TenantMixin, app/models/base.py), cet UPDATE échoue
    # avec une violation NOT NULL — pas une violation de clé étrangère,
    # d'où l'errance de diagnostic (2026-08-27/28, PR #134/#135/#136) :
    # la contrainte CASCADE en base a toujours été correcte, le vrai
    # problème était entièrement côté ORM, jamais côté schéma.
    #
    # Ce bug ne s'est jamais manifesté avant sur `users`/`students` très
    # probablement parce qu'aucun tenant supprimé jusqu'ici n'avait de
    # lignes réelles dans ces deux tables au moment de sa suppression —
    # mais le même déclencheur (SQLAlchemy chargeant puis nullifiant la
    # collection) s'y appliquerait identiquement dès qu'un tenant avec de
    # vrais users/students serait supprimé. Corrigé ici de façon
    # préventive sur les trois relations, pas seulement public_pages.
    #
    # passive_deletes=True dit à SQLAlchemy : ne charge pas la collection,
    # ne fais rien toi-même, fais confiance au ON DELETE CASCADE déjà en
    # place au niveau de la contrainte FK (TenantMixin.tenant_id,
    # ondelete="CASCADE") pour que Postgres s'en charge nativement.
    users = relationship("User", back_populates="tenant", passive_deletes=True)
    students = relationship("Student", back_populates="tenant", passive_deletes=True)
    public_pages = relationship(
        "PublicPage", back_populates="tenant", order_by="PublicPage.sort_order", passive_deletes=True
    )
