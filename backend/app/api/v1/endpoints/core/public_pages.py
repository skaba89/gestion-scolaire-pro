"""Public pages API endpoints.

Admin endpoints require authentication and appropriate roles.
Public endpoints are accessible without authentication.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from uuid import UUID
from datetime import datetime
import traceback
import logging

from app.core.database import get_db
from app.core.security import get_current_user
from app.utils.audit import log_audit
from app.schemas.public_pages import (
    PublicPageCreate,
    PublicPageUpdate,
    PublicPageResponse,
    PublicPageListItem,
    PublicPagePublicResponse,
    PublicPageNavResponse,
    PageReorderRequest,
)
from app.models.public_page import PublicPage
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


# ─── Role-based access helpers ────────────────────────────────────────

def _require_admin_or_director(current_user: dict):
    """Raise 403 if user is not TENANT_ADMIN or DIRECTOR."""
    roles = current_user.get("roles", [])
    if not any(r in ("TENANT_ADMIN", "DIRECTOR", "SUPER_ADMIN") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux TENANT_ADMIN ou DIRECTOR",
        )


def _require_staff_min(current_user: dict):
    """Raise 403 if user is not TENANT_ADMIN, DIRECTOR, or STAFF."""
    roles = current_user.get("roles", [])
    if not any(r in ("TENANT_ADMIN", "DIRECTOR", "STAFF", "SUPER_ADMIN") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux TENANT_ADMIN, DIRECTOR ou STAFF",
        )


def _get_tenant_id(current_user: dict, db: Session) -> UUID:
    """Resolve tenant_id from current user (token or DB fallback)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        from app.models.user import User
        user_id = current_user.get("id")
        if user_id:
            user_db = db.query(User).filter(User.id == user_id).first()
            if user_db:
                tenant_id = str(user_db.tenant_id)
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun tenant associé à cet utilisateur",
        )
    try:
        return UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID tenant invalide",
        )


# ─── Admin router (requires auth) ─────────────────────────────────────

admin_router = APIRouter()


@admin_router.post("/", response_model=PublicPageResponse, status_code=status.HTTP_201_CREATED)
async def create_public_page(
    page_in: PublicPageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new public page for the current tenant.
    Requires TENANT_ADMIN, DIRECTOR, or STAFF role.
    """
    _require_staff_min(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    try:
        # Check slug uniqueness within tenant
        existing = db.query(PublicPage).filter(
            PublicPage.tenant_id == tenant_id,
            PublicPage.slug == page_in.slug,
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Ce slug est déjà utilisé pour une page de ce tenant",
            )

        page = PublicPage(
            tenant_id=tenant_id,
            title=page_in.title,
            slug=page_in.slug,
            page_type=page_in.page_type,
            content=page_in.content or {"sections": []},
            template=page_in.template or "default",
            primary_color=page_in.primary_color,
            secondary_color=page_in.secondary_color,
            is_published=page_in.is_published,
            sort_order=page_in.sort_order,
            meta_title=page_in.meta_title,
            meta_description=page_in.meta_description,
            show_in_nav=page_in.show_in_nav,
            nav_label=page_in.nav_label,
        )
        db.add(page)
        db.commit()
        db.refresh(page)

        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="CREATE_PUBLIC_PAGE",
            resource_type="PUBLIC_PAGE",
            resource_id=page.id,
            details={"title": page.title, "slug": page.slug, "page_type": page.page_type},
        )

        return page
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating public page: %s", e, exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Erreur interne lors de la création de la page",
        )


@admin_router.get("/", response_model=List[PublicPageListItem])
async def list_public_pages(
    page_type: str | None = None,
    is_published: bool | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List all pages for the current tenant (including drafts).
    Supports filtering by page_type and is_published.
    Requires TENANT_ADMIN, DIRECTOR, or STAFF role.
    """
    _require_staff_min(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    query = db.query(PublicPage).filter(PublicPage.tenant_id == tenant_id)

    if page_type:
        query = query.filter(PublicPage.page_type == page_type.upper())
    if is_published is not None:
        query = query.filter(PublicPage.is_published == is_published)

    pages = query.order_by(PublicPage.sort_order, PublicPage.created_at).all()
    return pages


@admin_router.get("/nav/", response_model=List[PublicPageNavResponse])
async def list_nav_pages(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List pages that should appear in the navigation menu.
    Only includes published pages where show_in_nav=True.
    """
    _require_staff_min(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    pages = (
        db.query(PublicPage)
        .filter(
            PublicPage.tenant_id == tenant_id,
            PublicPage.is_published == True,
            PublicPage.show_in_nav == True,
        )
        .order_by(PublicPage.sort_order)
        .all()
    )
    return pages


@admin_router.get("/{page_id}/", response_model=PublicPageResponse)
async def get_public_page(
    page_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get a single page by ID (admin view, includes draft info).
    Requires TENANT_ADMIN, DIRECTOR, or STAFF role.
    """
    _require_staff_min(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    page = db.query(PublicPage).filter(
        PublicPage.id == page_id,
        PublicPage.tenant_id == tenant_id,
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")
    return page


@admin_router.put("/{page_id}/", response_model=PublicPageResponse)
async def update_public_page(
    page_id: UUID,
    page_in: PublicPageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Update an existing public page.
    Requires TENANT_ADMIN or DIRECTOR role.
    """
    _require_admin_or_director(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    page = db.query(PublicPage).filter(
        PublicPage.id == page_id,
        PublicPage.tenant_id == tenant_id,
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    try:
        # Build update dict from non-None fields
        update_data = page_in.model_dump(exclude_unset=True)

        # Check slug uniqueness if slug is being changed
        new_slug = update_data.get("slug")
        if new_slug and new_slug != page.slug:
            existing = db.query(PublicPage).filter(
                PublicPage.tenant_id == tenant_id,
                PublicPage.slug == new_slug,
                PublicPage.id != page_id,
            ).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="Ce slug est déjà utilisé pour une autre page",
                )

        for field, value in update_data.items():
            if field == "content":
                setattr(page, field, value)
                flag_modified(page, "content")
            else:
                setattr(page, field, value)

        page.updated_at = datetime.now()
        db.commit()
        db.refresh(page)

        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="UPDATE_PUBLIC_PAGE",
            resource_type="PUBLIC_PAGE",
            resource_id=page.id,
            details={"title": page.title, "updated_fields": list(update_data.keys())},
        )

        return page
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating public page: %s", e, exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Erreur interne lors de la mise à jour de la page",
        )


@admin_router.delete("/{page_id}/", status_code=status.HTTP_200_OK)
async def delete_public_page(
    page_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a public page.
    Requires TENANT_ADMIN or DIRECTOR role.
    """
    _require_admin_or_director(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    page = db.query(PublicPage).filter(
        PublicPage.id == page_id,
        PublicPage.tenant_id == tenant_id,
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    page_title = page.title

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="DELETE_PUBLIC_PAGE",
        resource_type="PUBLIC_PAGE",
        resource_id=page.id,
        details={"title": page_title, "slug": page.slug},
    )

    db.delete(page)
    db.commit()

    return {"detail": "Page supprimée avec succès"}


@admin_router.post("/reorder/", status_code=status.HTTP_200_OK)
async def reorder_public_pages(
    reorder_in: PageReorderRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Reorder pages by updating sort_order for multiple pages.
    Requires TENANT_ADMIN or DIRECTOR role.
    """
    _require_admin_or_director(current_user)
    tenant_id = _get_tenant_id(current_user, db)

    try:
        updated_count = 0
        for item in reorder_in.pages:
            page = db.query(PublicPage).filter(
                PublicPage.id == item.page_id,
                PublicPage.tenant_id == tenant_id,
            ).first()
            if page:
                page.sort_order = item.sort_order
                page.updated_at = datetime.now()
                updated_count += 1
            else:
                logger.warning(
                    f"Reorder: page {item.page_id} not found in tenant {tenant_id}"
                )

        db.commit()

        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="REORDER_PUBLIC_PAGES",
            resource_type="PUBLIC_PAGE",
            resource_id=None,
            details={"updated_count": updated_count},
        )

        return {
            "detail": f"{updated_count} page(s) réordonnée(s) avec succès",
            "updated_count": updated_count,
        }
    except Exception as e:
        logger.error("Error reordering public pages: %s", e, exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Erreur interne lors du réordonnancement",
        )


# ─── Public router (NO auth required) ─────────────────────────────────

public_router = APIRouter()


@public_router.get("/{tenant_slug}/pages/", response_model=List[PublicPageListItem])
async def list_published_pages_public(
    tenant_slug: str,
    db: Session = Depends(get_db),
):
    """
    List published pages for a tenant by slug (public, no auth required).
    Only returns published pages ordered by sort_order.
    """
    tenant = db.query(Tenant).filter(
        Tenant.slug == tenant_slug,
        Tenant.is_active == True,
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    pages = (
        db.query(PublicPage)
        .filter(
            PublicPage.tenant_id == tenant.id,
            PublicPage.is_published == True,
        )
        .order_by(PublicPage.sort_order, PublicPage.created_at)
        .all()
    )
    return pages


@public_router.get("/{tenant_slug}/nav/", response_model=List[PublicPageNavResponse])
async def list_nav_pages_public(
    tenant_slug: str,
    db: Session = Depends(get_db),
):
    """
    Get navigation menu items for a tenant by slug (public, no auth required).
    Only includes published pages where show_in_nav=True.
    """
    tenant = db.query(Tenant).filter(
        Tenant.slug == tenant_slug,
        Tenant.is_active == True,
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    pages = (
        db.query(PublicPage)
        .filter(
            PublicPage.tenant_id == tenant.id,
            PublicPage.is_published == True,
            PublicPage.show_in_nav == True,
        )
        .order_by(PublicPage.sort_order)
        .all()
    )
    return pages


@public_router.get("/{tenant_slug}/pages/{page_slug}/", response_model=PublicPagePublicResponse)
async def get_published_page_public(
    tenant_slug: str,
    page_slug: str,
    db: Session = Depends(get_db),
):
    """
    Get a single published page by tenant slug + page slug (public, no auth required).
    Returns 404 if the page is not published or not found.
    """
    tenant = db.query(Tenant).filter(
        Tenant.slug == tenant_slug,
        Tenant.is_active == True,
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    page = db.query(PublicPage).filter(
        PublicPage.tenant_id == tenant.id,
        PublicPage.slug == page_slug,
        PublicPage.is_published == True,
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    return page
